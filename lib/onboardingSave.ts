// Sparflödet för "Fyll i dina uppgifter" (app/auth/confirm) och liknande
// onboarding. Ren funktion utan DOM, så den går att testa utan webbläsare.
// Supabase-klienten och fetch skickas in som parametrar.
//
// Ordning, och varför:
// 1. Validera allt innan vi sparar något.
// 2. Spara profiluppgifter UTAN onboarding_done. Får köras om hur många
//    gånger som helst – ingen risk även om ett senare steg misslyckas.
// 3. Sätt lösenordet, idempotent: om kontot redan har ett lösenord (från ett
//    tidigare delvis misslyckat försök, eller satt av en admin) försöker vi
//    en gång till med current_password. Detta har låst ute konton tidigare
//    när det INTE var idempotent – se buggrapporten.
// 4. Godkänn medlemskapet i länkens församling, om någon. Ett 403 (t.ex.
//    borttagen inbjudan) stoppar inte resten av flödet.
// 5. Sätt onboarding_done = true sist, efter att allt annat är klart.
// 6. Hämta väntande inbjudningar så att sidan vet om nästa steg är
//    "invites" eller "done".
import { checkPassword, passwordErrorToSwedish } from '@/lib/passwordRules'

export interface OnboardingProfileInput {
  phone: string
  birthYear: string
  ecName: string
  ecPhone: string
  password: string
  password2: string
}

/** Det minimum av Supabase-klienten som flödet behöver. Gör funktionen testbar utan en riktig klient. */
export interface OnboardingSupabaseClient {
  auth: {
    updateUser: (attrs: { password: string; current_password?: string }) => Promise<{
      error: { code?: string | null; message?: string | null; reasons?: string[] | null } | null
    }>
  }
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: unknown) => PromiseLike<{ error: { message: string } | null }>
    }
  }
}

export interface OnboardingSaveParams {
  supabase: OnboardingSupabaseClient
  fetchFn: typeof fetch
  userId: string
  /** Församlingen i inbjudningslänken (?church=), eller null om ingen. */
  churchId: number | null
  input: OnboardingProfileInput
}

export interface OnboardingSaveSuccess {
  ok: true
  /** Kontot hade redan ett ANNAT lösenord. Visa en notis om att be om nytt lösenord. */
  passwordAlreadySet: boolean
  /** ?church-inbjudan kunde inte godkännas automatiskt (t.ex. 403, borttagen inbjudan). */
  membershipAcceptFailed: boolean
  /** Det finns fler väntande inbjudningar kvar att godkänna. */
  hasPendingInvites: boolean
}
export interface OnboardingSaveFailure {
  ok: false
  error: string
}
export type OnboardingSaveResult = OnboardingSaveSuccess | OnboardingSaveFailure

/** Steg a: validerar hela inmatningen, inklusive lösenordsreglerna. Returnerar felmeddelande, eller null om allt är giltigt. */
export function validateOnboardingInput(input: OnboardingProfileInput): string | null {
  if (!input.phone.trim()) return 'Ange ditt telefonnummer.'

  const year = Number(input.birthYear)
  if (!input.birthYear.trim() || Number.isNaN(year) || year < 1900 || year > 2015) {
    return 'Ange ett giltigt födelseår (t.ex. 1990).'
  }

  if (!input.ecName.trim()) return 'Ange namn på din kontaktperson.'
  if (!input.ecPhone.trim()) return 'Ange telefonnummer till din kontaktperson.'

  if (input.password !== input.password2) return 'Lösenorden matchar inte.'

  const unmet = checkPassword(input.password)
  if (unmet.length) {
    return `Lösenordet uppfyller inte alla krav: ${unmet.map(r => r.label.toLowerCase()).join(', ')}.`
  }

  return null
}

export async function saveOnboarding({
  supabase,
  fetchFn,
  userId,
  churchId,
  input,
}: OnboardingSaveParams): Promise<OnboardingSaveResult> {
  // a. Validera allt innan vi sparar något.
  const validationError = validateOnboardingInput(input)
  if (validationError) return { ok: false, error: validationError }

  // b. Profiluppgifter, utan onboarding_done. Säkert att köra om.
  const { error: profileError } = await supabase.from('profiles').update({
    phone: input.phone,
    birth_year: Number(input.birthYear),
    emergency_contact_name: input.ecName,
    emergency_contact_phone: input.ecPhone,
  }).eq('id', userId)
  if (profileError) return { ok: false, error: `Kunde inte spara dina uppgifter: ${profileError.message}` }

  // c. Lösenord, idempotent.
  const passwordResult = await setPasswordIdempotent(supabase, input.password)
  if (!passwordResult.ok) return passwordResult

  // d. Godkänn medlemskap i länkens församling. 403 stoppar inte flödet.
  let membershipAcceptFailed = false
  if (churchId) {
    try {
      const acceptRes = await fetchFn('/api/memberships/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ church_id: churchId }),
      })
      if (!acceptRes.ok) membershipAcceptFailed = true
    } catch {
      membershipAcceptFailed = true
    }
  }

  // e. onboarding_done sist, när allt annat är klart.
  const { error: doneError } = await supabase.from('profiles').update({
    onboarding_done: true,
  }).eq('id', userId)
  if (doneError) return { ok: false, error: `Kunde inte slutföra registreringen: ${doneError.message}` }

  // f. Väntande inbjudningar avgör nästa steg.
  let hasPendingInvites = false
  try {
    const pendingRes = await fetchFn('/api/memberships/pending')
    if (pendingRes.ok) {
      const pending = await pendingRes.json().catch(() => [])
      hasPendingInvites = Array.isArray(pending) && pending.length > 0
    }
  } catch {
    hasPendingInvites = false
  }

  return {
    ok: true,
    passwordAlreadySet: passwordResult.passwordAlreadySet,
    membershipAcceptFailed,
    hasPendingInvites,
  }
}

async function setPasswordIdempotent(
  supabase: OnboardingSupabaseClient,
  password: string,
): Promise<{ ok: true; passwordAlreadySet: boolean } | OnboardingSaveFailure> {
  const first = await supabase.auth.updateUser({ password })
  if (!first.error) return { ok: true, passwordAlreadySet: false }

  const code = first.error.code

  if (code === 'same_password') {
    // Lösenordet var redan satt till exakt detta sedan ett tidigare försök.
    return { ok: true, passwordAlreadySet: false }
  }

  if (code === 'weak_password') {
    return { ok: false, error: swedishPasswordError(first.error) }
  }

  if (code !== 'current_password_required') {
    return { ok: false, error: swedishPasswordError(first.error) }
  }

  // Kontot har redan ett lösenord. Försök en gång till och anta att det är
  // samma lösenord som vi just försökte sätta.
  const retry = await supabase.auth.updateUser({ password, current_password: password })
  if (!retry.error) return { ok: true, passwordAlreadySet: false }

  const retryCode = retry.error.code
  if (retryCode === 'same_password') {
    // Samma slutsats: lösenordet var redan exakt detta.
    return { ok: true, passwordAlreadySet: false }
  }
  if (retryCode === 'current_password_invalid') {
    // Kontot har ett ANNAT lösenord. Fortsätt flödet, men notera det för UI:t.
    return { ok: true, passwordAlreadySet: true }
  }

  return { ok: false, error: swedishPasswordError(retry.error) }
}

function swedishPasswordError(error: { code?: string | null; message?: string | null; reasons?: string[] | null }): string {
  return passwordErrorToSwedish(error)
}

// Lösenordsregler för klienten, avstämda mot vad Supabase Auth faktiskt
// kontrollerar (se Supabase-projektets auktoriseringsinställningar):
// 8–72 byte långt, minst en liten bokstav, en stor bokstav och en siffra.
// Bara ASCII a-z/A-Z/0-9 räknas som bokstav/siffra i detta avseende –
// å/ä/ö och andra tecken räknas INTE som en bokstav här.

export interface PasswordRequirement {
  key: 'length' | 'max_length' | 'lowercase' | 'uppercase' | 'digit'
  /** Visas i checklistan under lösenordsfältet. */
  label: string
  test: (pw: string) => boolean
}

function byteLength(pw: string): number {
  return new TextEncoder().encode(pw).length
}

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { key: 'length', label: 'Minst 8 tecken', test: pw => byteLength(pw) >= 8 },
  { key: 'max_length', label: 'Högst 72 tecken', test: pw => byteLength(pw) <= 72 },
  { key: 'lowercase', label: 'Minst en liten bokstav (a–z)', test: pw => /[a-z]/.test(pw) },
  { key: 'uppercase', label: 'Minst en stor bokstav (A–Z)', test: pw => /[A-Z]/.test(pw) },
  { key: 'digit', label: 'Minst en siffra (0–9)', test: pw => /[0-9]/.test(pw) },
]

/** Returnerar de krav som INTE är uppfyllda. Tom lista betyder godkänt lösenord. */
export function checkPassword(pw: string): PasswordRequirement[] {
  return PASSWORD_REQUIREMENTS.filter(r => !r.test(pw))
}

export function isPasswordValid(pw: string): boolean {
  return checkPassword(pw).length === 0
}

/** Formen på det Supabase skickar tillbaka från auth.updateUser / signUp m.fl. */
export interface SupabaseAuthErrorLike {
  code?: string | null
  message?: string | null
  reasons?: string[] | null
}

const WEAK_REASON_TEXT: Record<string, string> = {
  length: 'för kort eller för långt',
  characters: 'saknar en liten bokstav, en stor bokstav eller en siffra',
  pwned: 'har förekommit i ett dataintrång och är inte säkert att använda',
}

/** Översätter Supabase Auth-felkoder till tydliga svenska meddelanden. */
export function passwordErrorToSwedish(error: SupabaseAuthErrorLike | null | undefined): string {
  if (!error) return 'Något gick fel. Försök igen.'

  switch (error.code) {
    case 'current_password_required':
      return 'Du måste ange ditt nuvarande lösenord för att byta det.'
    case 'current_password_invalid':
      return 'Det nuvarande lösenordet stämmer inte.'
    case 'same_password':
      return 'Det nya lösenordet måste vara ett annat än det du redan har.'
    case 'weak_password': {
      const reasons = error.reasons ?? []
      if (reasons.length) {
        const texts = reasons.map(r => WEAK_REASON_TEXT[r] ?? r)
        return `Lösenordet är för svagt: ${texts.join(', ')}.`
      }
      return 'Lösenordet är för svagt. Välj ett starkare lösenord.'
    }
    default:
      return error.message ? `Något gick fel: ${error.message}` : 'Något gick fel. Försök igen.'
  }
}

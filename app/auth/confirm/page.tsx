'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { saveOnboarding, validateOnboardingInput } from '@/lib/onboardingSave'
import PendingInvitations from '@/components/layout/PendingInvitations'
import AuthCard from '@/components/layout/AuthCard'
import Icon from '@/components/ui/Icon'
import PasswordChecklist from '@/components/ui/PasswordChecklist'

type Step = 'loading' | 'form' | 'saving' | 'invites' | 'done' | 'error'

const LOADING_TIMEOUT_MS = 10000

export default function AuthConfirmPage() {
  const router = useRouter()
  const [step, setStep]     = useState<Step>('loading')
  const [email, setEmail]   = useState('')
  const [name, setName]     = useState('')
  const [userId, setUserId] = useState('')
  const [phone, setPhone]   = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [ecName, setEcName] = useState('')
  const [ecPhone, setEcPhone] = useState('')
  const [password, setPassword]   = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError]   = useState('')
  const [membershipNames, setMembershipNames] = useState<string[]>([])
  const [accessError, setAccessError] = useState('')

  // Visas i slutsteget ('invites' eller 'done') när något behövde en extra notis.
  const [passwordAlreadySet, setPasswordAlreadySet] = useState(false)
  const [membershipAcceptFailed, setMembershipAcceptFailed] = useState(false)
  const [resetSending, setResetSending] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  // Håller reda på det senaste steget utanför Reacts renderingscykel, så att
  // onAuthStateChange-lyssnaren aldrig kan byta steg mitt under spara-flödet.
  const stepRef = useRef<Step>('loading')
  const savingRef = useRef(false)
  const goStep = (next: Step) => { stepRef.current = next; setStep(next) }

  useEffect(() => {
    const supabase = createClient()
    let signedInHandled = false

    const timeoutId = setTimeout(() => {
      if (stepRef.current === 'loading') {
        setAccessError('Det tog för lång tid att läsa in dina uppgifter. Öppna länken i mejlet igen.')
        goStep('error')
      }
    }, LOADING_TIMEOUT_MS)

    const handleSession = async () => {
      // Spärr: lyssnaren får aldrig byta steg medan sparandet pågår.
      if (stepRef.current === 'saving') return

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      clearTimeout(timeoutId)

      // Kolla om onboarding redan är klar
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_done, name, phone, email, church_id, admin_level')
        .eq('id', session.user.id)
        .single()

      const { data: memberships, error: membershipError } = await supabase
        .from('profile_churches')
        .select('church_id, churches(name)')
        .eq('profile_id', session.user.id)
        .eq('active', true)

      const names = (memberships ?? [])
        .map((m: any) => m.churches?.name)
        .filter(Boolean) as string[]

      // Bakåtkompatibilitet under utrullningen av migration 016.
      const hasLegacyChurch = Boolean(profile?.church_id)
      const isLegacySuper = profile?.admin_level === 'super'
      const hasAccess = names.length > 0 || hasLegacyChurch || isLegacySuper

      if (!hasAccess && !membershipError) {
        setAccessError('Ditt konto saknar en aktiv församlingsinbjudan. Kontakta en administratör i din församling.')
        goStep('error')
        return
      }

      setMembershipNames(names)

      if (profile?.onboarding_done) {
        const church = new URLSearchParams(window.location.search).get('church')
        router.replace(church ? `/dashboard?church=${church}` : '/dashboard')
        return
      }

      setUserId(session.user.id)
      setEmail(session.user.email ?? '')
      setName(profile?.name ?? '')
      setPhone(profile?.phone ?? '')
      goStep('form')
    }

    // Supabase läser #access_token från hashen automatiskt. USER_UPDATED
    // (t.ex. när vi sätter lösenordet) ska INTE köra om handleSession – det
    // skulle kunna kapa sparandet mitt i. SIGNED_IN körs bara en gång.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && !signedInHandled) {
        signedInHandled = true
        handleSession()
      }
    })

    // Kör direkt ifall sessionen redan finns
    handleSession()

    return () => { subscription.unsubscribe(); clearTimeout(timeoutId) }
  }, [router])

  const save = async () => {
    // Spärra dubbelklick / dubbla inskick.
    if (savingRef.current) return
    setError('')

    // Snabb kontroll innan vi visar "Sparar…", så enkla fel (t.ex. ett glömt
    // fält) ger direkt svar utan att flimra förbi sparläget.
    const input = { phone, birthYear, ecName, ecPhone, password, password2 }
    const validationError = validateOnboardingInput(input)
    if (validationError) { setError(validationError); return }

    savingRef.current = true
    const supabase = createClient()
    const church = new URLSearchParams(window.location.search).get('church')
    const churchId = church && /^\d+$/.test(church) ? Number(church) : null

    goStep('saving')

    const result = await saveOnboarding({
      supabase,
      fetchFn: fetch,
      userId,
      churchId,
      input,
    })

    if (!result.ok) {
      setError(result.error)
      savingRef.current = false
      goStep('form')
      return
    }

    setPasswordAlreadySet(result.passwordAlreadySet)
    setMembershipAcceptFailed(result.membershipAcceptFailed)
    savingRef.current = false

    if (result.hasPendingInvites) {
      goStep('invites')
      return
    }

    goStep('done')
    // Skicka inte vidare automatiskt om något behöver personens uppmärksamhet
    // (t.ex. lösenordsnotisen) – då väljer de själva när de är klara.
    if (!result.passwordAlreadySet && !result.membershipAcceptFailed) {
      setTimeout(() => router.replace(churchId ? `/dashboard?church=${churchId}` : '/dashboard'), 1200)
    }
  }

  const sendResetLink = async () => {
    if (!email) return
    setResetSending(true)
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset`,
    })
    setResetSending(false)
    setResetSent(true)
  }

  /* ── UI ── */

  if (step === 'loading') return (
    <AuthCard title="Bekräftar inbjudan">
      <p role="status" style={{ color: 'rgba(0,0,0,0.72)', fontSize: 16 }}>Vänta lite…</p>
    </AuthCard>
  )

  if (step === 'done') return (
    <AuthCard title={<>Välkommen <span className="serif">in</span></>}>
      <PasswordAlreadySetNotice
        show={passwordAlreadySet}
        resetSending={resetSending}
        resetSent={resetSent}
        onSendReset={sendResetLink}
        onContinue={() => router.replace('/dashboard')}
      />
      <MembershipAcceptFailedNotice show={membershipAcceptFailed} />
      {!passwordAlreadySet && !membershipAcceptFailed && (
        <p role="status" style={{ color: 'rgba(0,0,0,0.72)', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="CircleCheck" style={{ color: '#7D0037' }} />Du skickas vidare…
        </p>
      )}
      {!passwordAlreadySet && membershipAcceptFailed && (
        <button className="btn btn-secondary" onClick={() => router.replace('/dashboard')}>Gå vidare</button>
      )}
    </AuthCard>
  )

  if (step === 'invites') return (
    <AuthCard wide title={<>Dina uppgifter <span className="serif">är sparade</span></>} lead="Godkänn de församlingar du vill vara med i.">
      <PasswordAlreadySetNotice
        show={passwordAlreadySet}
        resetSending={resetSending}
        resetSent={resetSent}
        onSendReset={sendResetLink}
      />
      <MembershipAcceptFailedNotice show={membershipAcceptFailed} />
      <PendingInvitations />
      <button className="btn btn-secondary" onClick={() => router.replace('/dashboard')}>Gå vidare</button>
    </AuthCard>
  )

  if (step === 'error') return (
    <AuthCard title="Något gick fel">
      <p role="alert" style={{ color: '#7D0037', fontSize: 16 }}>{accessError || 'Något gick fel. Försök öppna inbjudningslänken igen.'}</p>
    </AuthCard>
  )

  return (
    <AuthCard wide title={<>Välkommen <span className="serif">in</span></>} lead="Fyll i dina uppgifter för att komma igång.">
      <form onSubmit={e => { e.preventDefault(); void save() }}>
        {membershipNames.length > 0 && (
          <div className="alert alert-green" style={{ flexDirection: 'column', gap: 2 }}>
            <strong style={{ fontWeight: 500 }}>Din tillgång</strong>
            <span style={{ fontWeight: 400 }}>Du är inbjuden till {membershipNames.join(', ')}.</span>
          </div>
        )}

        {/* Namn och e-post är förifyllda och går inte att ändra här */}
        <div className="form-field">
          <label htmlFor="onb-namn">Ditt namn</label>
          <input id="onb-namn" value={name} readOnly style={{ background: 'transparent' }} />
        </div>
        <div className="form-field">
          <label htmlFor="onb-epost">E-postadress</label>
          <input id="onb-epost" value={email} readOnly style={{ background: 'transparent' }} />
        </div>

        <div className="form-row">
          <div className="form-field">
            <label htmlFor="onb-tel">Mobilnummer</label>
            <input id="onb-tel" type="tel" autoComplete="tel" required placeholder="070-123 45 67"
              value={phone} onChange={e => setPhone(e.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="onb-ar">Födelseår</label>
            <input id="onb-ar" type="number" required placeholder="t.ex. 1990" min={1900} max={2015}
              value={birthYear} onChange={e => setBirthYear(e.target.value)} />
          </div>
        </div>

        <fieldset className="panel" style={{ marginBottom: 16 }}>
          <legend className="section-label" style={{ padding: '0 6px', marginBottom: 0 }}>Kontaktperson i nödsituation</legend>
          <div className="form-field">
            <label htmlFor="onb-ec-namn">Namn</label>
            <input id="onb-ec-namn" required placeholder="Anna Andersson" value={ecName} onChange={e => setEcName(e.target.value)} />
          </div>
          <div className="form-field" style={{ marginBottom: 0 }}>
            <label htmlFor="onb-ec-tel">Telefonnummer</label>
            <input id="onb-ec-tel" type="tel" required placeholder="070-987 65 43" value={ecPhone} onChange={e => setEcPhone(e.target.value)} />
          </div>
        </fieldset>

        <div className="form-field">
          <label htmlFor="onb-losen">Välj lösenord</label>
          <input id="onb-losen" type="password" required placeholder="••••••••"
            aria-describedby="onb-losen-krav"
            value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
        <PasswordChecklist password={password} id="onb-losen-krav" />
        <div className="form-field">
          <label htmlFor="onb-losen2">Upprepa lösenord</label>
          <input id="onb-losen2" type="password" required placeholder="••••••••"
            value={password2} onChange={e => setPassword2(e.target.value)} autoComplete="new-password" />
        </div>

        {error && (
          <div role="alert" className="alert alert-red"><Icon name="Alert" size={18} />{error}</div>
        )}

        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 4 }} disabled={step === 'saving'}>
          {step === 'saving' ? 'Sparar…' : 'Skapa mitt konto'}
        </button>

        <p style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', textAlign: 'center', marginTop: 14 }}>
          Dina uppgifter används bara internt inom Svenska kyrkan.
        </p>
      </form>
    </AuthCard>
  )
}

/**
 * Visas när kontot redan hade ett ANNAT lösenord än det personen just
 * skrev in, så att lösenordsfältet i onboardingen inte sparades.
 */
function PasswordAlreadySetNotice({ show, resetSending, resetSent, onSendReset, onContinue }: {
  show: boolean
  resetSending: boolean
  resetSent: boolean
  onSendReset: () => void
  onContinue?: () => void
}) {
  if (!show) return null
  return (
    <div role="alert" className="alert alert-amber" style={{ flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Icon name="Alert" size={18} style={{ marginTop: 2 }} />
        <span>Dina uppgifter är sparade. Ditt konto hade redan ett lösenord, så det du skrev nu sparades inte.</span>
      </div>
      {resetSent ? (
        <span style={{ fontWeight: 400 }}>En länk för att välja nytt lösenord är skickad till din e-post.</span>
      ) : (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onSendReset} disabled={resetSending}>
            {resetSending ? 'Skickar…' : 'Skicka länk för nytt lösenord'}
          </button>
          {onContinue && (
            <button type="button" className="btn btn-primary btn-sm" onClick={onContinue}>Gå vidare</button>
          )}
        </div>
      )}
    </div>
  )
}

/** Mjuk notis: en inbjudan i länken kunde inte godkännas automatiskt (t.ex. redan borttagen). */
function MembershipAcceptFailedNotice({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div role="alert" className="alert alert-amber">
      <Icon name="Alert" size={18} />
      Din inbjudan kunde inte godkännas automatiskt. Har du fler väntande inbjudningar nedan, godkänn dem där – annars, be en administratör bjuda in dig igen.
    </div>
  )
}

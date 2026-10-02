'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PendingInvitations from '@/components/layout/PendingInvitations'
import AuthCard from '@/components/layout/AuthCard'
import Icon from '@/components/ui/Icon'

type Step = 'loading' | 'form' | 'saving' | 'invites' | 'done' | 'error'

export default function AuthConfirmPage() {
  const router = useRouter()
  const [step, setStep]     = useState<Step>('loading')
  const [email, setEmail]   = useState('')
  const [name, setName]     = useState('')
  const [phone, setPhone]   = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [ecName, setEcName] = useState('')
  const [ecPhone, setEcPhone] = useState('')
  const [password, setPassword]   = useState('')
  const [password2, setPassword2] = useState('')
  const [error, setError]   = useState('')
  const [membershipNames, setMembershipNames] = useState<string[]>([])
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    const supabase = createClient()

    const handleSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

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
      const { data: isOwner } = await supabase.rpc('is_system_super_admin')
      const hasAccess = names.length > 0 || hasLegacyChurch || isOwner === true

      if (!hasAccess && !membershipError) {
        setAccessError('Ditt konto saknar en aktiv församlingsinbjudan. Kontakta en administratör i din församling.')
        setStep('error')
        return
      }

      setMembershipNames(names)

      if (profile?.onboarding_done) {
        const church = new URLSearchParams(window.location.search).get('church')
        router.replace(church ? `/dashboard?church=${church}` : '/dashboard')
        return
      }

      setEmail(session.user.email ?? '')
      setName(profile?.name ?? '')
      setPhone(profile?.phone ?? '')
      setStep('form')
    }

    // Supabase läser #access_token från hashen automatiskt
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        handleSession()
      }
    })

    // Kör direkt ifall sessionen redan finns
    handleSession()

    return () => subscription.unsubscribe()
  }, [router])

  const save = async () => {
    setError('')

    if (!phone.trim())   { setError('Ange ditt telefonnummer.'); return }
    if (!birthYear.trim() || isNaN(Number(birthYear)) || Number(birthYear) < 1900 || Number(birthYear) > 2015) {
      setError('Ange ett giltigt födelseår (t.ex. 1990).'); return
    }
    if (!ecName.trim())  { setError('Ange namn på din kontaktperson.'); return }
    if (!ecPhone.trim()) { setError('Ange telefonnummer till din kontaktperson.'); return }
    if (password.length < 8) { setError('Lösenordet måste vara minst 8 tecken.'); return }
    if (password !== password2) { setError('Lösenorden matchar inte.'); return }

    setStep('saving')
    const supabase = createClient()

    // Sätt lösenord
    const { error: pwErr } = await supabase.auth.updateUser({ password })
    if (pwErr) { setError(pwErr.message); setStep('form'); return }

    // Spara profil
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Ingen session. Försök igen.'); setStep('form'); return }

    const { error: profErr } = await supabase.from('profiles').update({
      phone,
      birth_year: Number(birthYear),
      emergency_contact_name: ecName,
      emergency_contact_phone: ecPhone,
      onboarding_done: true,
    }).eq('id', user.id)

    if (profErr) { setError(profErr.message); setStep('form'); return }

    // Godkänn bara församlingen i länken (?church). Varje församling godkänns för sig.
    const church = new URLSearchParams(window.location.search).get('church')
    const churchId = church && /^\d+$/.test(church) ? Number(church) : null
    if (churchId) {
      const acceptRes = await fetch('/api/memberships/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ church_id: churchId }),
      })
      if (!acceptRes.ok) {
        const data = await acceptRes.json().catch(() => ({}))
        setError(data.error ?? 'Kunde inte aktivera din församlingsinbjudan.')
        setStep('form')
        return
      }
    }

    // Finns fler väntande inbjudningar (eller ingen församling i länken) får
    // personen godkänna eller avböja var och en för sig.
    const pendingRes = await fetch('/api/memberships/pending').catch(() => null)
    const pending = pendingRes?.ok ? await pendingRes.json().catch(() => []) : []
    if (Array.isArray(pending) && pending.length) {
      setStep('invites')
      return
    }

    setStep('done')
    setTimeout(() => router.replace(churchId ? `/dashboard?church=${churchId}` : '/dashboard'), 1200)
  }

  /* ── UI ── */

  if (step === 'loading') return (
    <AuthCard title="Bekräftar inbjudan">
      <p role="status" style={{ color: 'rgba(0,0,0,0.72)', fontSize: 16 }}>Vänta lite…</p>
    </AuthCard>
  )

  if (step === 'done') return (
    <AuthCard title={<>Välkommen <span className="serif">in</span></>}>
      <p role="status" style={{ color: 'rgba(0,0,0,0.72)', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="CircleCheck" style={{ color: '#7D0037' }} />Du skickas vidare…
      </p>
    </AuthCard>
  )

  if (step === 'invites') return (
    <AuthCard wide title={<>Dina uppgifter <span className="serif">är sparade</span></>} lead="Godkänn de församlingar du vill vara med i.">
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
          <label htmlFor="onb-losen">Välj lösenord (minst 8 tecken)</label>
          <input id="onb-losen" type="password" required placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" />
        </div>
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

'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Step = 'loading' | 'form' | 'saving' | 'done' | 'error'

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

  useEffect(() => {
    const supabase = createClient()

    const handleSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Kolla om onboarding redan är klar
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_done, name, phone, email')
        .eq('id', session.user.id)
        .single()

      if (profile?.onboarding_done) {
        router.replace('/dashboard')
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
    if (!user) { setError('Ingen session – försök igen.'); setStep('form'); return }

    const { error: profErr } = await supabase.from('profiles').update({
      phone,
      birth_year: Number(birthYear),
      emergency_contact_name: ecName,
      emergency_contact_phone: ecPhone,
      onboarding_done: true,
    }).eq('id', user.id)

    if (profErr) { setError(profErr.message); setStep('form'); return }

    setStep('done')
    setTimeout(() => router.replace('/dashboard'), 1200)
  }

  /* ── UI ── */

  if (step === 'loading') return (
    <div style={wrap}>
      <div style={card}>
        <div style={cross}>✝</div>
        <p style={{ color: '#5F5E5A', fontSize: 14, marginTop: 16 }}>Bekräftar inbjudan…</p>
      </div>
    </div>
  )

  if (step === 'done') return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ ...cross, background: '#28A88E' }}>✓</div>
        <h2 style={h2}>Välkommen!</h2>
        <p style={{ color: '#5F5E5A', fontSize: 14, marginTop: 8 }}>Du skickas vidare…</p>
      </div>
    </div>
  )

  if (step === 'error') return (
    <div style={wrap}>
      <div style={card}>
        <p style={{ color: '#7D0037', fontSize: 14 }}>Något gick fel. Försök öppna inbjudningslänken igen.</p>
      </div>
    </div>
  )

  return (
    <div style={wrap}>
      <div style={{ ...card, maxWidth: 480, textAlign: 'left' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={cross}>✝</div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#000' }}>Välkommen!</h1>
            <p style={{ fontSize: 13, color: '#5F5E5A', marginTop: 2 }}>Fyll i dina uppgifter för att komma igång.</p>
          </div>
        </div>

        {/* Namn (förifyllt, ej redigerbart här) */}
        <div style={field}>
          <label style={lbl}>Ditt namn</label>
          <input style={{ ...inp, background: '#f5f5f5', color: '#888' }} value={name} disabled />
        </div>

        {/* E-post (förifyllt) */}
        <div style={field}>
          <label style={lbl}>E-postadress</label>
          <input style={{ ...inp, background: '#f5f5f5', color: '#888' }} value={email} disabled />
        </div>

        {/* Telefon */}
        <div style={field}>
          <label style={lbl}>Mobilnummer *</label>
          <input
            style={inp} type="tel" placeholder="070-123 45 67"
            value={phone} onChange={e => setPhone(e.target.value)}
          />
        </div>

        {/* Födelseår */}
        <div style={field}>
          <label style={lbl}>Födelseår *</label>
          <input
            style={inp} type="number" placeholder="t.ex. 1990" min={1900} max={2015}
            value={birthYear} onChange={e => setBirthYear(e.target.value)}
          />
        </div>

        {/* Kontaktperson */}
        <div style={{ background: '#FFEBE1', borderRadius: 12, padding: '16px', marginBottom: 16, borderLeft: '3px solid #7D0037' }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#7D0037', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Kontaktperson i nödsituation
          </p>
          <div style={field}>
            <label style={lbl}>Namn *</label>
            <input style={inp} placeholder="Anna Andersson" value={ecName} onChange={e => setEcName(e.target.value)} />
          </div>
          <div style={{ ...field, marginBottom: 0 }}>
            <label style={lbl}>Telefonnummer *</label>
            <input style={inp} type="tel" placeholder="070-987 65 43" value={ecPhone} onChange={e => setEcPhone(e.target.value)} />
          </div>
        </div>

        {/* Lösenord */}
        <div style={field}>
          <label style={lbl}>Välj lösenord * (minst 8 tecken)</label>
          <input
            style={inp} type="password" placeholder="••••••••"
            value={password} onChange={e => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        <div style={field}>
          <label style={lbl}>Upprepa lösenord *</label>
          <input
            style={inp} type="password" placeholder="••••••••"
            value={password2} onChange={e => setPassword2(e.target.value)}
            autoComplete="new-password"
          />
        </div>

        {/* Felmeddelande */}
        {error && (
          <div style={{ background: '#FFC3AA', border: '1px solid #FF785A', borderRadius: 10, padding: '10px 14px', color: '#7D0037', fontSize: 13, fontWeight: 500, marginBottom: 14 }}>
            ⚠ {error}
          </div>
        )}

        {/* Skicka */}
        <button
          onClick={save}
          disabled={step === 'saving'}
          style={{
            width: '100%', padding: '13px', background: '#7D0037', color: '#fff',
            border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700,
            cursor: step === 'saving' ? 'wait' : 'pointer',
            boxShadow: '0 2px 10px rgba(125,0,55,0.25)',
            marginTop: 4,
          }}
        >
          {step === 'saving' ? 'Sparar…' : 'Skapa mitt konto →'}
        </button>

        <p style={{ fontSize: 11, color: '#BC8E4C', textAlign: 'center', marginTop: 14 }}>
          Dina uppgifter används bara internt inom Svenska kyrkan.
        </p>
      </div>
    </div>
  )
}

/* ── Stilkonstanter ── */
const wrap: React.CSSProperties = {
  minHeight: '100vh', background: '#FFEBE1',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
}
const card: React.CSSProperties = {
  background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 360,
  boxShadow: '0 8px 32px rgba(125,0,55,0.12)', textAlign: 'center',
  border: '1px solid rgba(125,0,55,0.08)',
}
const cross: React.CSSProperties = {
  width: 52, height: 52, background: '#7D0037', borderRadius: '50%',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#fff', fontSize: 24, margin: '0 auto', flexShrink: 0,
}
const h2: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: '#000', marginTop: 14 }
const field: React.CSSProperties = { marginBottom: 14 }
const lbl: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#5F5E5A',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
}
const inp: React.CSSProperties = {
  width: '100%', fontSize: 14, padding: '10px 13px',
  border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 10,
  background: '#FFEBE1', color: '#000', outline: 'none', fontFamily: 'inherit',
}

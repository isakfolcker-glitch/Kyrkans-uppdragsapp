'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import PasswordInput from '@/components/ui/PasswordInput'
import PasswordStrengthMeter from '@/components/ui/PasswordStrengthMeter'
import { passwordError } from '@/lib/passwordPolicy'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        setReady(true)
      }
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const save = async () => {
    const pwErrMsg = passwordError(password)
    if (pwErrMsg) { setError(pwErrMsg); return }
    if (password !== password2) { setError('Lösenorden matchar inte.'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    router.replace('/dashboard')
  }

  const wrap: React.CSSProperties = {
    minHeight: '100vh', background: '#FFEBE1',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }
  const card: React.CSSProperties = {
    background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 400,
    boxShadow: '0 8px 32px rgba(125,0,55,0.12)', border: '1px solid rgba(125,0,55,0.08)',
  }

  if (!ready) return (
    <div style={wrap}><div style={card}>
      <p style={{ textAlign: 'center', color: '#5F5E5A' }}>Laddar…</p>
    </div></div>
  )

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, background: '#7D0037', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 24, marginBottom: 14 }}>✝</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#000' }}>Nytt lösenord</h1>
          <p style={{ fontSize: 13, color: '#5F5E5A', marginTop: 4 }}>Välj ett nytt lösenord för ditt konto.</p>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#5F5E5A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Nytt lösenord *</label>
          <PasswordInput
            placeholder="Minst 10 tecken"
            value={password} onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', fontSize: 14, padding: '10px 13px', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 10, background: '#FFEBE1', color: '#000', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>
        <PasswordStrengthMeter password={password} />
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#5F5E5A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>Upprepa lösenord *</label>
          <PasswordInput
            placeholder="••••••••"
            value={password2} onChange={e => setPassword2(e.target.value)}
            style={{ width: '100%', fontSize: 14, padding: '10px 13px', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 10, background: '#FFEBE1', color: '#000', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        {error && <div style={{ background: '#FFC3AA', border: '1px solid #FF785A', borderRadius: 10, padding: '10px 14px', color: '#7D0037', fontSize: 13, fontWeight: 500, marginBottom: 14 }}>⚠ {error}</div>}

        <button
          onClick={save} disabled={loading}
          style={{ width: '100%', padding: 13, background: '#7D0037', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: loading ? 'wait' : 'pointer' }}
        >
          {loading ? 'Sparar…' : 'Spara nytt lösenord →'}
        </button>
      </div>
    </div>
  )
}

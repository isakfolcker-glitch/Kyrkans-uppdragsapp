'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const supabase = createClient()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showReset, setShowReset] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Fel e-post eller lösenord.'); setLoading(false); return }
    router.push('/')
    router.refresh()
  }

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` })
    setResetSent(true)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FFEBE1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 20, border: '1px solid rgba(125,0,55,0.1)', padding: 36, width: '100%', maxWidth: 420, boxShadow: '0 8px 32px rgba(125,0,55,0.12)' }}>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, background: '#7D0037', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 26, marginBottom: 14 }}>✝</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#000', letterSpacing: '-0.01em' }}>Kyrkans uppdragsapp</div>
          <div style={{ fontSize: 13, color: '#5F5E5A', marginTop: 4 }}>Logga in på ditt konto</div>
        </div>

        {!showReset ? (
          <>
            <form onSubmit={login}>
              <div className="form-field">
                <label>E-post</label>
                <input type="email" placeholder="din@kyrka.se" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div className="form-field">
                <label>Lösenord</label>
                <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              {error && <div className="alert alert-red" style={{ marginBottom: 12 }}>⚠️ {error}</div>}
              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} disabled={loading}>
                {loading ? 'Loggar in...' : 'Logga in'}
              </button>
            </form>
            <button onClick={() => setShowReset(true)} style={{ background: 'none', border: 'none', color: '#7D0037', fontSize: 12, cursor: 'pointer', marginTop: 14, display: 'block', textAlign: 'center', width: '100%' }}>
              Glömt lösenord?
            </button>
          </>
        ) : (
          <>
            {resetSent ? (
              <div className="alert alert-green">✓ Återställningslänk skickad till {email}. Kolla din e-post.</div>
            ) : (
              <form onSubmit={sendReset}>
                <div className="form-field">
                  <label>Din e-postadress</label>
                  <input type="email" placeholder="din@kyrka.se" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
                  {loading ? 'Skickar...' : 'Skicka återställningslänk'}
                </button>
              </form>
            )}
            <button onClick={() => { setShowReset(false); setResetSent(false) }} style={{ background: 'none', border: 'none', color: '#5F5E5A', fontSize: 12, cursor: 'pointer', marginTop: 14, display: 'block', textAlign: 'center', width: '100%' }}>
              ← Tillbaka till inloggning
            </button>
          </>
        )}
      </div>
    </div>
  )
}

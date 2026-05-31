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
    <div style={{ minHeight: '100vh', background: '#F1EFE8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #D3D1C7', padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <div style={{ width: 40, height: 40, background: '#534AB7', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EEEDFE', fontSize: 18, fontWeight: 700 }}>K</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#2C2C2A' }}>Kyrkans uppdragsapp</div>
            <div style={{ fontSize: 12, color: '#888780' }}>Logga in på ditt konto</div>
          </div>
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
            <button onClick={() => setShowReset(true)} style={{ background: 'none', border: 'none', color: '#534AB7', fontSize: 12, cursor: 'pointer', marginTop: 14, display: 'block', textAlign: 'center', width: '100%' }}>
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
            <button onClick={() => { setShowReset(false); setResetSent(false) }} style={{ background: 'none', border: 'none', color: '#888780', fontSize: 12, cursor: 'pointer', marginTop: 14, display: 'block', textAlign: 'center', width: '100%' }}>
              ← Tillbaka till inloggning
            </button>
          </>
        )}
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import AuthCard from '@/components/layout/AuthCard'
import Icon from '@/components/ui/Icon'

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
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset` })
    setResetSent(true)
    setLoading(false)
  }

  return (
    <AuthCard title={<>Välkommen <span className="serif">in</span></>} lead={showReset ? 'Få en länk för att välja nytt lösenord.' : 'Logga in på ditt konto.'}>
      {!showReset ? (
        <>
          <form onSubmit={login}>
            <div className="form-field">
              <label htmlFor="login-epost">E-post</label>
              <input id="login-epost" type="email" placeholder="din@kyrka.se" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="form-field">
              <label htmlFor="login-losen">Lösenord</label>
              <input id="login-losen" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            {error && <div role="alert" className="alert alert-red" style={{ marginBottom: 12 }}><Icon name="Alert" size={18} />{error}</div>}
            <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', marginTop: 4 }} disabled={loading}>
              {loading ? 'Loggar in...' : 'Logga in'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button type="button" className="link-btn" style={{ alignSelf: 'center' }} onClick={() => setShowReset(true)}>
              Glömt lösenord?
            </button>
          </div>
        </>
      ) : (
        <>
          {resetSent ? (
            <div role="status" className="alert alert-green"><Icon name="Check" size={18} />Återställningslänk skickad till {email}. Kolla din e-post.</div>
          ) : (
            <form onSubmit={sendReset}>
              <div className="form-field">
                <label htmlFor="login-reset-epost">Din e-postadress</label>
                <input id="login-reset-epost" type="email" placeholder="din@kyrka.se" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
                {loading ? 'Skickar...' : 'Skicka återställningslänk'}
              </button>
            </form>
          )}
          <div style={{ textAlign: 'center', marginTop: 10 }}>
            <button type="button" className="link-btn" onClick={() => { setShowReset(false); setResetSent(false) }}>
              <Icon name="ArrowLeft" size={18} style={{ marginRight: 6 }} />Tillbaka till inloggning
            </button>
          </div>
        </>
      )}
    </AuthCard>
  )
}

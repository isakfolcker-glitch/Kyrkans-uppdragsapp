'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import AuthCard from '@/components/layout/AuthCard'
import Icon from '@/components/ui/Icon'

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
    if (password.length < 8) { setError('Lösenordet måste vara minst 8 tecken.'); return }
    if (password !== password2) { setError('Lösenorden matchar inte.'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    router.replace('/dashboard')
  }

  if (!ready) return (
    <AuthCard title="Nytt lösenord">
      <p role="status" style={{ textAlign: 'center', color: 'rgba(0,0,0,0.72)' }}>Laddar…</p>
    </AuthCard>
  )

  return (
    <AuthCard title={<>Nytt <span className="serif">lösenord</span></>} lead="Välj ett nytt lösenord för ditt konto.">
      <form onSubmit={e => { e.preventDefault(); void save() }}>
        <div className="form-field">
          <label htmlFor="reset-losen">Nytt lösenord</label>
          <input
            id="reset-losen"
            type="password" placeholder="Minst 8 tecken" autoComplete="new-password" required
            value={password} onChange={e => setPassword(e.target.value)}
          />
        </div>
        <div className="form-field">
          <label htmlFor="reset-losen2">Upprepa lösenord</label>
          <input
            id="reset-losen2"
            type="password" placeholder="••••••••" autoComplete="new-password" required
            value={password2} onChange={e => setPassword2(e.target.value)}
          />
        </div>

        {error && <div role="alert" className="alert alert-red"><Icon name="Alert" size={18} />{error}</div>}

        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Sparar…' : 'Spara nytt lösenord'}
        </button>
      </form>
    </AuthCard>
  )
}

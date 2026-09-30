'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AuthCard from '@/components/layout/AuthCard'
import Icon from '@/components/ui/Icon'

export default function DemoLoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/demo/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      router.push('/demo')
    } else {
      setError('Fel lösenord. Försök igen.')
    }
    setLoading(false)
  }

  return (
    <AuthCard title={<>Prova <span className="serif">demot</span></>} lead="Ange lösenordet för att fortsätta. All data i demot är påhittad.">
      <form onSubmit={submit}>
        <div className="form-field">
          <label htmlFor="demo-losen">Lösenord</label>
          <input
            id="demo-losen"
            type="password"
            placeholder="Lösenord"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {error && (
          <div role="alert" className="alert alert-red"><Icon name="Alert" size={18} />{error}</div>
        )}
        <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={!password || loading}>
          {loading ? 'Kontrollerar…' : 'Gå till demo'}
        </button>
      </form>
    </AuthCard>
  )
}

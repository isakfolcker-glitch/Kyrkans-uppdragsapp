'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

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
      setError('Fel lösenord – försök igen.')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#F7F6F1',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ maxWidth: 360, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⛪</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#2C2C2A', margin: 0 }}>
            Kyrkans uppdragsapp
          </h1>
          <p style={{ color: '#888780', marginTop: 6, fontSize: 14 }}>Demo – ange lösenord för att fortsätta</p>
        </div>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="password"
            placeholder="Lösenord"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoFocus
            style={{
              padding: '12px 14px', borderRadius: 10, fontSize: 15,
              border: '1.5px solid rgba(0,0,0,0.12)', outline: 'none',
              fontFamily: 'inherit', background: '#fff',
            }}
          />
          {error && (
            <div style={{ color: '#c0392b', fontSize: 13, textAlign: 'center' }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={!password || loading}
            style={{
              background: '#412B72', color: '#fff', border: 'none',
              borderRadius: 10, padding: '12px', fontSize: 15,
              fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              opacity: (!password || loading) ? 0.6 : 1,
            }}
          >
            {loading ? 'Kontrollerar…' : 'Gå till demo'}
          </button>
        </form>
      </div>
    </div>
  )
}

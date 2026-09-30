'use client'
import { useEffect, useState } from 'react'

type Invitation = { churchId: number; churchName: string; role: string }

/**
 * Visar den inloggades väntande församlingsinbjudningar med Acceptera / Avböj.
 * En inbjudan ger ingen tillgång förrän personen själv accepterar den.
 */
export default function PendingInvitations() {
  const [invites, setInvites] = useState<Invitation[]>([])
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch('/api/memberships/pending')
      .then(res => (res.ok ? res.json() : []))
      .then((data: Invitation[]) => { if (!cancelled && Array.isArray(data)) setInvites(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const respond = async (churchId: number, action: 'accept' | 'decline') => {
    setBusy(churchId); setError('')
    const res = await fetch(`/api/memberships/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ church_id: churchId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Något gick fel.')
      setBusy(null)
      return
    }
    if (action === 'accept') {
      // Ladda om så att församlingen och behörigheterna läses in på nytt.
      window.location.assign(`/dashboard?church=${churchId}`)
      return
    }
    setInvites(prev => prev.filter(i => i.churchId !== churchId))
    setBusy(null)
  }

  if (!invites.length) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
      {invites.map(invite => (
        <div key={invite.churchId} style={{
          background: '#F0FAF6', border: '1px solid #28A88E', borderRadius: 12,
          padding: '12px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
          textAlign: 'left',
        }}>
          <div style={{ flex: 1, minWidth: 200, fontSize: 14, color: '#2C2C2A' }}>
            Du är inbjuden till <strong>{invite.churchName}</strong>.
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy !== null}
            onClick={() => respond(invite.churchId, 'accept')}>Acceptera</button>
          <button className="btn btn-secondary btn-sm" disabled={busy !== null}
            onClick={() => respond(invite.churchId, 'decline')}>Avböj</button>
        </div>
      ))}
      {error && <div style={{ color: '#7D0037', fontSize: 13 }}>⚠ {error}</div>}
    </div>
  )
}

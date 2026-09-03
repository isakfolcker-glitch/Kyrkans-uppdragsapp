'use client'
import { useEffect, useState } from 'react'
import { useApp } from '@/lib/appStore'

type Application = {
  id: number; name: string; email: string; phone: string
  birth_year: number | null; message: string
  emergency_contact_name: string; emergency_contact_phone: string
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  churches?: { name: string } | null
}

function RejectModal({ app, onDone }: { app: Application; onDone: () => void }) {
  const { closeModal } = useApp()
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const send = async () => {
    setLoading(true); setErr('')
    const res = await fetch(`/api/applications/${app.id}/reject`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setErr(d.error ?? 'Något gick fel.'); setLoading(false); return }
    onDone()
    closeModal()
  }

  return (
    <>
      <div className="modal-title">Avslå ansökan – {app.name}</div>
      <div className="form-field">
        <label>Meddelande till sökanden (frivilligt)</label>
        <textarea placeholder="T.ex. varför ansökan inte kan gå vidare just nu" value={reason} onChange={e => setReason(e.target.value)} />
      </div>
      {err && <div className="alert alert-red">⚠️ {err}</div>}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-danger" onClick={send} disabled={loading}>{loading ? 'Skickar...' : '✕ Avslå ansökan'}</button>
      </div>
    </>
  )
}

export default function AnsokningarPage() {
  const { showModal } = useApp()
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    fetch('/api/applications?status=pending')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setApps(d) })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const approve = async (app: Application) => {
    setBusyId(app.id); setError('')
    const res = await fetch(`/api/applications/${app.id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const d = await res.json().catch(() => ({}))
    setBusyId(null)
    if (!res.ok) { setError(d.error ?? 'Något gick fel.'); return }
    setApps(prev => prev.filter(a => a.id !== app.id))
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Ansökningar</h1>
        <p className="page-sub">Granska ansökningar från personer som vill bli ideella</p>
      </div>

      {error && <div className="alert alert-red" style={{ marginBottom: 14 }}>⚠️ {error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888780', fontSize: 12 }}>Laddar...</div>
      ) : apps.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '2rem', textAlign: 'center', color: '#888780', fontSize: 13 }}>
          Inga väntande ansökningar just nu.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {apps.map(app => (
            <div key={app.id} style={{ background: '#fff', border: '1px solid rgba(125,0,55,0.1)', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#000' }}>{app.name}</div>
                  <div style={{ fontSize: 12.5, color: '#5F5E5A', marginTop: 2 }}>{app.email} · {app.phone}</div>
                  <div style={{ fontSize: 12, color: '#8A6FB5', marginTop: 2 }}>
                    {app.churches?.name ?? 'Okänd församling'}{app.birth_year ? ` · Född ${app.birth_year}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#B7A9C2' }}>{new Date(app.created_at).toLocaleDateString('sv-SE')}</div>
              </div>

              {app.message && (
                <div style={{ background: '#F1EFE8', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#2C2C2A', marginBottom: 10 }}>
                  {app.message}
                </div>
              )}

              {(app.emergency_contact_name || app.emergency_contact_phone) && (
                <div style={{ fontSize: 12, color: '#5F5E5A', marginBottom: 12 }}>
                  Nödkontakt: {app.emergency_contact_name} {app.emergency_contact_phone && `– ${app.emergency_contact_phone}`}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  className="btn btn-danger"
                  onClick={() => showModal(<RejectModal app={app} onDone={() => setApps(prev => prev.filter(a => a.id !== app.id))} />)}
                  disabled={busyId === app.id}
                >
                  ✕ Avslå
                </button>
                <button className="btn btn-primary" onClick={() => approve(app)} disabled={busyId === app.id}>
                  {busyId === app.id ? 'Skickar...' : '✓ Godkänn & bjud in'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

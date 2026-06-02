'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'

function SendMessageModal() {
  const { groups, people, closeModal, addMessage, profile, currentChurchId } = useApp()
  const [allChecked, setAllChecked]   = useState(false)
  const [selGroups, setSelGroups]     = useState<string[]>([])
  const [subject, setSubject]         = useState('')
  const [body, setBody]               = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const cid = currentChurchId()

  const toggleGroup = (id: string) =>
    setSelGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // Räkna mottagare och bygga label
  let recipients: string[] = []
  let toLabel = ''
  if (allChecked) {
    recipients = people.filter(p => p.church === cid && p.mail).map(p => p.mail!)
    toLabel = 'Alla ideella'
  } else {
    const ids = new Set<string>()
    selGroups.forEach(g => {
      people.filter(p => p.groups.includes(g) && p.mail).forEach(p => ids.add(p.mail!))
    })
    recipients = Array.from(ids)
    toLabel = selGroups.length ? 'Grupp: ' + selGroups.join(', ') : ''
  }

  const send = async () => {
    if (!recipients.length)  { setError('Välj minst en mottagare.'); return }
    if (!subject.trim())     { setError('Ange ett ämne.'); return }
    if (!body.trim())        { setError('Skriv ett meddelande.'); return }
    setLoading(true)
    setError('')

    const res = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: recipients,
        to_label: toLabel,
        subject,
        body,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Något gick fel.'); setLoading(false); return }

    addMessage({
      id: Date.now(),
      from: profile?.name ?? 'Admin',
      to: toLabel,
      toCount: recipients.length,
      subject,
      body,
      sentAt: new Date().toLocaleDateString('sv'),
    })
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <div className="modal-title">✉ Skicka meddelande</div>

      <div className="form-field">
        <label>Skicka till</label>
        <div style={{ background: '#FFEBE1', borderRadius: 10, padding: '10px 14px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={allChecked} onChange={e => { setAllChecked(e.target.checked); setSelGroups([]) }} style={{ accentColor: '#7D0037', width: 16, height: 16 }} />
            <span style={{ fontSize: 13, fontWeight: 500 }}>Alla i kyrkan – {people.filter(p => p.church === cid).length} pers</span>
          </label>
          {!allChecked && groups.map(g => (
            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={selGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} style={{ accentColor: '#7D0037', width: 16, height: 16 }} />
              <span style={{ fontSize: 13 }}>{g.label} – {people.filter(p => p.groups.includes(g.id)).length} pers</span>
            </label>
          ))}
        </div>
      </div>

      {recipients.length > 0 && (
        <div className="alert alert-green" style={{ marginBottom: 14 }}>
          ✓ {recipients.length} mottagare valda
        </div>
      )}

      <div className="form-field">
        <label>Ämne</label>
        <input placeholder="ex. Viktig information inför söndagen" value={subject} onChange={e => setSubject(e.target.value)} />
      </div>
      <div className="form-field">
        <label>Meddelande</label>
        <textarea style={{ height: 120 }} placeholder="Skriv ditt meddelande här..." value={body} onChange={e => setBody(e.target.value)} />
      </div>

      {error && <div className="alert alert-red">{error}</div>}

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={send} disabled={loading}>
          {loading ? 'Skickar...' : `✉ Skicka till ${recipients.length || '?'} pers`}
        </button>
      </div>
    </>
  )
}

export default function UtskickPage() {
  const { messages, showModal } = useApp()
  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Utskick</h1>
          <p className="page-sub">Skicka meddelanden till ideella och anställda</p>
        </div>
        <button className="btn btn-primary" onClick={() => showModal(<SendMessageModal />)}>✉ Nytt utskick</button>
      </div>

      <div className="section-label">Tidigare utskick</div>

      {messages.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: '32px 24px', textAlign: 'center', border: '1px solid rgba(125,0,55,0.08)' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✉</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#000', marginBottom: 6 }}>Inga utskick ännu</div>
          <div style={{ fontSize: 13, color: '#5F5E5A' }}>Klicka på "Nytt utskick" för att skicka ett meddelande.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {messages.map(m => (
            <div key={m.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid rgba(125,0,55,0.08)', display: 'flex', gap: 14 }}>
              <div style={{ width: 40, height: 40, background: '#CDC3FF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>✉</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#000' }}>{m.subject}</div>
                <div style={{ fontSize: 13, color: '#5F5E5A', marginTop: 2, lineHeight: 1.5 }}>{m.body}</div>
                <div style={{ fontSize: 12, color: '#BC8E4C', marginTop: 6, fontWeight: 500 }}>
                  {m.sentAt} · {m.toCount} mottagare · Till: {m.to} · Från: {m.from}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

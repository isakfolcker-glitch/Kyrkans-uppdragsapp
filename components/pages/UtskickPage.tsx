'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import Icon from '@/components/ui/Icon'

function SendMessageModal() {
  const { groups, people, closeModal, addMessage, profile, currentChurchId } = useApp()
  const [allChecked, setAllChecked]   = useState(false)
  const [selGroups, setSelGroups]     = useState<string[]>([])
  const [subject, setSubject]         = useState('')
  const [body, setBody]               = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const cid = currentChurchId()
  const visibleGroups = groups.filter(group => group.churchId === cid || group.churchId === null)

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
      people.filter(p => p.church === cid && p.groups.includes(g) && p.mail).forEach(p => ids.add(p.mail!))
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
        church_id: cid,
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
      church: cid,
    })
    setLoading(false)
    closeModal()
  }

  return (
    <>
      <h2 className="modal-title">Skicka meddelande</h2>

      <fieldset className="form-field" style={{ border: 'none' }}>
        <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Skicka till</legend>
        <div className="panel" style={{ padding: '6px 14px', marginBottom: 0 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, margin: 0, cursor: 'pointer' }}>
            <input type="checkbox" checked={allChecked} onChange={e => { setAllChecked(e.target.checked); setSelGroups([]) }} style={{ accentColor: '#7D0037', width: 20, height: 20, minHeight: 0 }} />
            <span style={{ fontSize: 15, fontWeight: 500 }}>Alla i församlingen, {people.filter(p => p.church === cid).length} personer</span>
          </label>
          {!allChecked && visibleGroups.map(g => (
            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, margin: 0, fontWeight: 400, cursor: 'pointer' }}>
              <input type="checkbox" checked={selGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} style={{ accentColor: '#7D0037', width: 20, height: 20, minHeight: 0 }} />
              <span style={{ fontSize: 15 }}>{g.label}, {people.filter(p => p.church === cid && p.groups.includes(g.id)).length} personer</span>
            </label>
          ))}
        </div>
      </fieldset>

      {recipients.length > 0 && (
        <div role="status" className="alert alert-green" style={{ marginBottom: 14 }}>
          <Icon name="Check" size={18} />{recipients.length} mottagare valda
        </div>
      )}

      <div className="form-field">
        <label htmlFor="utskick-amne">Ämne</label>
        <input id="utskick-amne" placeholder="ex. Viktig information inför söndagen" value={subject} onChange={e => setSubject(e.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="utskick-text">Meddelande</label>
        <textarea id="utskick-text" style={{ height: 120 }} placeholder="Skriv ditt meddelande här..." value={body} onChange={e => setBody(e.target.value)} />
      </div>

      {error && <div role="alert" className="alert alert-red">{error}</div>}

      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={send} disabled={loading}>
          <Icon name="Send" size={18} />{loading ? 'Skickar...' : `Skicka till ${recipients.length || 'inga'} personer`}
        </button>
      </div>
    </>
  )
}

export default function UtskickPage() {
  const { messages, showModal, currentChurchId, churches } = useApp()
  const cid = currentChurchId()
  const visibleMessages = messages.filter(message => message.church === cid)
  const churchName = churches.find(church => church.id === cid)?.name ?? 'vald församling'
  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Utskick</h1>
          <p className="page-sub">Skicka meddelanden i {churchName}</p>
        </div>
        <button className="btn btn-primary" onClick={() => showModal(<SendMessageModal />)}><Icon name="Plus" size={18} />Nytt utskick</button>
      </div>

      <h2 className="section-label">Tidigare utskick</h2>

      {visibleMessages.length === 0 ? (
        <div className="empty-state panel">
          <div className="empty-state-title">Inga utskick ännu</div>
          <div>Klicka på Nytt utskick för att skicka ett meddelande.</div>
        </div>
      ) : (
        <ul style={{ listStyle: 'none' }}>
          {visibleMessages.map(m => (
            <li key={m.id} className="row-line" style={{ padding: '14px 0', display: 'flex', gap: 12 }}>
              <Icon name="Mail" style={{ color: '#7D0037', marginTop: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 500, color: '#000' }}>{m.subject}</div>
                <div style={{ fontSize: 15, color: 'rgba(0,0,0,0.72)', marginTop: 2, lineHeight: 1.5 }}>{m.body}</div>
                <div style={{ fontSize: 14, color: '#7D0037', marginTop: 6 }}>
                  {m.sentAt} · {m.toCount} mottagare · Till: {m.to} · Från: {m.from}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

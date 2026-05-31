'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'

function SendMessageModal() {
  const { groups, people, closeModal, addMessage, u, isPAdmin, currentChurchId } = useApp()
  const [allChecked, setAllChecked] = useState(false)
  const [selGroups, setSelGroups] = useState<string[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const cid = currentChurchId()

  const toggleGroup = (id: string) => setSelGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  let count = 0, toLabel = ''
  if (allChecked) { count = people.filter(p => p.church === cid && p.role === 'ideell').length; toLabel = 'Alla ideella' }
  else { selGroups.forEach(g => count += people.filter(p => p.groups.includes(g)).length); toLabel = 'Grupp: ' + selGroups.join(', ') }

  const send = () => {
    addMessage({ id: Date.now(), from: u().name, to: toLabel, toCount: count, subject: subject || '(inget ämne)', body: body || '(inget meddelande)', sentAt: 'Idag' })
    closeModal()
    setTimeout(() => alert(`Skickat till ${count} mottagare.`), 50)
  }

  return (
    <>
      <div className="modal-title">✉ Skicka meddelande</div>
      <div className="form-field">
        <label>Skicka till</label>
        <div style={{ background: '#F1EFE8', borderRadius: 8, padding: '10px 13px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
            <input type="checkbox" checked={allChecked} onChange={e => setAllChecked(e.target.checked)} style={{ accentColor: '#534AB7' }} />
            <span style={{ fontSize: 13 }}>Alla ideella – {people.filter(p => p.church === cid && p.role === 'ideell').length} pers</span>
          </label>
          {groups.map(g => (
            <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer' }}>
              <input type="checkbox" checked={selGroups.includes(g.id)} onChange={() => toggleGroup(g.id)} style={{ accentColor: '#534AB7' }} />
              <span style={{ fontSize: 13 }}>Grupp: {g.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#888780', marginBottom: 10 }}>{count > 0 ? `${count} mottagare valda` : 'Välj mottagare ovan'}</div>
      <div className="form-field"><label>Ämne</label><input placeholder="ex. Viktig information" value={subject} onChange={e => setSubject(e.target.value)} /></div>
      <div className="form-field"><label>Meddelande</label><textarea placeholder="Skriv ditt meddelande här..." value={body} onChange={e => setBody(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={send}>✉ Skicka</button>
      </div>
    </>
  )
}

export default function UtskickPage() {
  const { messages, showModal } = useApp()
  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div><h1 className="page-title">Utskick</h1><p className="page-sub">Meddelanden till ideella</p></div>
        <button className="btn btn-primary" onClick={() => showModal(<SendMessageModal />)}>✉ Skicka meddelande</button>
      </div>
      <div className="section-label">Tidigare utskick</div>
      {messages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: '#888780' }}>Inga utskick ännu.</div>
      ) : (
        messages.map(m => (
          <div key={m.id} className="inbox-item">
            <div className="inbox-icon ii-purple">👥</div>
            <div className="inbox-body">
              <div className="inbox-title">{m.to}</div>
              <div className="inbox-sub"><strong>{m.subject}</strong> – {m.body}</div>
              <div className="inbox-time">{m.sentAt} · {m.toCount} mottagare · {m.from}</div>
            </div>
          </div>
        ))
      )}
    </div>
  )
}

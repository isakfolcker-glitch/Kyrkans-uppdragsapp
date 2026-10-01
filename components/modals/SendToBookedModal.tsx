'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import Icon, { PassMeta } from '@/components/ui/Icon'

export default function SendToBookedModal({ passId }: { passId: number }) {
  const { passes, closeModal, addMessage, u } = useApp()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const p = passes.find(x => x.id === passId)
  if (!p) return null
  const withMail = p.bookings.filter(b => b.mail).length

  const send = () => {
    addMessage({ id: Date.now(), from: u().name, to: `Bokade – ${p.title}`, toCount: p.bookings.length, subject: subject || '(inget ämne)', body: body || '(inget meddelande)', sentAt: 'Idag' })
    closeModal()
    setTimeout(() => alert(`Skickat till ${p.bookings.length} bokade.`), 50)
  }

  return (
    <>
      <h2 className="modal-title">Skicka till bokade</h2>
      <div className="panel" style={{ padding: '12px 14px', marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: '#000' }}>{p.title}</div>
        <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)' }}>{p.date} · {p.time} · {p.bookings.length} mottagare</div>
      </div>
      {p.bookings.length - withMail > 0 && (
        <div className="alert alert-amber"><Icon name="Alert" size={18} />{p.bookings.length - withMail} bokade saknar e-post.</div>
      )}
      <div className="form-field"><label htmlFor="sendtobooked-f1">Ämne</label><input id="sendtobooked-f1" placeholder="ex. Påminnelse om passet" value={subject} onChange={e => setSubject(e.target.value)} /></div>
      <div className="form-field"><label htmlFor="sendtobooked-f2">Meddelande</label><textarea id="sendtobooked-f2" placeholder="Skriv ditt meddelande..." value={body} onChange={e => setBody(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={send}><Icon name="Send" size={18} />Skicka ({withMail} personer)</button>
      </div>
    </>
  )
}

'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'

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
      <div className="modal-header">
        <div className="modal-header-quarter" />
        <div className="modal-title">✉ Skicka till bokade</div>
      </div>
      <div className="modal-body">
      <div style={{ background: '#F1EFE8', borderRadius: 8, padding: '10px 13px', marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>{p.title}</div>
        <div style={{ fontSize: 12, color: '#888780' }}>{p.date} · {p.time} · {p.bookings.length} mottagare</div>
      </div>
      {p.bookings.length - withMail > 0 && (
        <div className="alert alert-amber">⚠️ {p.bookings.length - withMail} bokade saknar e-post.</div>
      )}
      <div className="form-field"><label>Ämne</label><input placeholder="ex. Påminnelse om passet" value={subject} onChange={e => setSubject(e.target.value)} /></div>
      <div className="form-field"><label>Meddelande</label><textarea placeholder="Skriv ditt meddelande..." value={body} onChange={e => setBody(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary" onClick={send}>✉ Skicka ({withMail} pers)</button>
      </div>
      </div>
    </>
  )
}

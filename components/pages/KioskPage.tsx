'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { ini2 } from '@/lib/appData'

function KioskBookModal({ passId, onSuccess }: { passId: number; onSuccess: () => void }) {
  const { passes, people, closeModal, addBooking, addPerson, nextPersonId } = useApp()
  const [name, setName] = useState('')
  const [mail, setMail] = useState('')
  const [tel, setTel] = useState('')
  const p = passes.find(x => x.id === passId)
  if (!p) return null

  const submit = () => {
    if (!name.trim()) { alert('Ange ditt namn'); return }
    const existing = mail ? people.find(x => x.mail && x.mail.toLowerCase() === mail.toLowerCase()) : null
    if (existing) {
      addBooking(passId, { personId: existing.id, name: existing.name, ini: existing.ini, av: existing.av, ac: existing.ac, source: 'kiosk', noAccount: false, mail, tel })
    } else {
      const id = nextPersonId()
      addPerson({ id, name: name.trim(), mail, phone: tel, ini: ini2(name), av: '#F1EFE8', ac: '#2C2C2A', church: 0, groups: [], role: 'ideell', isEmployee: false, adminLevel: 'none', available: true })
      addBooking(passId, { personId: id, name: name.trim(), ini: ini2(name), av: '#F1EFE8', ac: '#2C2C2A', source: 'kiosk', noAccount: true, mail, tel })
    }
    onSuccess()
  }

  return (
    <>
      <div style={{ background: '#F1EFE8', borderRadius: 10, padding: 14, marginBottom: 18 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#2C2C2A', marginBottom: 7 }}>{p.title}</div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#5F5E5A', flexWrap: 'wrap' }}>
          <span>📅 {p.date}</span><span>🕐 {p.time}</span><span>📍 {p.plats}</span>
        </div>
      </div>
      <div className="kiosk-fld"><label>Namn <span style={{ color: '#791F1F' }}>*</span></label><input placeholder="Ditt för- och efternamn" value={name} onChange={e => setName(e.target.value)} /></div>
      <div className="kiosk-fld"><label>E-post <span style={{ color: '#888780', fontWeight: 400 }}>(rekommenderas)</span></label><input type="email" placeholder="din@epost.se" value={mail} onChange={e => setMail(e.target.value)} /></div>
      <div className="kiosk-fld"><label>Telefon <span style={{ color: '#888780', fontWeight: 400 }}>(rekommenderas)</span></label><input placeholder="073-..." value={tel} onChange={e => setTel(e.target.value)} /></div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Avbryt</button>
        <button className="btn btn-primary btn-lg" onClick={submit}>✓ Boka mig på passet</button>
      </div>
    </>
  )
}

export default function KioskPage() {
  const { passes, showModal, closeModal } = useApp()
  const visible = passes.filter(p => p.pubStatus === 'live' && !p.cancelled && p.filled < p.spots && p.kioskVisible && p.church === 0)

  const openModal = (passId: number) => {
    const doSuccess = () => {
      const p = passes.find(x => x.id === passId)
      showModal(
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{ fontSize: 56, color: '#085041', marginBottom: 14 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2C2C2A', marginBottom: 8 }}>Tack, du är uppskriven!</div>
          <div style={{ fontSize: 14, color: '#888780', marginBottom: 18, lineHeight: 1.6 }}>Du är nu anmäld till passet nedan.<br />Har du frågor kan du kontakta ansvarig.</div>
          {p && (
            <div style={{ background: '#F1EFE8', borderRadius: 10, padding: 14, marginBottom: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#2C2C2A', marginBottom: 8 }}>{p.title}</div>
              <div style={{ display: 'flex', gap: 12, fontSize: 13, color: '#5F5E5A', flexWrap: 'wrap' }}>
                <span>📅 {p.date}</span><span>🕐 {p.time}</span><span>📍 {p.plats}</span>
              </div>
            </div>
          )}
          <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }} onClick={closeModal}>🏠 Tillbaka</button>
        </div>
      )
    }
    showModal(<KioskBookModal passId={passId} onSuccess={doSuccess} />)
  }

  return (
    <div className="kiosk-wrap">
      <div className="kiosk-header">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#2C2C2A', color: '#F1EFE8', borderRadius: 8, padding: '5px 12px', fontSize: 12, marginBottom: 14 }}>📟 Anmälningsstation</div>
        <h1>Skriv upp dig som volontär</h1>
        <p>Välj ett pass och fyll i dina uppgifter.<br />Du behöver inte ha konto sedan tidigare.</p>
      </div>

      {visible.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>
          <div style={{ fontSize: 40, color: '#D3D1C7', marginBottom: 14 }}>📅</div>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Inga lediga pass just nu</div>
        </div>
      ) : (
        visible.map(p => {
          const left = p.spots - p.filled
          return (
            <div key={p.id} className="kiosk-pass-card" onClick={() => openModal(p.id)}>
              <div className="kiosk-pass-title">{p.title}</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 13, color: '#5F5E5A', marginBottom: 10, flexWrap: 'wrap' }}>
                <span>📅 {p.date}</span><span>🕐 {p.time}</span><span>📍 {p.plats}</span>
              </div>
              <div style={{ fontSize: 13, color: '#888780', marginBottom: 14, lineHeight: 1.5 }}>{p.desc}</div>
              <div style={{ display: 'flex', gap: 5, marginBottom: 14, alignItems: 'center' }}>
                {Array.from({ length: Math.min(p.spots, 10) }, (_, i) => (
                  <div key={i} style={{ width: 14, height: 14, borderRadius: '50%', background: i < p.filled ? '#534AB7' : '#F1EFE8', border: i < p.filled ? 'none' : '1px solid #B4B2A9' }} />
                ))}
                <span style={{ fontSize: 14, fontWeight: 500, color: left === 1 ? '#BA7517' : '#0F6E56', marginLeft: 6 }}>{left} plats{left !== 1 ? 'er' : ''} kvar</span>
              </div>
              <button className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>✍ Anmäl mig till detta pass</button>
            </div>
          )
        })
      )}
    </div>
  )
}

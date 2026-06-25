'use client'
import { useApp } from '@/lib/appStore'
import ManualAssignModal from './ManualAssignModal'
import SendToBookedModal from './SendToBookedModal'
import PassQASection from './PassQASection'

export default function PassDetailModal({ passId }: { passId: number }) {
  const { passes, closeModal, removeBooking, canAddBkg, canRemoveBkg, canMsgBooked, showModal } = useApp()
  const p = passes.find(x => x.id === passId)
  if (!p) return null

  return (
    <>
      <div className="modal-title">📅 {p.title}</div>
      <div style={{ fontSize: 12, color: '#5F5E5A', marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>📅 {p.date}</span><span>🕐 {p.time}</span><span>📍 {p.plats}</span>
      </div>
      <div className="pass-vk" style={{ marginBottom: 12 }}><strong>{p.vk}</strong> &nbsp;{p.tel}</div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="section-label" style={{ margin: 0 }}>Bokade ({p.bookings.length}/{p.spots})</div>
        {canAddBkg(p) && p.bookings.length < p.spots && (
          <button className="btn btn-purple btn-sm" onClick={() => showModal(<ManualAssignModal passId={passId} />)}>+ Tilldela</button>
        )}
      </div>

      {p.bookings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: '#888780', fontSize: 12 }}>Ingen bokad ännu.</div>
      ) : (
        p.bookings.map((b, i) => (
          <div key={i} className="booked-row">
            <div className="booked-av" style={{ background: b.av, color: b.ac }}>{b.ini}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#2C2C2A' }}>{b.name}</div>
              <div style={{ fontSize: 11, color: '#888780' }}>{b.mail || b.tel || ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {b.source === 'kiosk' && <span className="badge badge-kiosk">Kiosk</span>}
              {b.source === 'manual' && <span className="badge badge-manual">Manuellt</span>}
              {b.noAccount && <span className="badge badge-noaccount">Ej konto</span>}
              {canRemoveBkg(p) && (
                <button className="btn btn-warn btn-sm" onClick={() => { removeBooking(passId, i); closeModal() }}>✕</button>
              )}
            </div>
          </div>
        ))
      )}

      {canAddBkg(p) && p.bookings.length < p.spots && (
        <button className="btn btn-purple" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => showModal(<ManualAssignModal passId={passId} />)}>
          + Tilldela manuellt
        </button>
      )}

      {canMsgBooked(p) && p.bookings.length > 0 && (
        <button className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => showModal(<SendToBookedModal passId={passId} />)}>
          ✉ Skicka till bokade ({p.bookings.length} pers)
        </button>
      )}

      <PassQASection passId={passId} />

      {p.history?.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 16 }}>Historik</div>
          {p.history.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: '#888780', padding: '4px 0', borderBottom: '1px solid #F1EFE8' }}>{e}</div>
          ))}
        </>
      )}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Stäng</button>
      </div>
    </>
  )
}

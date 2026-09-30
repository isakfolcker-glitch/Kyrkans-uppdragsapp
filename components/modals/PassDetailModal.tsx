'use client'
import { useApp } from '@/lib/appStore'
import Icon, { PassMeta } from '@/components/ui/Icon'
import { avBg, avFg } from '@/lib/avatarColors'
import ManualAssignModal from './ManualAssignModal'
import SendToBookedModal from './SendToBookedModal'
import PassQASection from './PassQASection'
import ConfirmModal from './ConfirmModal'

export default function PassDetailModal({ passId }: { passId: number }) {
  const { passes, closeModal, removeBooking, canAddBkg, canRemoveBkg, canMsgBooked, showModal } = useApp()
  const p = passes.find(x => x.id === passId)
  if (!p) return null

  return (
    <>
      <h2 className="modal-title">{p.title}</h2>
      <PassMeta date={p.date} time={p.time} plats={p.plats} className="meta-row" />
      <div style={{ height: 12 }} />
      <div className="pass-vk" style={{ marginBottom: 12 }}><strong>{p.vk}</strong> &nbsp;{p.tel}</div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <h3 className="section-label" style={{ margin: 0 }}>Bokade ({p.bookings.length} av {p.spots})</h3>
        {canAddBkg(p) && p.bookings.length < p.spots && (
          <button className="btn btn-purple btn-sm" onClick={() => showModal(<ManualAssignModal passId={passId} />)}><Icon name="UserPlus" size={18} />Tilldela</button>
        )}
      </div>

      {p.bookings.length === 0 ? (
        <div className="empty-state" style={{ padding: '20px 0' }}>Ingen bokad ännu.</div>
      ) : (
        p.bookings.map((b, i) => (
          <div key={i} className="booked-row">
            <div className="booked-av" aria-hidden="true" style={{ background: avBg(b.av), color: avFg(b.ac) }}>{b.ini}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: '#000' }}>{b.name}</div>
              <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)' }}>{b.mail || b.tel || ''}</div>
            </div>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {b.source === 'kiosk' && <span className="badge badge-kiosk">Kiosk</span>}
              {b.source === 'manual' && <span className="badge badge-manual">Manuellt</span>}
              {b.noAccount && <span className="badge badge-noaccount">Ej konto</span>}
              {canRemoveBkg(p) && (
                <button
                  className="btn btn-warn btn-sm btn-icon"
                  aria-label={`Ta bort ${b.name} från passet`}
                  onClick={() => showModal(
                    <ConfirmModal
                      icon="Alert"
                      title={`Ta bort ${b.name} från passet?`}
                      sub="Personens bokning tas bort. Du kan lägga till personen igen manuellt om det behövs."
                      confirmLabel="Ta bort bokning"
                      confirmCls="btn-warn"
                      onConfirm={() => removeBooking(passId, i)}
                    />
                  )}
                >
                  <Icon name="X" size={18} />
                </button>
              )}
            </div>
          </div>
        ))
      )}

      {canAddBkg(p) && p.bookings.length < p.spots && (
        <button className="btn btn-purple" style={{ width: '100%', marginTop: 10 }} onClick={() => showModal(<ManualAssignModal passId={passId} />)}>
          <Icon name="UserPlus" size={18} />Tilldela manuellt
        </button>
      )}

      {canMsgBooked(p) && p.bookings.length > 0 && (
        <button className="btn btn-secondary" style={{ width: '100%', marginTop: 10 }} onClick={() => showModal(<SendToBookedModal passId={passId} />)}>
          <Icon name="Mail" size={18} />Skicka till bokade ({p.bookings.length} personer)
        </button>
      )}

      <PassQASection passId={passId} />

      {p.history?.length > 0 && (
        <>
          <h3 className="section-label" style={{ marginTop: 16 }}>Historik</h3>
          {p.history.map((e, i) => (
            <div key={i} style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', padding: '6px 0', borderBottom: '1px solid rgba(125,0,55,0.18)' }}>{e}</div>
          ))}
        </>
      )}
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={closeModal}>Stäng</button>
      </div>
    </>
  )
}

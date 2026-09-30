'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { PassData } from '@/lib/appData'
import { gLabel, gCls } from '@/lib/appData'
import PassDetailModal from '@/components/modals/PassDetailModal'
import EditPassModal from '@/components/modals/EditPassModal'
import ConfirmModal from '@/components/modals/ConfirmModal'
import PassQAModal from '@/components/modals/PassQAModal'
import UnbookConfirmModal from '@/components/modals/UnbookConfirmModal'
import { isLockedForSelfCancel } from '@/lib/passTiming'
import Icon, { PassMeta } from '@/components/ui/Icon'
import { avBg, avFg } from '@/lib/avatarColors'

function Dots({ spots, filled }: { spots: number; filled: number }) {
  return (
    <div className="dots">
      {Array.from({ length: Math.min(spots, 8) }, (_, i) => (
        <div key={i} className={`dot ${i < filled ? 'dot-on' : 'dot-off'}`} />
      ))}
    </div>
  )
}

function SpotsText({ pass, adminMode }: { pass: PassData; adminMode?: boolean }) {
  if (pass.filled >= pass.spots) {
    const wl = pass.waitlistCount ?? 0
    return (
      <div>
        <div className="spots-txt spots-full">Fullbokat</div>
        {wl > 0 && <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.72)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="Hourglass" size={16} />{wl} i kö{adminMode ? '' : ''}</div>}
      </div>
    )
  }
  const left = pass.spots - pass.filled
  return <div className={`spots-txt ${left === 1 ? 'spots-low' : 'spots-ok'}`}>{left} plats{left !== 1 ? 'er' : ''} kvar</div>
}

function BookBtn({ pass }: { pass: PassData }) {
  const { selfBookings, selfWaitlist, doBook, joinWaitlist, leaveWaitlist, u, showModal } = useApp()
  if (pass.cancelled) return <span className="btn btn-disabled">Inställt</span>
  if (selfBookings[pass.id]) {
    const locked = isLockedForSelfCancel(pass.date, pass.time)
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span className="status-pill"><Icon name="Check" size={16} />Du är bokad</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => showModal(<PassQAModal passId={pass.id} />)}>
          <Icon name="Message" size={18} />Frågor
        </button>
        {locked ? (
          <span className="btn btn-disabled btn-sm" title="Mindre än 24 timmar kvar, kontakta ansvarig för att avboka"><Icon name="Lock" size={18} />Låst</span>
        ) : (
          <button
            className="btn btn-warn btn-sm"
            onClick={() => showModal(
              <UnbookConfirmModal passId={pass.id} title={pass.title} date={pass.date} time={pass.time} />
            )}
          >
            Avboka
          </button>
        )}
      </div>
    )
  }
  if (selfWaitlist[pass.id]) {
    const pos = selfWaitlist[pass.id]
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="status-pill status-pill-quiet"><Icon name="Hourglass" size={16} />Plats {pos} i kön</span>
        <button className="btn btn-warn btn-sm" onClick={() => leaveWaitlist(pass.id)}>Lämna kön</button>
      </div>
    )
  }
  if (pass.filled >= pass.spots) {
    if (!u().available) return <span className="btn btn-disabled">Otillgänglig</span>
    return <button className="btn btn-secondary" onClick={() => joinWaitlist(pass.id)}><Icon name="Hourglass" size={18} />Ställ dig i kön</button>
  }
  if (!u().available) return <span className="btn btn-disabled">Otillgänglig</span>
  return <button className="btn btn-primary" onClick={() => doBook(pass.id)}>Ta passet</button>
}

export default function PassCard({ pass, adminMode }: { pass: PassData; adminMode: boolean }) {
  const { showModal, canViewBkgs, canEditPass, canCancelPass, canDeletePass, publishNow, cancelPass, deletePass, getResponsibleNames, groups } = useApp()
  const [reminding, setReminding] = useState(false)

  const sendReminder = async () => {
    setReminding(true)
    const res = await fetch(`/api/passes/${pass.id}/remind`, { method: 'POST' })
    const data = await res.json()
    setReminding(false)
    if (!res.ok) alert(`Fel: ${data.error}`)
    else alert(`Påminnelse skickad till ${data.sent} person${data.sent !== 1 ? 'er' : ''}`)
  }
  const isSch = pass.pubStatus === 'scheduled'
  const resp = getResponsibleNames(pass)

  const confirmCancel = () => showModal(
    <ConfirmModal
      cls="alert-red"
      icon="Alert"
      title={`Ställ in "${pass.title}"?`}
      sub={pass.bookings.length ? `${pass.bookings.length} bokade får e-post.` : 'Passet har inga bokningar.'}
      confirmLabel="Ställ in"
      confirmCls="btn-warn"
      onConfirm={() => cancelPass(pass.id)}
    />
  )

  const confirmDelete = () => showModal(
    <ConfirmModal
      cls="alert-red"
      icon="Trash"
      title={`Ta bort "${pass.title}"?`}
      sub={`${pass.bookings.length ? `${pass.bookings.length} bokade får e-post. ` : ''}Det går inte att ångra.`}
      confirmLabel="Ta bort"
      confirmCls="btn-danger"
      onConfirm={() => deletePass(pass.id)}
    />
  )

  return (
    <div className={`pass-card${isSch ? ' scheduled' : ''}${pass.cancelled ? ' cancelled' : ''}`}>
      <div className="pass-card-body">
      {pass.cancelled && (
        <div className="alert alert-red" style={{ marginBottom: 10 }}><Icon name="Alert" size={18} />Inställt, de bokade har fått e-post</div>
      )}
      {isSch && adminMode && (
        <div className="alert alert-amber" style={{ marginBottom: 10 }}><Icon name="Clock" size={18} />Schemalagt, publiceras {pass.pubDate}</div>
      )}

      <div className="pass-card-top">
        <div className="pass-title">{pass.title}</div>
        <div className="pass-tags">
          {pass.groups.map(g => (
            <span key={g} className={`tag ${gCls(g, groups)}`}>{gLabel(g, groups)}</span>
          ))}
          {adminMode && pass.kioskVisible && (
            <span className="tag tag-kiosk">Kiosk</span>
          )}
        </div>
      </div>

      <PassMeta date={pass.date} time={pass.time} plats={pass.plats} />

      <div className="pass-vk"><strong>{pass.vk}</strong> &nbsp;{pass.tel}</div>
      {resp && adminMode && <div className="pass-responsible"><Icon name="User" size={16} />Ansvarig: {resp}</div>}
      <div className="pass-desc">{pass.desc}</div>

      {adminMode && pass.bookings.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.72)' }}>Bokade:</span>
          {pass.bookings.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(125,0,55,0.06)', borderRadius: 20, padding: '2px 8px 2px 4px' }}>
              <div aria-hidden="true" style={{ width: 26, height: 26, borderRadius: '50%', background: avBg(b.av), color: avFg(b.ac), fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{b.ini}</div>
              <span style={{ fontSize: 13, color: '#000' }}>{b.name.split(' ')[0]}</span>
              {b.source === 'kiosk' && <span style={{ fontSize: 13, color: '#7D0037' }}>(kiosk)</span>}
            </div>
          ))}
        </div>
      )}

      <div className="pass-footer">
        <div><Dots spots={pass.spots} filled={pass.filled} /><SpotsText pass={pass} adminMode={adminMode} /></div>
        <div className="pass-actions">
          {adminMode ? (
            <>
              {!pass.cancelled && isSch && (
                <button className="btn btn-amber btn-sm" onClick={() => publishNow(pass.id)}><Icon name="Play" size={18} />Publicera nu</button>
              )}
              {!pass.cancelled && canViewBkgs(pass) && (
                <button className="btn btn-purple btn-sm" onClick={() => showModal(<PassDetailModal passId={pass.id} />)}><Icon name="Users" size={18} />Bokningar</button>
              )}
              {!pass.cancelled && pass.bookings.length > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={sendReminder} disabled={reminding} title="Skicka påminnelse till bokade">
                  <Icon name="Mail" size={18} />{reminding ? 'Skickar...' : 'Påminn'}
                </button>
              )}
              {!pass.cancelled && canEditPass(pass) && (
                <button className="btn btn-secondary btn-sm" onClick={() => showModal(<EditPassModal passId={pass.id} />)}><Icon name="Pencil" size={18} />Redigera</button>
              )}
              {!pass.cancelled && canCancelPass(pass) && (
                <button className="btn btn-warn btn-sm" onClick={confirmCancel}><Icon name="Ban" size={18} />Ställ in</button>
              )}
              {canDeletePass() && (
                <button className="btn btn-danger btn-sm" onClick={confirmDelete}><Icon name="Trash" size={18} />Ta bort</button>
              )}
            </>
          ) : (
            <BookBtn pass={pass} />
          )}
        </div>
      </div>
      </div>
    </div>
  )
}

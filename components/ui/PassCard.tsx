'use client'
import { useApp } from '@/lib/appStore'
import { PassData } from '@/lib/appData'
import { gLabel, gCls } from '@/lib/appData'
import PassDetailModal from '@/components/modals/PassDetailModal'
import EditPassModal from '@/components/modals/EditPassModal'
import ConfirmModal from '@/components/modals/ConfirmModal'

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
        {wl > 0 && <div style={{ fontSize: 11, color: '#085041', marginTop: 2 }}>⏳ {wl} i kö{adminMode ? '' : ''}</div>}
      </div>
    )
  }
  const left = pass.spots - pass.filled
  return <div className={`spots-txt ${left === 1 ? 'spots-low' : 'spots-ok'}`}>{left} plats{left !== 1 ? 'er' : ''} kvar</div>
}

function BookBtn({ pass }: { pass: PassData }) {
  const { selfBookings, selfWaitlist, doBook, doUnbook, joinWaitlist, leaveWaitlist, u } = useApp()
  if (pass.cancelled) return <span className="btn btn-disabled">Inställt</span>
  if (selfBookings[pass.id]) return (
    <div style={{ display: 'flex', gap: 6 }}>
      <span className="btn btn-success">✓ Bokad</span>
      <button className="btn btn-warn btn-sm" onClick={() => doUnbook(pass.id)}>Avboka</button>
    </div>
  )
  if (selfWaitlist[pass.id]) {
    const pos = selfWaitlist[pass.id]
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ background: '#F0FAF6', color: '#085041', border: '1.5px solid #085041', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 600 }}>
          ⏳ #{pos} i kön
        </span>
        <button className="btn btn-warn btn-sm" onClick={() => leaveWaitlist(pass.id)}>Lämna kön</button>
      </div>
    )
  }
  if (pass.filled >= pass.spots) {
    if (!u().available) return <span className="btn btn-disabled">Otillgänglig</span>
    return <button className="btn btn-secondary" onClick={() => joinWaitlist(pass.id)}>⏳ Ställ dig i kön</button>
  }
  if (!u().available) return <span className="btn btn-disabled">Otillgänglig</span>
  return <button className="btn btn-primary" onClick={() => doBook(pass.id)}>Jag tar passet</button>
}

export default function PassCard({ pass, adminMode }: { pass: PassData; adminMode: boolean }) {
  const { showModal, canViewBkgs, canEditPass, canCancelPass, canDeletePass, publishNow, cancelPass, deletePass, getResponsibleNames } = useApp()
  const isSch = pass.pubStatus === 'scheduled'
  const resp = getResponsibleNames(pass)

  const confirmCancel = () => showModal(
    <ConfirmModal
      cls="alert-red"
      icon="⚠️"
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
      icon="🗑"
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
        <div className="alert alert-red" style={{ marginBottom: 10 }}>⚠️ Inställt – bokade har fått e-post</div>
      )}
      {isSch && adminMode && (
        <div className="alert alert-amber" style={{ marginBottom: 10 }}>🕐 Schemalagt – publiceras {pass.pubDate}</div>
      )}

      <div className="pass-card-top">
        <div className="pass-title">{pass.title}</div>
        <div className="pass-tags">
          {pass.groups.map(g => (
            <span key={g} className={`tag ${gCls(g)}`}>{gLabel(g)}</span>
          ))}
          {adminMode && pass.kioskVisible && (
            <span className="tag tag-kiosk">📟 Kiosk</span>
          )}
        </div>
      </div>

      <div className="pass-meta">
        <span>📅 {pass.date}</span>
        <span>🕐 {pass.time}</span>
        <span>📍 {pass.plats}</span>
      </div>

      <div className="pass-vk"><strong>{pass.vk}</strong> &nbsp;{pass.tel}</div>
      {resp && adminMode && <div className="pass-responsible">👤 Ansvarig: {resp}</div>}
      <div className="pass-desc">{pass.desc}</div>

      {adminMode && pass.bookings.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#888780' }}>Bokade:</span>
          {pass.bookings.map((b, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, background: '#F1EFE8', borderRadius: 20, padding: '2px 8px 2px 4px' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: b.av, color: b.ac, fontSize: 9, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{b.ini}</div>
              <span style={{ fontSize: 11, color: '#2C2C2A' }}>{b.name.split(' ')[0]}</span>
              {b.source === 'kiosk' && <span style={{ fontSize: 9, color: '#534AB7' }}>(k)</span>}
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
                <button className="btn btn-amber btn-sm" onClick={() => publishNow(pass.id)}>▶ Publicera nu</button>
              )}
              {!pass.cancelled && canViewBkgs(pass) && (
                <button className="btn btn-purple btn-sm" onClick={() => showModal(<PassDetailModal passId={pass.id} />)}>👥 Bokningar</button>
              )}
              {!pass.cancelled && canEditPass(pass) && (
                <button className="btn btn-secondary btn-sm" onClick={() => showModal(<EditPassModal passId={pass.id} />)}>✏️</button>
              )}
              {!pass.cancelled && canCancelPass(pass) && (
                <button className="btn btn-warn btn-sm" onClick={confirmCancel}>🚫</button>
              )}
              {canDeletePass() && (
                <button className="btn btn-danger btn-sm" onClick={confirmDelete}>🗑</button>
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

'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { gLabel, gCls } from '@/lib/appData'
import { isLockedForSelfCancel } from '@/lib/passTiming'
import PassQAModal from '@/components/modals/PassQAModal'
import UnbookConfirmModal from '@/components/modals/UnbookConfirmModal'
import Icon, { PassMeta } from '@/components/ui/Icon'

export default function MinaBokningarPage() {
  const { passes, selfBookings, showModal, currentChurchId } = useApp()
  const [showOld, setShowOld] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const churchId = currentChurchId()
  const mine = passes.filter(p => p.church === churchId && selfBookings[p.id])
  const upcoming  = mine.filter(p => !p.cancelled && p.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const old       = mine.filter(p => !p.cancelled && p.date < today).sort((a, b) => b.date.localeCompare(a.date))
  const cancelled = mine.filter(p => p.cancelled)

  const BookingRow = ({ p, past = false }: { p: typeof mine[0]; past?: boolean }) => (
    <div key={p.id} className="pass-card" style={past ? { opacity: 0.75 } : undefined}>
      <div className="pass-card-body">
      <div className="pass-card-top">
        <div className="pass-title">{p.title}</div>
        <div className="pass-tags">{p.groups.map(g => <span key={g} className={`tag ${gCls(g)}`}>{gLabel(g)}</span>)}</div>
      </div>
      <PassMeta date={p.date} time={p.time} plats={p.plats} />
      <div className="pass-vk"><strong>{p.vk}</strong> &nbsp;{p.tel}</div>
      <div className="pass-footer">
        <span />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="status-pill"><Icon name="Check" size={16} />{past ? 'Du var bokad' : 'Du är bokad'}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => showModal(<PassQAModal passId={p.id} />)}>
            <Icon name="Message" size={18} />Frågor
          </button>
          {!past && (
            isLockedForSelfCancel(p.date, p.time) ? (
              <span className="btn btn-disabled btn-sm" title="Mindre än 24 timmar kvar, kontakta ansvarig för att avboka"><Icon name="Lock" size={18} />Låst</span>
            ) : (
              <button
                className="btn btn-warn btn-sm"
                onClick={() => showModal(
                  <UnbookConfirmModal passId={p.id} title={p.title} date={p.date} time={p.time} />
                )}
              >
                Avboka
              </button>
            )
          )}
        </div>
      </div>
      </div>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mina bokningar</h1>
        <p className="page-sub">Pass du har bokat dig på</p>
      </div>
      {mine.length === 0 ? (
        <div className="empty-state">Inga bokade pass ännu.</div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <div className="section-label">Kommande</div>
              <div className="pass-list">
                {upcoming.map(p => <BookingRow key={p.id} p={p} />)}
              </div>
            </>
          )}
          {upcoming.length === 0 && old.length === 0 && cancelled.length === 0 && (
            <div className="empty-state">Inga kommande bokningar.</div>
          )}
          {cancelled.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 16 }}>Inställda</div>
              <div className="pass-list">
                {cancelled.map(p => (
                  <div key={p.id} className="pass-card cancelled">
                    <div className="pass-card-body">
                      <div className="alert alert-red" style={{ marginBottom: 8 }}><Icon name="Alert" size={18} />Inställt</div>
                      <div className="pass-title">{p.title}</div>
                      <PassMeta date={p.date} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {old.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <button type="button" className="toggle-link" aria-expanded={showOld} onClick={() => setShowOld(v => !v)}>
                <Icon name={showOld ? 'ChevronDown' : 'ChevronRight'} size={18} />
                {showOld ? 'Dölj gamla bokningar' : `Gamla bokningar (${old.length})`}
              </button>
              {showOld && (
                <div className="pass-list" style={{ marginTop: 10 }}>
                  {old.map(p => <BookingRow key={p.id} p={p} past />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

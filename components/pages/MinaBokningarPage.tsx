'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { gLabel, gCls } from '@/lib/appData'

export default function MinaBokningarPage() {
  const { passes, selfBookings, doUnbook } = useApp()
  const [showOld, setShowOld] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  const mine = passes.filter(p => selfBookings[p.id])
  const upcoming  = mine.filter(p => !p.cancelled && p.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const old       = mine.filter(p => !p.cancelled && p.date < today).sort((a, b) => b.date.localeCompare(a.date))
  const cancelled = mine.filter(p => p.cancelled)

  const BookingRow = ({ p, past = false }: { p: typeof mine[0]; past?: boolean }) => (
    <div key={p.id} className="pass-card" style={past ? { opacity: 0.7 } : undefined}>
      <div className="pass-card-top">
        <div className="pass-title">{p.title}</div>
        <div className="pass-tags">{p.groups.map(g => <span key={g} className={`tag ${gCls(g)}`}>{gLabel(g)}</span>)}</div>
      </div>
      <div className="pass-meta">
        <span>📅 {p.date}</span><span>🕐 {p.time}</span><span>📍 {p.plats}</span>
      </div>
      <div className="pass-vk"><strong>{p.vk}</strong> &nbsp;{p.tel}</div>
      <div className="pass-footer">
        <span />
        <div style={{ display: 'flex', gap: 6 }}>
          <span className="btn btn-success btn-sm">✓ Bokad</span>
          {!past && <button className="btn btn-warn btn-sm" onClick={() => doUnbook(p.id)}>Avboka</button>}
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
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>Inga bokade pass ännu.</div>
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
            <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>Inga kommande bokningar.</div>
          )}
          {cancelled.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 16 }}>Inställda</div>
              <div className="pass-list">
                {cancelled.map(p => (
                  <div key={p.id} className="pass-card cancelled">
                    <div className="alert alert-red" style={{ marginBottom: 8 }}>⚠️ Inställt</div>
                    <div className="pass-title">{p.title}</div>
                    <div className="pass-meta" style={{ marginTop: 6 }}><span>📅 {p.date}</span></div>
                  </div>
                ))}
              </div>
            </>
          )}
          {old.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <button
                onClick={() => setShowOld(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#5F5E5A', fontSize: 13, fontWeight: 600, padding: '6px 0' }}
              >
                <span style={{ fontSize: 16 }}>{showOld ? '▾' : '▸'}</span>
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

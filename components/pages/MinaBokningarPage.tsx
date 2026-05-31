'use client'
import { useApp } from '@/lib/appStore'
import { gLabel, gCls } from '@/lib/appData'

export default function MinaBokningarPage() {
  const { passes, selfBookings, doUnbook } = useApp()
  const mine = passes.filter(p => selfBookings[p.id])
  const active = mine.filter(p => !p.cancelled)
  const cancelled = mine.filter(p => p.cancelled)

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
          {active.length > 0 && (
            <>
              <div className="section-label">Kommande</div>
              <div className="pass-list">
                {active.map(p => (
                  <div key={p.id} className="pass-card">
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
                        <button className="btn btn-warn btn-sm" onClick={() => doUnbook(p.id)}>Avboka</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
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
        </>
      )}
    </div>
  )
}

'use client'
import { useApp } from '@/lib/appStore'

export default function OversiktPage() {
  const { people, passes, churches, pastorat, goTo, setChurch } = useApp()
  const guests = people.filter(p => (p as any).role === 'guest').length
  return (
    <div>
      <div className="page-header"><h1 className="page-title">Översikt</h1><p className="page-sub">Pastoratet – alla församlingar</p></div>
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-num">{churches.length}</div><div className="stat-lbl">Församlingar</div></div>
        <div className="stat-card"><div className="stat-num">{people.filter(p => p.role === 'ideell').length}</div><div className="stat-lbl">Ideella</div></div>
        <div className="stat-card"><div className="stat-num">{passes.filter(p => p.pubStatus === 'live' && !p.cancelled).length}</div><div className="stat-lbl">Aktiva pass</div></div>
        <div className="stat-card"><div className="stat-num">{passes.filter(p => p.pubStatus === 'scheduled').length}</div><div className="stat-lbl">Schemalagda</div></div>
      </div>
      {guests > 0 && <div className="alert alert-dark">📟 {guests} gästperson{guests !== 1 ? 'er' : ''} via kiosk väntar på uppföljning.</div>}
      <div className="section-label">Alla församlingar</div>
      {churches.map((c, i) => {
        const pCount = passes.filter(x => x.church === i && !x.cancelled && x.pubStatus === 'live').length
        const pPeople = people.filter(x => x.church === i && x.role === 'ideell').length
        return (
          <div key={i} style={{ background: '#fff', border: '1px solid #D3D1C7', borderRadius: 12, padding: '14px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, background: '#EEEDFE', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#534AB7', fontSize: 18, flexShrink: 0 }}>⛪</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: '#2C2C2A' }}>{c.name}</div>
              <div style={{ fontSize: 12, color: '#888780', marginTop: 2 }}>{pPeople} ideella · {pCount} aktiva pass · Admin: {c.admin}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => { setChurch(i); goTo('pass') }}>Hantera</button>
          </div>
        )
      })}
    </div>
  )
}

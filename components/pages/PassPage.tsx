'use client'
import { useApp } from '@/lib/appStore'
import { gLabel, gCls } from '@/lib/appData'
import PassCard from '@/components/ui/PassCard'
import NewPassModal from '@/components/modals/NewPassModal'

export default function PassPage() {
  const { u, passes, isAdmin, isPAdmin, isFAdmin, activeChurch, groupFilter, churches, setChurch, setFilter, showModal, toggleAvail, currentChurchId } = useApp()
  const usr = u()

  if (isAdmin()) return <AdminPassPage />

  const myGroups = usr.groups
  const cid = usr.churches[0] ?? 0

  const visible = passes.filter(p =>
    p.church === cid &&
    p.pubStatus === 'live' && !p.cancelled &&
    p.groups.some(g => myGroups.includes(g)) &&
    (groupFilter === 'alla' || p.groups.includes(groupFilter))
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pass</h1>
        <p className="page-sub">Pass för dina uppdragsgrupper</p>
      </div>

      {!usr.available && (
        <div className="alert alert-amber">
          🌙 Du är markerad som otillgänglig.{' '}
          <button onClick={toggleAvail} style={{ background: 'none', border: 'none', color: '#633806', fontWeight: 500, cursor: 'pointer', textDecoration: 'underline' }}>Ändra</button>
        </div>
      )}

      {!myGroups.length ? (
        <div className="alert alert-amber">ℹ Du har inga uppdragsgrupper tilldelade ännu. Kontakta din admin.</div>
      ) : (
        <>
          <div className="alert alert-green">
            🔔 Du ser pass för: {myGroups.map(g => <strong key={g}>{gLabel(g)}</strong>).reduce((a, b) => <>{a}, {b}</>)}
          </div>
          <div className="filter-bar">
            <button className={`filter-btn${groupFilter === 'alla' ? ' on' : ''}`} onClick={() => setFilter('alla')}>Alla mina pass</button>
            {myGroups.map(g => (
              <button key={g} className={`filter-btn${groupFilter === g ? ' on' : ''}`} onClick={() => setFilter(g)}>{gLabel(g)}</button>
            ))}
          </div>
          <div className="pass-list">
            {visible.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>Inga pass hittades för dina grupper just nu.</div>
            ) : (
              visible.map(p => <PassCard key={p.id} pass={p} adminMode={false} />)
            )}
          </div>
        </>
      )}
    </div>
  )
}

function AdminPassPage() {
  const { passes, isPAdmin, churches, activeChurch, setChurch, showModal, currentChurchId } = useApp()
  const cid = currentChurchId()
  const sch  = passes.filter(p => p.church === cid && p.pubStatus === 'scheduled')
  const live = passes.filter(p => p.church === cid && p.pubStatus === 'live' && !p.cancelled)
  const inst = passes.filter(p => p.church === cid && p.cancelled)
  const kioskN = passes.filter(p => p.church === cid && p.kioskVisible && p.pubStatus === 'live' && !p.cancelled).length

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Pass</h1>
          <p className="page-sub">{churches[cid]?.name}</p>
        </div>
        <button className="btn btn-primary" onClick={() => showModal(<NewPassModal />)}>+ Nytt pass</button>
      </div>

      {isPAdmin() && (
        <div className="church-bar">
          {churches.map((c, i) => (
            <button key={i} className={`church-btn${activeChurch === i ? ' on' : ''}`} onClick={() => setChurch(i)}>{c.name}</button>
          ))}
        </div>
      )}

      {kioskN > 0 && (
        <div className="alert alert-dark" style={{ marginBottom: 14 }}>📟 {kioskN} pass visas i kiosken just nu.</div>
      )}

      <div className="pass-list">
        {sch.length > 0 && (<><div className="section-label">Schemalagda</div>{sch.map(p => <PassCard key={p.id} pass={p} adminMode />)}</>)}
        {live.length > 0 && (<><div className="section-label" style={{ marginTop: sch.length ? 16 : 0 }}>Live</div>{live.map(p => <PassCard key={p.id} pass={p} adminMode />)}</>)}
        {inst.length > 0 && (<><div className="section-label" style={{ marginTop: 16 }}>Inställda</div>{inst.map(p => <PassCard key={p.id} pass={p} adminMode />)}</>)}
        {!sch.length && !live.length && !inst.length && (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>Inga pass skapade ännu.</div>
        )}
      </div>
    </div>
  )
}

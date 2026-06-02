'use client'
import { useState } from 'react'
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
  const { passes, isPAdmin, churches, activeChurch, setChurch, showModal, currentChurchId, groups } = useApp()
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('alla')
  const cid = currentChurchId()
  const today = new Date().toISOString().slice(0, 10)

  const filtered = passes
    .filter(p => p.church === cid)
    .filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase()))
    .filter(p => groupFilter === 'alla' || p.groups.includes(groupFilter))

  const sch  = filtered.filter(p => p.pubStatus === 'scheduled' && !p.cancelled).sort((a,b) => a.date.localeCompare(b.date))
  const live = filtered.filter(p => p.pubStatus === 'live' && !p.cancelled).sort((a,b) => a.date.localeCompare(b.date))
  const inst = filtered.filter(p => p.cancelled)
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

      {/* Sök + gruppfilter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="🔍 Sök pass..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160, fontSize: 13, padding: '8px 13px', border: '1.5px solid rgba(0,0,0,0.12)', borderRadius: 10, background: '#fff', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <button className={`filter-btn${groupFilter === 'alla' ? ' on' : ''}`} onClick={() => setGroupFilter('alla')}>Alla grupper</button>
        {groups.map(g => (
          <button key={g.id} className={`filter-btn${groupFilter === g.id ? ' on' : ''}`} onClick={() => setGroupFilter(g.id)}>{g.label}</button>
        ))}
      </div>

      <div className="pass-list">
        {sch.length > 0 && (<><div className="section-label">Schemalagda</div>{sch.map(p => <PassCard key={p.id} pass={p} adminMode />)}</>)}
        {live.length > 0 && (<><div className="section-label" style={{ marginTop: sch.length ? 16 : 0 }}>Live</div>{live.map(p => <PassCard key={p.id} pass={p} adminMode />)}</>)}
        {inst.length > 0 && (<><div className="section-label" style={{ marginTop: 16 }}>Inställda</div>{inst.map(p => <PassCard key={p.id} pass={p} adminMode />)}</>)}
        {!sch.length && !live.length && !inst.length && (
          <div style={{ background: '#fff', borderRadius: 16, padding: '40px 24px', textAlign: 'center', border: '1px solid rgba(125,0,55,0.08)' }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>📅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#000', marginBottom: 6 }}>Inga pass skapade ännu</div>
            <div style={{ fontSize: 13, color: '#5F5E5A', marginBottom: 20 }}>Klicka på "+ Nytt pass" för att komma igång.</div>
            <button className="btn btn-primary" onClick={() => showModal(<NewPassModal />)}>+ Skapa första passet</button>
          </div>
        )}
      </div>
    </div>
  )
}

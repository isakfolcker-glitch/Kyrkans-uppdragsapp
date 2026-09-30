'use client'
import { useState } from 'react'
import { useApp } from '@/lib/appStore'
import { gLabel, gCls } from '@/lib/appData'
import PassCard from '@/components/ui/PassCard'
import NewPassModal from '@/components/modals/NewPassModal'
import Icon from '@/components/ui/Icon'

export default function PassPage() {
  const { u, profile, passes, isAdmin, groupFilter, setFilter, toggleAvail, currentChurchId, currentGroups } = useApp()
  const [showOld, setShowOld] = useState(false)
  const usr = u()

  if (isAdmin()) return <AdminPassPage />

  const myGroups = currentGroups()
  const cid = currentChurchId()
  const isAvailable = profile?.available ?? usr.available
  const today = new Date().toISOString().slice(0, 10)

  const base = passes.filter(p =>
    p.church === cid &&
    p.pubStatus === 'live' && !p.cancelled &&
    p.groups.some(g => myGroups.includes(g)) &&
    (groupFilter === 'alla' || p.groups.includes(groupFilter))
  )
  const visible = base.filter(p => p.date >= today).sort((a, b) => a.date.localeCompare(b.date))
  const old     = base.filter(p => p.date < today).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pass</h1>
        <p className="page-sub">Pass för dina uppdragsgrupper</p>
      </div>

      {!isAvailable && (
        <div className="alert alert-amber" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="Moon" size={18} />
          Du är markerad som otillgänglig.
          <button type="button" className="link-btn" onClick={toggleAvail}>Ändra</button>
        </div>
      )}

      {!myGroups.length ? (
        <div className="alert alert-amber"><Icon name="Info" size={18} />Du har inga uppdragsgrupper ännu. Kontakta din admin.</div>
      ) : (
        <>
          <div className="alert alert-green">
            <Icon name="Bell" size={18} /><span>Du ser pass för: {myGroups.map(g => <strong key={g}>{gLabel(g)}</strong>).reduce((a, b) => <>{a}, {b}</>)}</span>
          </div>
          <div className="filter-bar">
            <button className={`filter-btn${groupFilter === 'alla' ? ' on' : ''}`} onClick={() => setFilter('alla')}>Alla mina pass</button>
            {myGroups.map(g => (
              <button key={g} className={`filter-btn${groupFilter === g ? ' on' : ''}`} onClick={() => setFilter(g)}>{gLabel(g)}</button>
            ))}
          </div>
          <div className="pass-list">
            {visible.length === 0 ? (
              <div className="empty-state">Inga kommande pass för dina grupper just nu.</div>
            ) : (
              visible.map(p => <PassCard key={p.id} pass={p} adminMode={false} />)
            )}
          </div>
          {old.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <button type="button" className="toggle-link" aria-expanded={showOld} onClick={() => setShowOld(v => !v)}>
                <Icon name={showOld ? 'ChevronDown' : 'ChevronRight'} size={18} />
                {showOld ? 'Dölj gamla pass' : `Visa gamla pass (${old.length})`}
              </button>
              {showOld && (
                <div className="pass-list" style={{ marginTop: 10, opacity: 0.75 }}>
                  {old.map(p => <PassCard key={p.id} pass={p} adminMode={false} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function AdminPassPage() {
  const { passes, isPAdmin, isSuperAdmin, churches, availableChurches, activeChurch, setChurch, showModal, currentChurchId, groups } = useApp()
  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState('alla')
  const [showHistory, setShowHistory] = useState(false)
  const cid = currentChurchId()
  const today = new Date().toISOString().slice(0, 10)

  const filtered = passes
    .filter(p => p.church === cid)
    .filter(p => !search || p.title.toLowerCase().includes(search.toLowerCase()))
    .filter(p => groupFilter === 'alla' || p.groups.includes(groupFilter))

  const sch     = filtered.filter(p => p.pubStatus === 'scheduled' && !p.cancelled && p.date >= today).sort((a,b) => a.date.localeCompare(b.date))
  const live    = filtered.filter(p => p.pubStatus === 'live' && !p.cancelled && p.date >= today).sort((a,b) => a.date.localeCompare(b.date))
  const inst    = filtered.filter(p => p.cancelled && p.date >= today)
  const history = filtered.filter(p => p.date < today).sort((a, b) => b.date.localeCompare(a.date))
  const kioskN  = passes.filter(p => p.church === cid && p.kioskVisible && p.pubStatus === 'live' && !p.cancelled && p.date >= today).length

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="page-title">Pass</h1>
          <p className="page-sub">{churches.find(c => c.id === cid)?.name}</p>
        </div>
        <button className="btn btn-primary" onClick={() => showModal(<NewPassModal />)}><Icon name="Plus" size={18} />Nytt pass</button>
      </div>

      {(isPAdmin() || isSuperAdmin()) && (
        <div className="church-bar">
          {availableChurches.map((church) => {
            const index = churches.findIndex(item => item.id === church.id)
            return (
              <button key={church.id} className={`church-btn${activeChurch === index ? ' on' : ''}`} onClick={() => setChurch(index)}>{church.name}</button>
            )
          })}
        </div>
      )}

      {kioskN > 0 && (
        <div className="alert alert-dark" style={{ marginBottom: 14 }}><Icon name="DeviceIpad" size={18} />{kioskN} pass visas i kiosken just nu.</div>
      )}

      {/* Sök + gruppfilter */}
      <div className="search-row" style={{ marginBottom: 12 }}>
        <Icon name="Search" size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#7D0037' }} />
        <input
          type="search"
          aria-label="Sök pass"
          placeholder="Sök pass"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <button className={`filter-btn${groupFilter === 'alla' ? ' on' : ''}`} onClick={() => setGroupFilter('alla')}>Alla grupper</button>
        {groups.filter(g => g.churchId === cid || g.churchId === null).map(g => (
          <button key={g.id} className={`filter-btn${groupFilter === g.id ? ' on' : ''}`} onClick={() => setGroupFilter(g.id)}>{g.label}</button>
        ))}
      </div>

      <div className="pass-list">
        {sch.length > 0 && (<><div className="section-label">Schemalagda</div>{sch.map(p => <PassCard key={p.id} pass={p} adminMode />)}</>)}
        {live.length > 0 && (<><div className="section-label" style={{ marginTop: sch.length ? 16 : 0 }}>Live</div>{live.map(p => <PassCard key={p.id} pass={p} adminMode />)}</>)}
        {inst.length > 0 && (<><div className="section-label" style={{ marginTop: 16 }}>Inställda</div>{inst.map(p => <PassCard key={p.id} pass={p} adminMode />)}</>)}
        {!sch.length && !live.length && !inst.length && !history.length && (
          <div className="empty-state panel">
            <div className="empty-state-title">Inga pass skapade ännu</div>
            <div style={{ marginBottom: 20 }}>Klicka på Nytt pass för att komma igång.</div>
            <button className="btn btn-primary" onClick={() => showModal(<NewPassModal />)}><Icon name="Plus" size={18} />Skapa första passet</button>
          </div>
        )}
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <button type="button" className="toggle-link" aria-expanded={showHistory} onClick={() => setShowHistory(v => !v)}>
            <Icon name={showHistory ? 'ChevronDown' : 'ChevronRight'} size={18} />
            {showHistory ? 'Dölj historik' : `Historik, gamla pass (${history.length})`}
          </button>
          {showHistory && (
            <div className="pass-list" style={{ marginTop: 10, opacity: 0.75 }}>
              {history.map(p => <PassCard key={p.id} pass={p} adminMode />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

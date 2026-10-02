'use client'
import { useApp } from '@/lib/appStore'
import PassCard from '@/components/ui/PassCard'

export default function MinaAnsvarPage() {
  const { passes, groups, currentUser, currentChurchId, u } = useApp()
  const churchId = currentChurchId()
  const myId = String(currentUser?.id ?? u().id)
  const myGroups = groups.filter(group => group.churchId === churchId && group.responsibleProfileId === myId)
  const myPasses = passes.filter(pass =>
    pass.church === churchId
    && pass.responsibleUserIds?.some(id => String(id) === myId)
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mina ansvar</h1>
        <p className="page-sub">Grupper och pass du är ansvarig för i vald församling</p>
      </div>
      {myGroups.length > 0 && <div className="panel" style={{ padding: 20, marginBottom: 20 }}>
        <h2>Mina grupper</h2>
        <p className="group-help">Du är kontaktperson för de här grupperna.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{myGroups.map(group => <span key={group.id} className={`tag ${group.cls}`}>{group.label}</span>)}</div>
      </div>}
      {myPasses.length === 0 ? (
        <div className="empty-state">
          Du är inte ansvarig för några pass i den här församlingen just nu.<br />
          Kontakta en admin för att bli tilldelad.
        </div>
      ) : (
        <div className="pass-list">
          {myPasses.map(pass => <PassCard key={pass.id} pass={pass} adminMode />)}
        </div>
      )}
    </div>
  )
}

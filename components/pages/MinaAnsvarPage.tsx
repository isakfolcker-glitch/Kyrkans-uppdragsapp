'use client'
import { useApp } from '@/lib/appStore'
import PassCard from '@/components/ui/PassCard'

export default function MinaAnsvarPage() {
  const { passes, u } = useApp()
  const myPasses = passes.filter(p => p.responsibleUserIds?.includes(u().id))
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mina ansvar</h1>
        <p className="page-sub">Pass du är ansvarig för</p>
      </div>
      {myPasses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>
          Du är inte ansvarig för några pass just nu.<br />
          <span style={{ fontSize: 12 }}>Kontakta en admin för att bli tilldelad.</span>
        </div>
      ) : (
        <div className="pass-list">
          {myPasses.map(p => <PassCard key={p.id} pass={p} adminMode />)}
        </div>
      )}
    </div>
  )
}

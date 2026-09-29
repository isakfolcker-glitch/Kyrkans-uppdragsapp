'use client'
import { useApp } from '@/lib/appStore'
import PassCard from '@/components/ui/PassCard'

export default function MinaAnsvarPage() {
  const { passes, currentUser, currentChurchId } = useApp()
  const churchId = currentChurchId()
  const myPasses = passes.filter(pass =>
    pass.church === churchId
    && currentUser?.id
    && pass.responsibleUserIds?.includes(currentUser.id)
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mina ansvar</h1>
        <p className="page-sub">Pass du är ansvarig för i vald församling</p>
      </div>
      {myPasses.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#888780' }}>
          Du är inte ansvarig för några pass i den här församlingen just nu.<br />
          <span style={{ fontSize: 12 }}>Kontakta en admin för att bli tilldelad.</span>
        </div>
      ) : (
        <div className="pass-list">
          {myPasses.map(pass => <PassCard key={pass.id} pass={pass} adminMode />)}
        </div>
      )}
    </div>
  )
}

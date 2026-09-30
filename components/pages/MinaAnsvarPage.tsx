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

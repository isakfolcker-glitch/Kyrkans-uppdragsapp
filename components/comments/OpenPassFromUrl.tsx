'use client'
// Mailen om kommentarer länkar till /dashboard?pass={id}. När sidan öppnas så
// visas passets kommentarer i ett fönster, och ?pass tas bort ur adressfältet
// så att fönstret inte öppnas igen vid omladdning.
import { useEffect, useRef } from 'react'
import { useApp } from '@/lib/appStore'
import PassQAModal from '@/components/modals/PassQAModal'

function removePassParam() {
  const url = new URL(window.location.href)
  url.searchParams.delete('pass')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export default function OpenPassFromUrl() {
  const { passes, loadingAuth, currentUser, showModal } = useApp()
  const done = useRef(false)

  useEffect(() => {
    if (done.current || loadingAuth || !currentUser) return
    const raw = new URLSearchParams(window.location.search).get('pass')
    if (!raw) { done.current = true; return }

    const id = Number(raw)
    if (!Number.isSafeInteger(id) || id <= 0) {
      done.current = true
      removePassParam()
      return
    }
    // Vänta tills passen har hämtats. Finns passet inte i listan (t.ex. ingen
    // åtkomst) tas parametern bort utan att något öppnas.
    if (!passes.length) return
    done.current = true
    removePassParam()
    if (passes.some(p => p.id === id)) showModal(<PassQAModal passId={id} />)
  }, [passes, loadingAuth, currentUser, showModal])

  return null
}

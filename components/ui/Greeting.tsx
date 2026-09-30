'use client'
import { useSyncExternalStore } from 'react'
import { greetingFor, firstName } from '@/lib/greeting'

// Timmen läses bara i webbläsaren. Sidan förrenderas på servern, och då
// skulle hälsningen annars bli den från byggtillfället.
function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000)
  return () => window.clearInterval(id)
}
const getHour = () => new Date().getHours()
const getServerHour = () => null

/**
 * "God morgon," + förnamn i Spectral kursiv på en ny rad.
 * Saknas namn visas bara hälsningen, utan komma.
 */
export default function Greeting({ name }: { name?: string | null }) {
  const hour = useSyncExternalStore(subscribe, getHour, getServerHour)
  const first = firstName(name)
  if (hour === null) {
    // Samma höjd som den färdiga hälsningen, men osynlig tills timmen är känd.
    return <span style={{ visibility: 'hidden' }}>God dag</span>
  }
  const greeting = greetingFor(hour)
  if (!first) return <>{greeting}</>
  return (
    <>
      {greeting},<br />
      <span className="serif">{first}</span>
    </>
  )
}

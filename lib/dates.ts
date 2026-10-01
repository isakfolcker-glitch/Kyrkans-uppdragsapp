// Datumhjälp för startsidan. Pass har datum som text "ÅÅÅÅ-MM-DD" i svensk
// tid, så allt räknas i lokal tid och aldrig via toISOString (som är UTC).

const DAY_MS = 86_400_000

/** "ÅÅÅÅ-MM-DD" som lokalt datum kl 00.00. */
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** Dagens datum som "ÅÅÅÅ-MM-DD" i lokal tid. */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function mondayOf(date: Date): Date {
  const out = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  out.setDate(out.getDate() - ((out.getDay() + 6) % 7))
  return out
}

/** Veckonummer enligt ISO 8601 (det som används i Sverige). */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

/** "Den här veckan", "Nästa vecka" eller "Vecka N". */
export function weekLabel(date: Date, today: Date = new Date()): string {
  const diff = Math.round((mondayOf(date).getTime() - mondayOf(today).getTime()) / (7 * DAY_MS))
  if (diff === 0) return 'Den här veckan'
  if (diff === 1) return 'Nästa vecka'
  return `Vecka ${isoWeek(date)}`
}

/** Nyckel som är lika för alla dagar i samma vecka. */
export function weekKey(date: Date): string {
  return localDateString(mondayOf(date))
}

/** "i dag", "i går" eller t.ex. "5 oktober". */
export function relativeDay(date: Date, today: Date = new Date()): string {
  const a = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const diff = Math.round((b - a) / DAY_MS)
  if (diff === 0) return 'i dag'
  if (diff === 1) return 'i går'
  return date.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' })
}

/** Kort månadsnamn utan punkt, t.ex. "okt". */
export function shortMonth(date: Date): string {
  return date.toLocaleDateString('sv-SE', { month: 'short' }).replace('.', '')
}

/** Veckodag, lång ("söndag") eller kort ("sön"). */
export function weekday(date: Date, form: 'long' | 'short'): string {
  return date.toLocaleDateString('sv-SE', { weekday: form }).replace('.', '')
}

/** Tid som "09.30" i stället för "09:30". */
export function formatTime(time: string): string {
  return (time ?? '').replace(/:/g, '.')
}

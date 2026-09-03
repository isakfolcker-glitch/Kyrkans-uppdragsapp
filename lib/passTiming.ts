// date_str/time_str är fritext (t.ex. "2026-09-10" och "18:00–20:00").
// Tolkas här som svensk lokal tid men parsas som serverns lokala tid (UTC på Vercel),
// så gränsen kan ligga någon timme fel jämfört med klockan i Sverige. Tillräckligt
// exakt för en 24-timmarsregel, men inte för minutexakt schemaläggning.
export function passStartDate(dateStr: string, timeStr: string): Date | null {
  if (!dateStr) return null
  const startTime = (timeStr || '').split(/[–-]/)[0].trim()
  const hhmm = /^\d{2}:\d{2}$/.test(startTime) ? startTime : '00:00'
  const d = new Date(`${dateStr}T${hhmm}:00`)
  return isNaN(d.getTime()) ? null : d
}

export function isLockedForSelfCancel(dateStr: string, timeStr: string, hoursBefore = 24): boolean {
  const start = passStartDate(dateStr, timeStr)
  if (!start) return false
  return start.getTime() - Date.now() < hoursBefore * 60 * 60 * 1000
}

'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

const MEDVIND_URL =
  'https://login.medvind.visma.com/MedvindSSO/Login/?wtrealm=https%3a%2f%2fsvenskakyrkan.medvind.visma.com%2fMvWeb%2f&tenantId=SVENSKAKYRKAN2'

const KEYS = {
  settings: 'stampla_settings',
  entries:  'stampla_entries',
  overrides: 'stampla_week_overrides',
}

interface Settings {
  workLat: number | null
  workLng: number | null
  radius: number
  defaultDays: number[]
}

interface Entry {
  id: string
  type: 'in' | 'out'
  time: string
  auto: boolean
}

const DEFAULTS: Settings = {
  workLat: null,
  workLng: null,
  radius: 200,
  defaultDays: [1, 2, 3, 4, 5],
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const dφ = ((lat2 - lat1) * Math.PI) / 180
  const dλ = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function isoWeek(d: Date) {
  const copy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  copy.setUTCDate(copy.getUTCDate() + 4 - (copy.getUTCDay() || 7))
  const jan1 = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1))
  const wk = Math.ceil(((copy.getTime() - jan1.getTime()) / 86400000 + 1) / 7)
  return `${copy.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`
}

function weekday(d: Date) {
  return d.getDay() === 0 ? 7 : d.getDay()
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
}

const DAY = ['', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön']
const RADII = [50, 100, 200, 300, 500]

export default function StämplaPage() {
  const [settings, setSettings]       = useState<Settings>(DEFAULTS)
  const [entries, setEntries]         = useState<Entry[]>([])
  const [overrides, setOverrides]     = useState<Record<string, number[]>>({})
  const [pos, setPos]                 = useState<{ lat: number; lng: number } | null>(null)
  const [dist, setDist]               = useState<number | null>(null)
  const [atWork, setAtWork]           = useState(false)
  const [gps, setGps]                 = useState<'loading' | 'ok' | 'denied' | 'error' | 'off'>('loading')
  const [notifPerm, setNotifPerm]     = useState<NotificationPermission>('default')
  const [view, setView]               = useState<'home' | 'settings' | 'week' | 'history'>('home')
  const [savingLoc, setSavingLoc]     = useState(false)
  const [drafted, setDrafted]         = useState<Settings>(DEFAULTS)

  const prevAtWork  = useRef<boolean | null>(null)
  const settingsRef = useRef(settings)
  const todayStr    = new Date().toISOString().split('T')[0]
  const weekKey     = isoWeek(new Date())
  const today       = new Date()

  const workDays   = overrides[weekKey] ?? settings.defaultDays
  const isWorkday  = workDays.includes(weekday(today))
  const todayLog   = entries.filter((e: Entry) => e.time.startsWith(todayStr))
  const last       = todayLog[todayLog.length - 1]
  const clockedIn  = last?.type === 'in'

  useEffect(() => { settingsRef.current = settings }, [settings])

  useEffect(() => {
    try {
      const s = localStorage.getItem(KEYS.settings)
      const parsed = s ? { ...DEFAULTS, ...JSON.parse(s) } : DEFAULTS
      setSettings(parsed)
      setDrafted(parsed)
      const e = localStorage.getItem(KEYS.entries)
      if (e) setEntries(JSON.parse(e))
      const o = localStorage.getItem(KEYS.overrides)
      if (o) setOverrides(JSON.parse(o))
    } catch { /* ignore */ }
    if ('Notification' in window) setNotifPerm(Notification.permission)
  }, [])

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/stampla-sw.js').catch(() => { /* ignore */ })
    }
  }, [])

  function persist(key: string, val: unknown) {
    localStorage.setItem(key, JSON.stringify(val))
  }

  function applySettings(s: Settings) {
    setSettings(s)
    settingsRef.current = s
    persist(KEYS.settings, s)
  }

  const addEntry = useCallback((type: 'in' | 'out', auto = false) => {
    const e: Entry = { id: Date.now().toString(), type, time: new Date().toISOString(), auto }
    setEntries((prev: Entry[]) => {
      const next = [...prev, e]
      persist(KEYS.entries, next)
      return next
    })
  }, [])

  async function notify(type: 'in' | 'out') {
    if (!('Notification' in window)) return
    let perm = Notification.permission
    if (perm === 'default') {
      perm = await Notification.requestPermission()
      setNotifPerm(perm)
    }
    if (perm !== 'granted') return

    const title = type === 'in' ? 'Stämpla in!' : 'Stämpla ut!'
    const body  = type === 'in'
      ? 'Du är framme på jobbet — glöm inte stämpla in i Medvind.'
      : 'Du har lämnat jobbet — glöm inte stämpla ut i Medvind.'
    const url   = settingsRef.current.workLat != null
      ? (localStorage.getItem(KEYS.settings) ? MEDVIND_URL : MEDVIND_URL)
      : MEDVIND_URL

    try {
      const reg = await navigator.serviceWorker.ready
      reg.showNotification(title, {
        body,
        icon: '/favicon.ico',
        tag: `stampla-${type}`,
        requireInteraction: true,
        data: { url: MEDVIND_URL },
      } as NotificationOptions)
    } catch {
      new Notification(title, { body })
    }
  }

  useEffect(() => {
    if (!('geolocation' in navigator)) { setGps('off'); return }

    const id = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setPos({ lat: coords.latitude, lng: coords.longitude })
        setGps('ok')
        const s = settingsRef.current
        if (s.workLat == null || s.workLng == null) return
        const d = haversine(coords.latitude, coords.longitude, s.workLat, s.workLng)
        setDist(d)
        const near = d <= s.radius
        setAtWork(near)
        if (prevAtWork.current !== null && prevAtWork.current !== near) {
          notify(near ? 'in' : 'out')
          addEntry(near ? 'in' : 'out', true)
        }
        prevAtWork.current = near
      },
      (err) => {
        setGps(err.code === err.PERMISSION_DENIED ? 'denied' : 'error')
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 8000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [addEntry])

  async function enableNotifs() {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifPerm(perm)
  }

  function saveLocation() {
    if (!pos) return
    setSavingLoc(true)
    const next = { ...drafted, workLat: pos.lat, workLng: pos.lng }
    setDrafted(next)
    setTimeout(() => setSavingLoc(false), 800)
  }

  function saveSettingsView() {
    applySettings(drafted)
    setView('home')
  }

  function toggleDefaultDay(d: number) {
    const days = drafted.defaultDays.includes(d)
      ? drafted.defaultDays.filter((x: number) => x !== d)
      : [...drafted.defaultDays, d].sort((a: number, b: number) => a - b)
    setDrafted({ ...drafted, defaultDays: days })
  }

  function toggleWeekDay(d: number) {
    const cur = overrides[weekKey] ?? settings.defaultDays
    const next = cur.includes(d) ? cur.filter((x: number) => x !== d) : [...cur, d].sort((a: number, b: number) => a - b)
    const o = { ...overrides, [weekKey]: next }
    setOverrides(o)
    persist(KEYS.overrides, o)
  }

  function resetWeek() {
    const o = { ...overrides }
    delete o[weekKey]
    setOverrides(o)
    persist(KEYS.overrides, o)
  }

  function removeEntry(id: string) {
    const next = entries.filter((e: Entry) => e.id !== id)
    setEntries(next)
    persist(KEYS.entries, next)
  }

  // ─── VIEWS ──────────────────────────────────────────────────────────────────

  if (view === 'settings') {
    return (
      <Screen>
        <TopBar title="Inställningar" back={() => setView('home')} />
        <Section label="Jobbets plats (GPS)">
          {drafted.workLat != null ? (
            <SmallInfo label="Sparad plats" value={`${drafted.workLat.toFixed(5)}, ${drafted.workLng!.toFixed(5)}`} />
          ) : (
            <p style={styles.hint}>Ingen plats sparad ännu.</p>
          )}
          <Btn
            label={savingLoc ? 'Sparad!' : pos ? 'Spara nuvarande plats' : 'Väntar på GPS…'}
            disabled={!pos || savingLoc}
            onClick={saveLocation}
            secondary
          />
          {pos && <p style={styles.hint}>Nuv. position: {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}</p>}
        </Section>

        <Section label="Detekteringsradie">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RADII.map(r => (
              <button
                key={r}
                onClick={() => setDrafted({ ...drafted, radius: r })}
                style={{
                  ...styles.pill,
                  background: drafted.radius === r ? '#412B72' : '#F3F1FB',
                  color: drafted.radius === r ? '#fff' : '#412B72',
                }}
              >
                {r}m
              </button>
            ))}
          </div>
        </Section>

        <Section label="Vilka dagar jobbar du normalt?">
          <DayToggle days={drafted.defaultDays} toggle={toggleDefaultDay} />
        </Section>

        <Section label="Notiser">
          {notifPerm === 'granted' ? (
            <p style={{ ...styles.hint, color: '#1A7F5A' }}>Notiser är aktiverade.</p>
          ) : notifPerm === 'denied' ? (
            <p style={styles.hint}>Notiser är blockerade. Ändra i webbläsarens inställningar.</p>
          ) : (
            <Btn label="Aktivera push-notiser" onClick={enableNotifs} secondary />
          )}
        </Section>

        <div style={{ padding: '0 16px 32px' }}>
          <Btn label="Spara" onClick={saveSettingsView} />
        </div>
      </Screen>
    )
  }

  if (view === 'week') {
    const hasOverride = !!overrides[weekKey]
    return (
      <Screen>
        <TopBar title={`Vecka ${weekKey.split('-W')[1]}`} back={() => setView('home')} />
        <Section label="Vilka dagar jobbar du den här veckan?">
          <DayToggle days={workDays} toggle={toggleWeekDay} highlight={weekday(today)} />
          {hasOverride && (
            <button onClick={resetWeek} style={{ ...styles.link, marginTop: 12 }}>
              Återgå till standardschema
            </button>
          )}
        </Section>
        <div style={{ padding: '0 16px' }}>
          <Btn label="Klar" onClick={() => setView('home')} />
        </div>
      </Screen>
    )
  }

  if (view === 'history') {
    const byDay: Record<string, Entry[]> = {}
    for (const e of [...entries].reverse()) {
      const day = e.time.split('T')[0]
      if (!byDay[day]) byDay[day] = []
      byDay[day].push(e)
    }
    return (
      <Screen>
        <TopBar title="Historik" back={() => setView('home')} />
        {Object.keys(byDay).length === 0 && (
          <p style={{ ...styles.hint, padding: '24px 16px' }}>Inga stämplingar ännu.</p>
        )}
        {Object.entries(byDay).map(([day, list]) => (
          <Section key={day} label={new Date(day).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}>
            {list.map(e => (
              <div key={e.id} style={styles.histRow}>
                <span style={{ color: e.type === 'in' ? '#1A7F5A' : '#C04D2D', fontWeight: 600 }}>
                  {e.type === 'in' ? '→ IN' : '← UT'}
                </span>
                <span style={{ color: '#333' }}>{fmtTime(e.time)}</span>
                <span style={{ color: '#888', fontSize: 11 }}>{e.auto ? 'auto' : 'manuell'}</span>
                <button onClick={() => removeEntry(e.id)} style={styles.del}>✕</button>
              </div>
            ))}
          </Section>
        ))}
      </Screen>
    )
  }

  // ─── HOME ────────────────────────────────────────────────────────────────────

  const needsSetup = settings.workLat == null

  return (
    <Screen>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <div style={styles.headerTitle}>Stämpla</div>
          <div style={styles.headerDate}>{fmtDate(today)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <IconBtn label="Historik" onClick={() => setView('history')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </IconBtn>
          <IconBtn label="Inställningar" onClick={() => setView('settings')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </IconBtn>
        </div>
      </div>

      {/* Setup banner */}
      {needsSetup && (
        <div style={styles.setupBanner}>
          <b>Konfigurera jobbets plats</b>
          <p style={{ margin: '4px 0 8px', fontSize: 13 }}>
            Gå till inställningar och spara din jobbadress så kan appen känna av när du anländer.
          </p>
          <Btn label="Öppna inställningar" onClick={() => setView('settings')} secondary />
        </div>
      )}

      {/* Status card */}
      {!needsSetup && (
        <div style={{
          ...styles.statusCard,
          background: atWork ? '#E8F8F0' : '#F3F1FB',
          borderColor: atWork ? '#1A7F5A' : '#C4BAE8',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: atWork ? '#1A7F5A' : '#9182C4',
            }} />
            <span style={{
              fontSize: 18, fontWeight: 700,
              color: atWork ? '#0D5C3A' : '#412B72',
            }}>
              {atWork ? 'Du är på jobbet' : 'Inte på jobbet'}
            </span>
          </div>
          {dist != null && (
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#666' }}>
              {atWork
                ? `Inom ${settings.radius}m från jobbet`
                : `${dist}m från jobbet (radie: ${settings.radius}m)`}
            </p>
          )}
          {gps === 'loading' && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#888' }}>Hämtar GPS…</p>}
          {gps === 'denied' && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#C04D2D' }}>GPS nekad — tillåt platsåtkomst i webbläsaren</p>}
          {gps === 'error' && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#C04D2D' }}>GPS-fel — försök ladda om</p>}
        </div>
      )}

      {/* Workday info */}
      <div style={styles.workdayRow}>
        <span style={{ fontSize: 13, color: isWorkday ? '#1A7F5A' : '#888' }}>
          {isWorkday ? 'Arbetsdag' : 'Ledig dag'}
        </span>
        <button onClick={() => setView('week')} style={styles.link}>
          Redigera vecka
        </button>
      </div>

      {/* Medvind button */}
      <div style={{ padding: '0 16px 16px' }}>
        <a
          href={MEDVIND_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.medvindBtn}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          Öppna Medvind
        </a>
      </div>

      {/* Manual stamp buttons */}
      <div style={{ padding: '0 16px 16px', display: 'flex', gap: 10 }}>
        <button
          onClick={() => addEntry('in')}
          disabled={clockedIn}
          style={{
            ...styles.stampBtn,
            background: clockedIn ? '#E0E0E0' : '#412B72',
            color: clockedIn ? '#999' : '#fff',
          }}
        >
          IN
        </button>
        <button
          onClick={() => addEntry('out')}
          disabled={!clockedIn}
          style={{
            ...styles.stampBtn,
            background: !clockedIn ? '#E0E0E0' : '#C04D2D',
            color: !clockedIn ? '#999' : '#fff',
          }}
        >
          UT
        </button>
      </div>

      {/* Today's log */}
      <Section label="Idag">
        {todayLog.length === 0 ? (
          <p style={styles.hint}>Inga stämplingar idag.</p>
        ) : (
          todayLog.map((e: Entry) => (
            <div key={e.id} style={styles.logRow}>
              <span style={{
                fontWeight: 700, fontSize: 13,
                color: e.type === 'in' ? '#1A7F5A' : '#C04D2D',
                minWidth: 28,
              }}>
                {e.type === 'in' ? 'IN' : 'UT'}
              </span>
              <span style={{ fontWeight: 600, fontSize: 16, color: '#1A1A2E' }}>
                {fmtTime(e.time)}
              </span>
              <span style={{ fontSize: 11, color: '#999', marginLeft: 4 }}>
                {e.auto ? 'automatisk' : 'manuell'}
              </span>
            </div>
          ))
        )}
      </Section>

      {/* Notif permission hint */}
      {notifPerm !== 'granted' && !needsSetup && (
        <div style={styles.notifHint}>
          <span style={{ fontSize: 13, color: '#633806' }}>
            Aktivera notiser för att få påminnelser när du anländer/lämnar jobbet.
          </span>
          <button onClick={enableNotifs} style={{ ...styles.link, color: '#412B72', marginTop: 6, display: 'block' }}>
            Aktivera notiser
          </button>
        </div>
      )}

      {/* This week */}
      <Section label={`Vecka ${weekKey.split('-W')[1]} — dina dagar`}>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4, 5, 6, 7].map(d => {
            const active = workDays.includes(d)
            const isToday = weekday(today) === d
            return (
              <div key={d} style={{
                width: 36, height: 36, borderRadius: 8, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, fontWeight: 600,
                background: isToday
                  ? (active ? '#412B72' : '#EEEDFE')
                  : (active ? '#D8D3F5' : '#F5F5F5'),
                color: isToday ? (active ? '#fff' : '#9182C4') : (active ? '#412B72' : '#BBB'),
                border: isToday ? '2px solid #412B72' : '2px solid transparent',
              }}>
                {DAY[d]}
              </div>
            )
          })}
        </div>
      </Section>

      <div style={{ height: 32 }} />
    </Screen>
  )
}

// ─── SHARED UI COMPONENTS ────────────────────────────────────────────────────

function Screen({ children }: { children: ReactNode }) {
  return (
    <div style={{
      minHeight: '100dvh',
      background: '#FAFAFA',
      fontFamily: "'DM Sans', system-ui, sans-serif",
      maxWidth: 480,
      margin: '0 auto',
    }}>
      {children}
    </div>
  )
}

function TopBar({ title, back }: { title: string; back: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '16px 16px 8px',
      background: '#1E1245', color: '#fff',
    }}>
      <button onClick={back} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <span style={{ fontWeight: 700, fontSize: 18 }}>{title}</span>
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ padding: '16px 16px 4px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ background: '#fff', borderRadius: 12, padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {children}
      </div>
    </div>
  )
}

function Btn({ label, onClick, secondary, disabled }: { label: string; onClick?: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%', padding: '13px 16px', borderRadius: 12, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 700, fontSize: 15, fontFamily: 'inherit',
        background: disabled ? '#E0E0E0' : secondary ? '#EEEDFE' : '#412B72',
        color: disabled ? '#999' : secondary ? '#412B72' : '#fff',
        marginTop: 8,
      }}
    >
      {label}
    </button>
  )
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: 8,
        cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center',
      }}
    >
      {children}
    </button>
  )
}

function SmallInfo({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#333', wordBreak: 'break-all' }}>{value}</div>
    </div>
  )
}

function DayToggle({ days, toggle, highlight }: { days: number[]; toggle: (d: number) => void; highlight?: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {[1, 2, 3, 4, 5, 6, 7].map(d => (
        <button
          key={d}
          onClick={() => toggle(d)}
          style={{
            ...styles.pill,
            background: days.includes(d) ? '#412B72' : '#F3F1FB',
            color: days.includes(d) ? '#fff' : '#412B72',
            border: highlight === d ? '2px solid #412B72' : '2px solid transparent',
          }}
        >
          {DAY[d]}
        </button>
      ))}
    </div>
  )
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const styles = {
  header: {
    background: '#1E1245',
    color: '#fff',
    padding: '20px 16px 16px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  } as CSSProperties,
  headerTitle: {
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: -0.5,
  } as CSSProperties,
  headerDate: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
    textTransform: 'capitalize',
  } as CSSProperties,
  setupBanner: {
    margin: 16,
    background: '#FFF8EC',
    border: '1px solid #F5D48A',
    borderRadius: 12,
    padding: '14px 16px',
  } as CSSProperties,
  statusCard: {
    margin: 16,
    borderRadius: 16,
    border: '2px solid',
    padding: '16px 18px',
  } as CSSProperties,
  workdayRow: {
    padding: '4px 16px 8px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  } as CSSProperties,
  medvindBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    padding: '14px',
    borderRadius: 14,
    background: '#00659B',
    color: '#fff',
    fontWeight: 700,
    fontSize: 16,
    textDecoration: 'none',
    fontFamily: "'DM Sans', system-ui, sans-serif",
    boxShadow: '0 2px 8px rgba(0,101,155,0.3)',
  } as CSSProperties,
  stampBtn: {
    flex: 1,
    padding: '14px',
    borderRadius: 12,
    border: 'none',
    fontWeight: 800,
    fontSize: 17,
    cursor: 'pointer',
    letterSpacing: 1,
    fontFamily: 'inherit',
    transition: 'opacity 0.15s',
  } as CSSProperties,
  logRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 0',
    borderBottom: '1px solid #F0F0F0',
  } as CSSProperties,
  histRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 0',
    borderBottom: '1px solid #F0F0F0',
  } as CSSProperties,
  hint: {
    fontSize: 13,
    color: '#888',
    margin: '4px 0',
  } as CSSProperties,
  link: {
    background: 'none',
    border: 'none',
    color: '#412B72',
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
    padding: 0,
    fontFamily: 'inherit',
    textDecoration: 'underline',
  } as CSSProperties,
  pill: {
    padding: '7px 12px',
    borderRadius: 20,
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
    fontFamily: 'inherit',
  } as CSSProperties,
  notifHint: {
    margin: '0 16px 16px',
    background: '#FFF8EC',
    border: '1px solid #F5D48A',
    borderRadius: 12,
    padding: '12px 14px',
  } as CSSProperties,
  del: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#CCC',
    fontSize: 12,
    padding: '2px 4px',
  } as CSSProperties,
}

'use client'
import { useApp } from '@/lib/appStore'
import { NAV_ITEMS } from '@/lib/appData'

export default function Sidebar() {
  const { u, page, goTo, cycleUser, churches, isKiosk, isPAdmin, isSuperAdmin, currentUser, profile, logout, notifications, perm } = useApp()
  const usr = u()

  const effectiveRole = profile?.role ?? usr.role
  const navRole = effectiveRole === 'fadmin' ? 'fadmin'
    : effectiveRole === 'padmin' ? 'padmin'
    : effectiveRole === 'superadmin' ? 'superadmin'
    : effectiveRole
  let items = NAV_ITEMS[navRole] || []

  // Anställda: lägg till menyval baserat på behörigheter
  if (navRole === 'anstalld') {
    const extra: typeof items = []
    if (perm('kan_se_personal') || perm('kan_lagg_till_personal')) extra.push({ id: 'personal', icon: 'Users', lbl: 'Personal' })
    if (perm('kan_hantera_grupper')) extra.push({ id: 'grupper', icon: 'UsersGroup', lbl: 'Grupper' })
    if (perm('kan_skicka_utskick')) extra.push({ id: 'utskick', icon: 'Send', lbl: 'Utskick' })
    if (extra.length > 0) {
      // Infoga efter "Pass"
      const passIdx = items.findIndex(x => x.id === 'pass')
      items = [...items.slice(0, passIdx + 1), ...extra, ...items.slice(passIdx + 1)]
    }
  }

  const subText = isSuperAdmin() ? 'Systemadministratör'
    : isPAdmin() ? 'Pastorat – alla församlingar'
    : isKiosk() ? 'Anmälningsstation'
    : churches.find(c => c.id === (profile?.church_id ?? usr.churches[0]))?.name ?? ''

  const displayName = profile?.name || usr.name
  const displayIni = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const avColor = profile?.av_color ?? usr.av ?? '#FFEBE1'

  return (
    <aside className="sidebar">
      {/* Logotyp */}
      <div className="sidebar-logo">
        <div className="logo-icon">
          <svg width="20" height="28" viewBox="0 0 20 28" fill="none"
            stroke="#412B72" strokeWidth="2.2" strokeLinecap="round">
            <path d="M10 4v18M4 11h12" />
          </svg>
        </div>
        <div>
          <div className="logo-text">Kyrkans uppdragsapp</div>
          <div className="logo-sub">{subText}</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="sidebar-nav">
        {items.map(item => {
          const unread = item.icon === 'Bell' ? notifications.filter((n: any) => !n.read).length : 0
          return (
            <button key={item.id} className={`nav-item${page === item.id ? ' active' : ''}`} onClick={() => goTo(item.id)}>
              <span style={{ width: 19, fontSize: 16, position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
                {iconFor(item.icon)}
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -6,
                    background: '#FF785A', color: '#fff', borderRadius: 10,
                    fontSize: 8, fontWeight: 700, padding: '1px 4px', minWidth: 14,
                    textAlign: 'center', lineHeight: '14px',
                  }}>{unread}</span>
                )}
              </span>
              {item.lbl}
            </button>
          )
        })}
      </nav>

      {/* Användare */}
      {currentUser ? (
        <div className="sidebar-user" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: 1, minWidth: 0 }}>
            <div className="user-av" style={{ background: avColor, flexShrink: 0 }}>
              {displayIni}
            </div>
            <div style={{ lineHeight: 1.25, minWidth: 0 }}>
              <div className="user-name">{displayName}</div>
            </div>
          </div>
          <button onClick={logout} title="Logga ut" style={{
            background: 'transparent', border: 'none', color: '#C7B8E8',
            cursor: 'pointer', padding: 6, borderRadius: 8,
          }}>⏻</button>
        </div>
      ) : (
        <div className="sidebar-user" onClick={cycleUser} title="Byt testanvändare (demo)" style={{ cursor: 'pointer' }}>
          <div className="user-av" style={{ background: usr.av, color: usr.ac }}>{usr.ini}</div>
          <div style={{ lineHeight: 1.25, flex: 1, minWidth: 0 }}>
            <div className="user-name">{usr.name}</div>
            <div style={{ marginTop: 4 }}>
              <span className={`user-role-badge ${usr.badge}`}>{usr.badgeLbl}</span>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}

function iconFor(name: string): string {
  const map: Record<string, string> = {
    Calendar: '📅', Bookmark: '🔖', Bell: '🔔', User: '👤',
    ShieldCheck: '🛡', Users: '👥', UsersGroup: '👥', Send: '✉',
    Shield: '🛡', Download: '⬇', LayoutDashboard: '📊', FileCheck: '📝',
    BuildingChurch: '⛪', World: '🌐', DeviceIpad: '📟',
  }
  return map[name] ?? '•'
}

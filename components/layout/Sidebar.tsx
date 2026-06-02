'use client'
import { useApp } from '@/lib/appStore'
import { NAV_ITEMS } from '@/lib/appData'

export default function Sidebar() {
  const { u, page, goTo, cycleUser, churches, isKiosk, isPAdmin, isSuperAdmin, currentUser, profile, logout, notifications } = useApp()
  const usr = u()

  // Använd riktig profil om inloggad, annars demo-användare
  const effectiveRole = profile?.role ?? usr.role
  const navRole = effectiveRole === 'fadmin' ? 'fadmin'
    : effectiveRole === 'padmin' ? 'padmin'
    : effectiveRole === 'superadmin' ? 'superadmin'
    : effectiveRole
  const items = NAV_ITEMS[navRole] || []

  const subText = isSuperAdmin() ? 'Systemadministratör'
    : isPAdmin() ? 'Pastorat – alla församlingar'
    : isKiosk() ? 'Anmälningsstation'
    : churches[profile?.church_id ?? usr.churches[0]]?.name ?? ''

  // Initialer från riktigt namn
  const displayName = profile?.name || usr.name
  const displayIni = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">K</div>
        <div>
          <div className="logo-text">Kyrkans uppdragsapp</div>
          <div className="logo-sub">{subText}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {items.map(item => {
          const unread = item.icon === 'Bell' ? notifications.filter((n: any) => !n.read).length : 0
          return (
            <button key={item.id} className={`nav-item${page === item.id ? ' active' : ''}`} onClick={() => goTo(item.id)}>
              <span style={{ width: 18, fontSize: 15, position: 'relative', display: 'inline-flex' }}>
                {iconFor(item.icon)}
                {unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -6,
                    background: '#FF785A', color: '#fff', borderRadius: 10,
                    fontSize: 8, fontWeight: 700, padding: '1px 4px', minWidth: 14, textAlign: 'center', lineHeight: '14px',
                  }}>{unread}</span>
                )}
              </span>
              {item.lbl}
            </button>
          )
        })}
      </nav>

      {currentUser ? (
        <div className="sidebar-user" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
            <div className="user-av" style={{ flexShrink: 0 }}>
              {displayIni}
            </div>
            <span className="user-name">{displayName}</span>
          </div>
          <button onClick={logout} title="Logga ut" style={{ background: 'none', border: 'none', color: '#888780', cursor: 'pointer', fontSize: 16, padding: '4px', flexShrink: 0 }}>⏻</button>
        </div>
      ) : (
        <div className="sidebar-user" onClick={cycleUser} title="Byt testanvändare (demo)">
          <div className="user-av" style={{ background: usr.av, color: usr.ac }}>{usr.ini}</div>
          <span className="user-name">{usr.name}</span>
          <span className={`user-role-badge ${usr.badge}`}>{usr.badgeLbl}</span>
        </div>
      )}
    </aside>
  )
}

function iconFor(name: string): string {
  const map: Record<string, string> = {
    Calendar: '📅', Bookmark: '🔖', Bell: '🔔', User: '👤',
    ShieldCheck: '🛡', Users: '👥', UsersGroup: '👥', Send: '✉',
    Shield: '🛡', Download: '⬇', LayoutDashboard: '📊',
    BuildingChurch: '⛪', World: '🌐', DeviceIpad: '📟',
  }
  return map[name] ?? '•'
}

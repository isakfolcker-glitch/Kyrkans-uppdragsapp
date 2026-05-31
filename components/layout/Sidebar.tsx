'use client'
import { useApp } from '@/lib/appStore'
import { NAV_ITEMS } from '@/lib/appData'

export default function Sidebar() {
  const { u, page, goTo, cycleUser, churches, isKiosk, isPAdmin, isSuperAdmin, currentUser, profile, logout } = useApp()
  const usr = u()
  const navRole = usr.role === 'fadmin' ? 'fadmin' : usr.role === 'padmin' ? 'padmin' : usr.role === 'superadmin' ? 'superadmin' : usr.role
  const items = NAV_ITEMS[navRole] || []

  const subText = isSuperAdmin() ? 'Systemadministratör'
    : isPAdmin() ? 'Pastorat – alla församlingar'
    : isKiosk() ? 'Anmälningsstation'
    : churches[usr.churches[0]]?.name ?? ''

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
        {items.map(item => (
          <button key={item.id} className={`nav-item${page === item.id ? ' active' : ''}`} onClick={() => goTo(item.id)}>
            <span style={{ width: 18, fontSize: 15 }}>
              {iconFor(item.icon)}
            </span>
            {item.lbl}
          </button>
        ))}
      </nav>

      {currentUser ? (
        <div className="sidebar-user" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, minWidth: 0 }}>
            <div className="user-av" style={{ background: usr.av, color: usr.ac, flexShrink: 0 }}>
              {profile?.ini || usr.ini}
            </div>
            <span className="user-name">{profile?.name || usr.name}</span>
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

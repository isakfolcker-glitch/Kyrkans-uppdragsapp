'use client'
import { useApp } from '@/lib/appStore'
import Icon from '@/components/ui/Icon'
import { useNavItems, useUnreadCount } from '@/components/layout/useNavItems'

/** Församlingens namn (eller motsvarande) under appnamnet. */
export function useSubText() {
  const { churches, isKiosk, isPAdmin, isSuperAdmin, currentChurchId } = useApp()
  if (isKiosk()) return 'Anmälningsstation'
  return churches.find(c => c.id === currentChurchId())?.name
    ?? (isSuperAdmin() ? 'Systemadministratör' : isPAdmin() ? 'Pastorat' : '')
}

/** Sidomeny för dator. Döljs på mobil, där AppShell visar huvud och nedre meny. */
export default function Sidebar() {
  const { u, page, goTo, cycleUser, currentUser, profile, logout } = useApp()
  const usr = u()
  const items = useNavItems()
  const unread = useUnreadCount()
  const subText = useSubText()
  const displayName = profile?.name || usr.name

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-text">Kyrkouppdrag</span>
        {subText && <span className="logo-sub serif">{subText}</span>}
      </div>

      <nav className="sidebar-nav" aria-label="Huvudmeny">
        {items.map(item => {
          const active = page === item.id
          const label = item.id === 'notiser' && unread > 0 ? `${item.lbl} (${unread})` : item.lbl
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item${active ? ' active' : ''}`}
              aria-current={active ? 'page' : undefined}
              onClick={() => goTo(item.id)}
            >
              <Icon name={item.icon} />
              {label}
            </button>
          )
        })}
      </nav>

      <div className="sidebar-user">
        {currentUser ? (
          <>
            {displayName && <span className="user-name" style={{ padding: '0 12px' }}>{displayName}</span>}
            <button type="button" className="nav-item" onClick={logout}>
              <Icon name="Logout" />
              Logga ut
            </button>
          </>
        ) : (
          // Demoläget: klicka för att byta testanvändare.
          <button type="button" className="nav-item" onClick={cycleUser} style={{ alignItems: 'flex-start' }}>
            <Icon name="Switch" />
            <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span>Byt testanvändare</span>
              <span className="user-name">{usr.name}</span>
              <span className={`user-role-badge ${usr.badge}`} style={{ alignSelf: 'flex-start' }}>{usr.badgeLbl}</span>
            </span>
          </button>
        )}
      </div>
    </aside>
  )
}

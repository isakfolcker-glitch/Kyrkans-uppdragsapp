'use client'
import { useApp } from '@/lib/appStore'
import { NAV_ITEMS } from '@/lib/appData'

export type NavItem = { id: string; icon: string; lbl: string }

/**
 * Menyval för den inloggades roll i vald församling. Anställda får extra
 * val efter "Pass" utifrån sina behörigheter. Menyn styr bara vad som visas,
 * skyddet av data ligger i API och RLS.
 */
export function useNavItems(): NavItem[] {
  const { u, perm } = useApp()
  const role = u().role
  let items = NAV_ITEMS[role] || []

  if (role === 'anstalld') {
    const extra: NavItem[] = []
    if (perm('kan_se_personal') || perm('kan_lagg_till_personal')) extra.push({ id: 'personal', icon: 'Users', lbl: 'Personal' })
    if (perm('kan_hantera_grupper')) extra.push({ id: 'grupper', icon: 'UsersGroup', lbl: 'Grupper' })
    if (perm('kan_skicka_utskick')) extra.push({ id: 'utskick', icon: 'Send', lbl: 'Utskick' })
    if (extra.length > 0) {
      const passIdx = items.findIndex(x => x.id === 'pass')
      items = [...items.slice(0, passIdx + 1), ...extra, ...items.slice(passIdx + 1)]
    }
  }

  return items
}

/** Antal olästa notiser för den inloggade (eller demoanvändaren). */
export function useUnreadCount(): number {
  const { notifications, currentUser, profile, u } = useApp()
  const myId = currentUser ? profile?.id : u().id
  return notifications.filter(n => !n.read && (myId === undefined || n.userId === myId)).length
}

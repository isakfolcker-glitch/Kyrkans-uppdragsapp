'use client'
import { useApp } from '@/lib/appStore'
import { navigationForRole } from '@/lib/navigation'

export type NavItem = { id: string; icon: string; lbl: string }

/**
 * Menyval för den inloggades roll i vald församling. Anställda får extra
 * val efter "Pass" utifrån sina behörigheter. Menyn styr bara vad som visas,
 * skyddet av data ligger i API och RLS.
 */
export function useNavItems(): NavItem[] {
  const { u, perm } = useApp()
  return navigationForRole(u().role, {
    kan_se_personal: perm('kan_se_personal'),
    kan_lagg_till_personal: perm('kan_lagg_till_personal'),
    kan_hantera_grupper: perm('kan_hantera_grupper'),
    kan_skicka_utskick: perm('kan_skicka_utskick'),
  })
}

/** Antal olästa notiser för den inloggade (eller demoanvändaren). */
export function useUnreadCount(): number {
  const { notifications, currentUser, profile, u } = useApp()
  const myId = currentUser ? profile?.id : u().id
  return notifications.filter(n => !n.read && (myId === undefined || n.userId === myId)).length
}

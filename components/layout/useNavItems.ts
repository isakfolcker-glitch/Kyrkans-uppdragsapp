'use client'
import { useApp } from '@/lib/appStore'
import { NAV_ITEMS } from '@/lib/appData'

export type NavItem = { id: string; icon: string; lbl: string }

/**
 * En gemensam rollbaserad meny för dator och mobil.
 * Backend och RLS ansvarar för faktisk åtkomstkontroll.
 */
export function useNavItems(): NavItem[] {
  const { u } = useApp()
  return NAV_ITEMS[u().role] ?? []
}

/** Antal olästa notiser för den inloggade (eller demoanvändaren). */
export function useUnreadCount(): number {
  const { notifications, currentUser, profile, u } = useApp()
  const myId = currentUser ? profile?.id : u().id
  return notifications.filter(n => !n.read && (myId === undefined || n.userId === myId)).length
}

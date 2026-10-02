import { NAV_ITEMS, type Role } from './appData'
import type { StaffPerms } from './appStore'
export type NavItem = { id: string; icon: string; lbl: string }

/** Shared by the menu and congregation switching, so permissions stay consistent. */
export function navigationForRole(role: Role, permissions: Partial<StaffPerms> = {}): NavItem[] {
  const items = NAV_ITEMS[role] ?? []
  if (role !== 'anstalld') return items
  const extra: NavItem[] = []
  if (permissions.kan_se_personal || permissions.kan_lagg_till_personal) extra.push({ id: 'personal', icon: 'Users', lbl: 'Personal' })
  if (permissions.kan_hantera_grupper) extra.push({ id: 'grupper', icon: 'UsersGroup', lbl: 'Grupper' })
  if (permissions.kan_skicka_utskick) extra.push({ id: 'utskick', icon: 'Send', lbl: 'Utskick' })
  const passIndex = items.findIndex(item => item.id === 'pass')
  return [...items.slice(0, passIndex + 1), ...extra, ...items.slice(passIndex + 1)]
}

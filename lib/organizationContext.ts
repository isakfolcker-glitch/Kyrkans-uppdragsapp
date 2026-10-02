import type { Church, ChurchMembershipData, PastoratData } from './appData'

export interface OrganizationGroup {
  key: string
  name: string
  churches: Church[]
}

/** Group only accessible congregations, never expand access from a pastorat label. */
export function organizationGroups(churches: Church[], pastorat: PastoratData[]): OrganizationGroup[] {
  const groups = new Map<string, OrganizationGroup>()
  for (const church of churches) {
    if (church.id === undefined) continue
    const key = church.pastoratId == null ? 'none' : String(church.pastoratId)
    const group = groups.get(key) ?? {
      key,
      name: church.pastoratId == null ? 'Utan kopplat pastorat' : pastorat.find(item => item.id === church.pastoratId)?.name ?? 'Pastorat',
      churches: [],
    }
    group.churches.push(church)
    groups.set(key, group)
  }
  return [...groups.values()].map(group => ({ ...group, churches: [...group.churches].sort((a, b) => a.name.localeCompare(b.name, 'sv')) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
}

/** Same precedence as server authorization: system, inherited pastorat, local role. */
export function effectiveChurchMembership(userId: string, churchId: number, memberships: ChurchMembershipData[], churches: Church[], systemSuper: boolean): ChurchMembershipData | null {
  const church = churches.find(item => item.id === churchId)
  if (!church) return null
  const direct = memberships.find(item => item.active && item.acceptedAt !== null && item.churchId === churchId)
  const inherited = church.pastoratId != null && memberships.some(item => item.active && item.acceptedAt !== null && item.adminLevel === 'pastorat'
    && churches.find(source => source.id === item.churchId)?.pastoratId === church.pastoratId)
  if (systemSuper || inherited) return {
    profileId: userId, churchId, role: systemSuper ? 'superadmin' : 'padmin',
    adminLevel: systemSuper ? 'super' : 'pastorat', isEmployee: true, active: true,
  }
  return direct ?? null
}

export function membershipLabel(membership: ChurchMembershipData | null): string {
  if (membership?.adminLevel === 'super') return 'Superadmin · Systemägare'
  if (membership?.adminLevel === 'pastorat') return 'Pastoratsadmin'
  if (membership?.adminLevel === 'forsamling') return 'Församlingsadmin'
  if (membership?.role === 'anstalld') return 'Anställd'
  if (membership?.role === 'kiosk') return 'Kiosk'
  return membership ? 'Ideell' : 'Ingen roll i församlingen'
}

import type { Group, Role } from './appData'

export interface GroupPerson {
  id: string
  name: string
  role: Role
  isEmployee: boolean
}

export interface ManagedGroup extends Group {
  memberIds: string[]
}

export interface GroupManagementData {
  groups: ManagedGroup[]
  people: GroupPerson[]
}

export interface SaveGroupInput {
  id?: string
  churchId: number
  label: string
  cls: string
  responsibleProfileId: string | null
  addMemberIds: string[]
  removeMemberIds: string[]
}

export const GROUP_COLORS = [
  { value: 'tag-kv', label: 'Vinröd' },
  { value: 'tag-bv', label: 'Sand' },
  { value: 'tag-brand', label: 'Rosa' },
  { value: 'tag-konsert', label: 'Guld' },
  { value: 'tag-extra', label: 'Vinröd kant' },
  { value: 'tag-vakt', label: 'Beige' },
  { value: 'tag-kor', label: 'Orange' },
]

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Validate the complete group editor request before any writes occur. */
export function parseGroupEditor(body: Record<string, unknown>): SaveGroupInput {
  const churchId = body.church_id
  if (typeof churchId !== 'number' || !Number.isSafeInteger(churchId) || churchId <= 0) {
    throw new Error('Välj en församling.')
  }
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!label || label.length > 100) throw new Error('Gruppnamn krävs (högst 100 tecken).')
  // Preserve historical colour classes already present in older groups.
  const cls = typeof body.cls === 'string' ? body.cls.trim() : ''
  if (!/^tag-[a-z0-9-]{1,40}$/.test(cls)) throw new Error('Välj en giltig färg.')
  const responsibleProfileId = body.responsible_profile_id
  if (responsibleProfileId !== null && (typeof responsibleProfileId !== 'string' || !uuid.test(responsibleProfileId))) {
    throw new Error('Välj en ansvarig anställd eller Ingen ansvarig.')
  }
  const readIds = (value: unknown): string[] => {
    if (!Array.isArray(value) || value.length > 1000 || value.some(id => typeof id !== 'string' || !uuid.test(id))) {
      throw new Error('Medlemmar måste vara en lista med giltiga personer.')
    }
    return [...new Set(value as string[])]
  }
  const addMemberIds = readIds(body.add_member_ids)
  const removeMemberIds = readIds(body.remove_member_ids)
  if (addMemberIds.some(id => removeMemberIds.includes(id))) throw new Error('En person kan inte både läggas till och tas bort.')
  return { churchId, label, cls, responsibleProfileId, addMemberIds, removeMemberIds }
}

export function isGroupEmployee(person: Pick<GroupPerson, 'role' | 'isEmployee'>) {
  return person.isEmployee && ['anstalld', 'fadmin', 'padmin', 'superadmin'].includes(person.role)
}

/** Touch only this group in this congregation; preserve all other memberships. */
export function applyGroupMemberships<T extends { id: unknown; church: unknown; groups: string[] }>(
  people: T[], groupId: string, churchId: number, addIds: string[], removeIds: string[],
): T[] {
  return people.map(person => {
    if (person.church !== churchId) return person
    const id = String(person.id)
    if (removeIds.includes(id)) return { ...person, groups: person.groups.filter(group => group !== groupId) }
    if (addIds.includes(id) && !person.groups.includes(groupId)) return { ...person, groups: [...person.groups, groupId] }
    return person
  })
}

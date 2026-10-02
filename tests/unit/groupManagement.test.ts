import { describe, expect, it } from 'vitest'
import { applyGroupMemberships, isGroupEmployee, parseGroupEditor } from '@/lib/groupManagement'

const member = '00000000-0000-0000-0000-000000000001'
const other = '00000000-0000-0000-0000-000000000002'
const input = { church_id: 1, label: ' Körvärdar ', cls: 'tag-extra', responsible_profile_id: null, add_member_ids: [member], remove_member_ids: [] }

describe('gruppredigering', () => {
  it('normaliserar namn och dubbla medlemsval', () => {
    expect(parseGroupEditor({ ...input, add_member_ids: [member, member] })).toMatchObject({ label: 'Körvärdar', addMemberIds: [member], churchId: 1 })
  })
  for (const change of [
    { church_id: '1' }, { church_id: 1.5 }, { church_id: 0 }, { label: '' }, { label: 'x'.repeat(101) },
    { cls: 'red injected-class' }, { responsible_profile_id: 'invented' }, { add_member_ids: [3] },
    { remove_member_ids: null }, { add_member_ids: new Array(1001).fill(member) }, { remove_member_ids: [member] },
  ]) {
    it(`avvisar ogiltig inmatning: ${JSON.stringify(change).slice(0, 70)}`, () => {
      expect(() => parseGroupEditor({ ...input, ...change })).toThrow()
    })
  }
  it('tillåter att ansvarig tas bort och att äldre giltig färg bevaras', () => {
    expect(parseGroupEditor({ ...input, cls: 'tag-kyrkv', responsible_profile_id: null }).responsibleProfileId).toBeNull()
  })
  it('bara anställda och anställda administratörer kan vara kontaktperson', () => {
    expect(isGroupEmployee({ role: 'anstalld', isEmployee: true })).toBe(true)
    expect(isGroupEmployee({ role: 'fadmin', isEmployee: true })).toBe(true)
    expect(isGroupEmployee({ role: 'ideell', isEmployee: true })).toBe(false)
    expect(isGroupEmployee({ role: 'kiosk', isEmployee: true })).toBe(false)
    expect(isGroupEmployee({ role: 'anstalld', isEmployee: false })).toBe(false)
  })
  it('bevarar samma persons andra grupper och andra församlingsmedlemskap', () => {
    const people = [
      { id: member, church: 1, groups: ['kör', 'annan'] },
      { id: member, church: 2, groups: ['kör', 'b-grupp'] },
      { id: other, church: 1, groups: ['annan'] },
    ]
    const updated = applyGroupMemberships(people, 'kör', 1, [other], [member])
    expect(updated.map(person => person.groups)).toEqual([['annan'], ['kör', 'b-grupp'], ['annan', 'kör']])
    expect(people[0].groups).toEqual(['kör', 'annan'])
  })
  it('stöder demolägets numeriska person-id och idempotenta tillägg', () => {
    expect(applyGroupMemberships([{ id: 3, church: 1, groups: ['kör'] }], 'kör', 1, ['3'], [])[0].groups).toEqual(['kör'])
  })
})

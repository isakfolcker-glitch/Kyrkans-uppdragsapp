import { describe, expect, it } from 'vitest'
import { effectiveChurchMembership, membershipLabel, organizationGroups } from '@/lib/organizationContext'
import type { Church, ChurchMembershipData, PastoratData } from '@/lib/appData'
const churches: Church[] = [
  { id: 1, name: 'Test A', admin: '', tel: '', pastoratId: 10 },
  { id: 2, name: 'Test B', admin: '', tel: '', pastoratId: 10 },
  { id: 3, name: 'Test C', admin: '', tel: '', pastoratId: 20 },
  { id: 4, name: 'Test D', admin: '', tel: '', pastoratId: null },
]
const pastorat: PastoratData[] = [
  { id: 10, name: 'Test pastorat A', admin: '', adminEmail: '', churches: [1,2] },
  { id: 20, name: 'Test pastorat B', admin: '', adminEmail: '', churches: [3] },
]
const make = (churchId: number, adminLevel: ChurchMembershipData['adminLevel'], change: Partial<ChurchMembershipData> = {}): ChurchMembershipData => ({
  profileId: 'test-user', churchId, adminLevel, role: adminLevel === 'pastorat' ? 'padmin' : 'ideell', isEmployee: adminLevel !== 'none', active: true, acceptedAt: '2026-10-01', ...change,
})

describe('aktiv församling och pastorat', () => {
  it('grupperar bara tillgängliga församlingar, även med dubbelnamn', () => {
    const result = organizationGroups([churches[0], { ...churches[2], name: 'Test A' }], pastorat)
    expect(result.map(group => [group.name, group.churches.map(church => church.id)])).toEqual([
      ['Test pastorat A', [1]], ['Test pastorat B', [3]],
    ])
    expect(result.flatMap(group => group.churches).some(church => church.id === 2)).toBe(false)
  })
  it('visar saknat pastorat utan att koppla församlingen till ett annat', () => {
    expect(organizationGroups([churches[3]], pastorat)).toMatchObject([{ key: 'none', name: 'Utan kopplat pastorat', churches: [{ id: 4 }] }])
  })
  it('ärvd pastoratsbehörighet gäller även om lokal roll är ideell', () => {
    const result = effectiveChurchMembership('test-user', 2, [make(1, 'pastorat'), make(2, 'none')], churches, false)
    expect(result).toMatchObject({ churchId: 2, role: 'padmin', adminLevel: 'pastorat' })
    expect(membershipLabel(result)).toBe('Pastoratsadmin')
  })
  it('ärvd pastoratsbehörighet gäller framför en lägre lokal adminnivå', () => {
    expect(effectiveChurchMembership('test-user', 2, [make(1, 'pastorat'), make(2, 'forsamling')], churches, false)?.adminLevel).toBe('pastorat')
  })
  it('ett annat pastorat behåller sin egen roll', () => {
    expect(effectiveChurchMembership('test-user', 3, [make(1, 'pastorat'), make(3, 'none')], churches, false)?.adminLevel).toBe('none')
    expect(effectiveChurchMembership('test-user', 3, [make(1, 'pastorat')], churches, false)).toBeNull()
  })
  it('två församlingar utan pastorat ger inte ärvd behörighet', () => {
    expect(effectiveChurchMembership('test-user', 4, [make(1, 'pastorat')], churches.map(church => ({ ...church, pastoratId: null })), false)).toBeNull()
  })
  it('inaktiva medlemskap och väntande inbjudningar ger inte ärvd nivå', () => {
    for (const change of [{ active: false }, { acceptedAt: null }]) {
      expect(effectiveChurchMembership('test-user', 2, [make(1, 'pastorat', change), make(2, 'none')], churches, false)?.adminLevel).toBe('none')
    }
  })
  it('systemnivån visas konsekvent även med ett lokalt ideellt medlemskap', () => {
    expect(effectiveChurchMembership('test-user', 2, [make(2, 'none')], churches, true)).toMatchObject({ role: 'superadmin', adminLevel: 'super' })
  })
  it('ett okänt församlings-id ger ingen aktiv roll', () => {
    expect(effectiveChurchMembership('test-user', 999, [], churches, true)).toBeNull()
  })
})

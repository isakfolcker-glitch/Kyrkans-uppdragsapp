import { describe, it, expect } from 'vitest'
import { canAssignLevel, levelRank, roleToLevel, isAdmin, levelInChurch, type Caller, type CallerMembership } from '@/lib/authz'

// Anroparen har ett medlemskap i församling 1 (pastorat 1) med given nivå.
const caller = (adminLevel: Caller['adminLevel'], memberships?: CallerMembership[]): Caller => ({
  id: 'x', email: 'x@test.invalid', name: 'X', adminLevel,
  isSuper: adminLevel === 'super',
  memberships: memberships ?? [{ churchId: 1, pastoratId: 1, role: 'ideell', adminLevel }],
})

describe('roleToLevel', () => {
  it('översätter admin-roller till nivåer', () => {
    expect(roleToLevel('superadmin')).toBe('super')
    expect(roleToLevel('padmin')).toBe('pastorat')
    expect(roleToLevel('fadmin')).toBe('forsamling')
  })
  it('ger ingen adminnivå för övriga eller okända roller', () => {
    for (const r of ['ideell', 'anstalld', 'kiosk', 'hittepå', undefined]) expect(roleToLevel(r)).toBe('none')
  })
})

describe('canAssignLevel', () => {
  it('församlingsadmin kan bara ge ingen nivå eller församlingsnivå', () => {
    const c = caller('forsamling')
    expect(canAssignLevel(c.adminLevel, 'none')).toBe(true)
    expect(canAssignLevel(c.adminLevel, 'forsamling')).toBe(true)
    expect(canAssignLevel(c.adminLevel, 'pastorat')).toBe(false)
    expect(canAssignLevel(c.adminLevel, 'super')).toBe(false)
  })
  it('pastoratsadmin kan inte skapa superadmin', () => {
    expect(canAssignLevel('pastorat', 'pastorat')).toBe(true)
    expect(canAssignLevel('pastorat', 'super')).toBe(false)
  })
  it('superadmin kan ge alla nivåer', () => {
    expect(canAssignLevel('super', 'super')).toBe(true)
  })
  it('ideell kan inte ge någon nivå alls', () => {
    expect(canAssignLevel('none', 'none')).toBe(false)
  })
})

describe('levelRank och isAdmin', () => {
  it('rangordnar nivåerna', () => {
    expect(levelRank('super')).toBeGreaterThan(levelRank('pastorat'))
    expect(levelRank('pastorat')).toBeGreaterThan(levelRank('forsamling'))
    expect(levelRank('forsamling')).toBeGreaterThan(levelRank('none'))
    expect(levelRank(null)).toBe(0)
  })
  it('bara församlingsnivå och uppåt räknas som admin', () => {
    expect(isAdmin(caller('none'))).toBe(false)
    expect(isAdmin(caller('forsamling'))).toBe(true)
    expect(isAdmin(null)).toBe(false)
  })
})

describe('levelInChurch (medlemskap per församling)', () => {
  it('församlingsadmin är admin bara i sin egen församling', () => {
    const c = caller('forsamling')
    expect(levelInChurch(c, 1, 1)).toBe('forsamling')
    expect(levelInChurch(c, 2, 1)).toBe('none')
  })
  it('nivån gäller församlingen det handlar om, inte högsta nivån någonstans', () => {
    const c = caller('forsamling', [
      { churchId: 1, pastoratId: 1, role: 'fadmin', adminLevel: 'forsamling' },
      { churchId: 2, pastoratId: 2, role: 'ideell', adminLevel: 'none' },
    ])
    expect(levelInChurch(c, 2, 2)).toBe('none')
  })
  it('pastoratsadmin når församlingar i samma pastorat men inte i andra', () => {
    const c = caller('pastorat', [{ churchId: 1, pastoratId: 1, role: 'padmin', adminLevel: 'pastorat' }])
    expect(levelInChurch(c, 3, 1)).toBe('pastorat')
    expect(levelInChurch(c, 4, 2)).toBe('none')
  })
  it('pastoratsbehörighet kräver ett pastorat, församlingar utan pastorat räknas inte som samma', () => {
    const c = caller('pastorat', [{ churchId: 1, pastoratId: null, role: 'padmin', adminLevel: 'pastorat' }])
    expect(levelInChurch(c, 5, null)).toBe('none')
    expect(levelInChurch(c, 1, null)).toBe('pastorat')
  })
  it('superadmin är super överallt', () => {
    expect(levelInChurch(caller('super'), 99, null)).toBe('super')
  })
  it('ideell utan medlemskap har ingen nivå', () => {
    expect(levelInChurch(caller('none', []), 1, 1)).toBe('none')
    expect(isAdmin(caller('none', []))).toBe(false)
  })
})

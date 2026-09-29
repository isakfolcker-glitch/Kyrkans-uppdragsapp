import { describe, it, expect } from 'vitest'
import { canAssignLevel, levelRank, roleToLevel, isAdmin, type Caller } from '@/lib/authz'

const caller = (adminLevel: Caller['adminLevel']): Caller => ({
  id: 'x', email: 'x@test.invalid', name: 'X', adminLevel, churchId: 1, pastoratId: 1,
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
    expect(canAssignLevel(c, 'none')).toBe(true)
    expect(canAssignLevel(c, 'forsamling')).toBe(true)
    expect(canAssignLevel(c, 'pastorat')).toBe(false)
    expect(canAssignLevel(c, 'super')).toBe(false)
  })
  it('pastoratsadmin kan inte skapa superadmin', () => {
    expect(canAssignLevel(caller('pastorat'), 'pastorat')).toBe(true)
    expect(canAssignLevel(caller('pastorat'), 'super')).toBe(false)
  })
  it('superadmin kan ge alla nivåer', () => {
    expect(canAssignLevel(caller('super'), 'super')).toBe(true)
  })
  it('ideell kan inte ge någon nivå alls', () => {
    expect(canAssignLevel(caller('none'), 'none')).toBe(false)
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

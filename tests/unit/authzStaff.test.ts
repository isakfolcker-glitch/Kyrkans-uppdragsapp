import { describe, it, expect, vi } from 'vitest'

// Påhittad testdata, inga riktiga personer.
const tables: Record<string, Record<string, unknown>[]> = {
  churches: [
    { id: 1, pastorat_id: 1 },
    { id: 2, pastorat_id: 2 },
  ],
  profile_church_permissions: [
    // Anställd med alla behörigheter i församling A (1), inga i B (2).
    {
      profile_id: 'staff-a', church_id: 1,
      kan_skapa_pass: true, kan_redigera_pass: true, kan_se_bokningar: true, kan_hantera_bokningar: true,
      kan_se_personal: true, kan_lagg_till_personal: true, kan_hantera_grupper: true, kan_skicka_utskick: true,
    },
    // Anställd utan några behörigheter.
    {
      profile_id: 'staff-none', church_id: 1,
      kan_skapa_pass: false, kan_redigera_pass: false, kan_se_bokningar: false, kan_hantera_bokningar: false,
      kan_se_personal: false, kan_lagg_till_personal: false, kan_hantera_grupper: false, kan_skicka_utskick: false,
    },
    // Ideell som (felaktigt) har en behörighetsrad: räknas inte, bara anställda.
    { profile_id: 'ideell-row', church_id: 1, kan_hantera_bokningar: true, kan_skicka_utskick: true },
  ],
}

function builder(table: string) {
  const filters: [string, unknown][] = []
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => { filters.push([col, val]); return b },
    maybeSingle: async () => ({
      data: (tables[table] ?? []).find(row => filters.every(([c, v]) => row[c] === v)) ?? null,
      error: null,
    }),
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: builder }) }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))

const { hasStaffPermission, canAdminOrStaff, isKioskIn, STAFF_PERMISSIONS } = await import('@/lib/authz')
type Caller = import('@/lib/authz').Caller

const make = (id: string, memberships: Caller['memberships']): Caller => ({
  id, email: `${id}@test.invalid`, name: id, isSuper: false, adminLevel: 'none', memberships,
})

const staffA = make('staff-a', [
  { churchId: 1, pastoratId: 1, role: 'anstalld', adminLevel: 'none' },
  { churchId: 2, pastoratId: 2, role: 'anstalld', adminLevel: 'none' },
])
const staffNone = make('staff-none', [{ churchId: 1, pastoratId: 1, role: 'anstalld', adminLevel: 'none' }])
const ideellWithRow = make('ideell-row', [{ churchId: 1, pastoratId: 1, role: 'ideell', adminLevel: 'none' }])
const kiosk = make('kiosk-a', [{ churchId: 1, pastoratId: 1, role: 'kiosk', adminLevel: 'none' }])

describe('personalbehörigheter per församling', () => {
  for (const perm of STAFF_PERMISSIONS) {
    it(`${perm}: gäller i församling A men inte i B`, async () => {
      expect(await hasStaffPermission(staffA, perm, 1)).toBe(true)
      expect(await canAdminOrStaff(staffA, perm, 1)).toBe(true)
      expect(await hasStaffPermission(staffA, perm, 2)).toBe(false)
      expect(await canAdminOrStaff(staffA, perm, 2)).toBe(false)
    })
    it(`${perm}: anställd utan behörigheten nekas`, async () => {
      expect(await hasStaffPermission(staffNone, perm, 1)).toBe(false)
      expect(await canAdminOrStaff(staffNone, perm, 1)).toBe(false)
    })
  }

  it('bara anställda räknas, inte ideella med en behörighetsrad', async () => {
    expect(await hasStaffPermission(ideellWithRow, 'kan_hantera_bokningar', 1)).toBe(false)
    expect(await canAdminOrStaff(ideellWithRow, 'kan_skicka_utskick', 1)).toBe(false)
  })

  it('ingen församling ger ingen behörighet', async () => {
    expect(await hasStaffPermission(staffA, 'kan_hantera_grupper', null)).toBe(false)
    expect(await canAdminOrStaff(staffA, 'kan_hantera_grupper', null)).toBe(false)
  })

  it('okänd behörighet nekas', async () => {
    // @ts-expect-error medvetet ogiltig behörighet
    expect(await hasStaffPermission(staffA, 'kan_allt', 1)).toBe(false)
  })
})

describe('kioskkonto', () => {
  it('är kiosk bara i sin egen församling', () => {
    expect(isKioskIn(kiosk, 1)).toBe(true)
    expect(isKioskIn(kiosk, 2)).toBe(false)
    expect(isKioskIn(staffA, 1)).toBe(false)
  })
  it('kiosk har inga personalbehörigheter', async () => {
    expect(await canAdminOrStaff(kiosk, 'kan_hantera_bokningar', 1)).toBe(false)
  })
})

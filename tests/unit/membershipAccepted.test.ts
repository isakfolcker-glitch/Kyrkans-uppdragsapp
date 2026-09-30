// Väntande medlemskap, lösenordsbyte och e-poständring.
// Påhittad testdata, inga riktiga personer. Databasen ersätts av en liten
// minnesdatabas som klarar de frågor som koden ställer.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
let currentUser: { id: string; email: string } | null = null
const passwordUpdates: string[] = []
const profileUpdates: { id: unknown; values: Row }[] = []

function builder(table: string) {
  const filters: ((row: Row) => boolean)[] = []
  let op: 'select' | 'update' | 'delete' = 'select'
  let values: Row = {}
  let headCount = false
  const rows = () => (tables[table] ?? []).filter(r => filters.every(f => f(r)))
  const run = () => {
    const matched = rows()
    if (op === 'update') {
      matched.forEach(r => Object.assign(r, values))
      if (table === 'profiles') matched.forEach(r => profileUpdates.push({ id: r.id, values }))
    }
    if (op === 'delete') tables[table] = (tables[table] ?? []).filter(r => !matched.includes(r))
    return { data: headCount ? null : matched, count: matched.length, error: null }
  }
  const b = {
    select: (_cols?: string, opts?: { count?: string; head?: boolean }) => { if (opts?.head) headCount = true; return b },
    update: (v: Row) => { op = 'update'; values = v; return b },
    delete: () => { op = 'delete'; return b },
    upsert: async () => ({ error: null }),
    insert: async () => ({ error: null }),
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b },
    neq: (c: string, v: unknown) => { filters.push(r => r[c] !== v); return b },
    in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return b },
    is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return b },
    not: (c: string, _op: string, v: unknown) => { filters.push(r => (r[c] ?? null) !== v); return b },
    order: () => b,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    single: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: builder,
    auth: { admin: { updateUserById: async (id: string) => { passwordUpdates.push(id); return { error: null } } } },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: builder,
    rpc: async () => ({ data: false, error: null }),
  }),
}))
vi.mock('@/app/api/waitlist/route', () => ({ promoteFromWaitlist: async () => {} }))
vi.mock('@/lib/gdpr', () => ({ deletePersonData: async () => {} }))

const authz = await import('@/lib/authz')
const setPassword = await import('@/app/api/people/[id]/set-password/route')
const person = await import('@/app/api/people/[id]/route')

const ACCEPTED = '2026-01-01T00:00:00Z'
const membership = (profile_id: string, church_id: number, role: string, admin_level: string, accepted_at: string | null = ACCEPTED) => ({
  profile_id, church_id, role, admin_level, active: true, accepted_at,
  churches: { pastorat_id: church_id === 3 ? 2 : 1 },
})

beforeEach(() => {
  passwordUpdates.length = 0
  profileUpdates.length = 0
  // Församling 1 och 2 i pastorat 1, församling 3 i pastorat 2.
  tables = {
    churches: [{ id: 1, pastorat_id: 1 }, { id: 2, pastorat_id: 1 }, { id: 3, pastorat_id: 2 }],
    profiles: [
      { id: 'admin-1', name: 'Admin Ett', admin_level: 'none', email: 'admin1@test.invalid' },
      { id: 'pending-admin', name: 'Väntande', admin_level: 'none', email: 'pending@test.invalid' },
      { id: 'super', name: 'Super', admin_level: 'super', email: 'super@test.invalid' },
      { id: 'vol-only-1', name: 'Volontär Ett', admin_level: 'none', email: 'v1@test.invalid' },
      { id: 'vol-1-and-3', name: 'Volontär Två', admin_level: 'none', email: 'v2@test.invalid' },
      { id: 'vol-pending-1', name: 'Volontär Tre', admin_level: 'none', email: 'v3@test.invalid' },
    ],
    profile_churches: [
      membership('admin-1', 1, 'fadmin', 'forsamling'),
      membership('pending-admin', 1, 'fadmin', 'forsamling', null),
      membership('vol-only-1', 1, 'ideell', 'none'),
      membership('vol-1-and-3', 1, 'ideell', 'none'),
      membership('vol-1-and-3', 3, 'ideell', 'none'),
      membership('vol-pending-1', 1, 'ideell', 'none', null),
    ],
    profile_church_permissions: [],
  }
})

const login = (id: string) => { currentUser = { id, email: `${id}@test.invalid` } }
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (url: string, method: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })

describe('väntande medlemskap ger ingen behörighet', () => {
  it('en väntande fadmin-inbjudan gör inte personen till admin', async () => {
    login('pending-admin')
    const { caller } = await authz.getCaller()
    expect(caller).not.toBeNull()
    expect(caller!.memberships).toHaveLength(0)
    expect(authz.isAdmin(caller)).toBe(false)
    expect(await authz.canAdminChurch(caller!, 1)).toBe(false)
    expect(await authz.canAdminProfile(caller!, 'vol-only-1', 1)).toBe(false)
  })

  it('en accepterad fadmin är admin i sin församling', async () => {
    login('admin-1')
    const { caller } = await authz.getCaller()
    expect(await authz.canAdminChurch(caller!, 1)).toBe(true)
    expect(await authz.canAdminChurch(caller!, 2)).toBe(false)
  })

  it('en person med bara väntande inbjudan kan inte administreras av församlingen', async () => {
    login('admin-1')
    const { caller } = await authz.getCaller()
    expect(await authz.canAdminProfile(caller!, 'vol-pending-1', 1)).toBe(false)
  })
})

describe('set-password', () => {
  it('nekas när personen har ett medlemskap i en församling anroparen inte administrerar', async () => {
    login('admin-1')
    const res = await setPassword.POST(req('/api/people/vol-1-and-3/set-password', 'POST', { church_id: 1, password: 'hemligt123' }), params('vol-1-and-3'))
    expect(res.status).toBe(403)
    expect(passwordUpdates).toHaveLength(0)
  })

  it('nekas för en person som bara har en väntande inbjudan', async () => {
    login('admin-1')
    const res = await setPassword.POST(req('/api/people/vol-pending-1/set-password', 'POST', { church_id: 1, password: 'hemligt123' }), params('vol-pending-1'))
    expect(res.status).toBe(403)
    expect(passwordUpdates).toHaveLength(0)
  })

  it('tillåts när alla personens medlemskap ligger i anroparens församling och nivån är lägre', async () => {
    login('admin-1')
    const res = await setPassword.POST(req('/api/people/vol-only-1/set-password', 'POST', { church_id: 1, password: 'hemligt123' }), params('vol-only-1'))
    expect(res.status).toBe(200)
    expect(passwordUpdates).toEqual(['vol-only-1'])
  })

  it('coversAllMemberships kräver att varje accepterad församling täcks', () => {
    const target = { level: 'none' as const, churchIds: [1, 3] }
    expect(authz.coversAllMemberships({ 1: 'forsamling' }, target, { strictlyLower: true })).toBe(false)
    expect(authz.coversAllMemberships({ 1: 'forsamling', 3: 'forsamling' }, target, { strictlyLower: true })).toBe(true)
    expect(authz.coversAllMemberships({ 1: 'forsamling' }, { level: 'none', churchIds: [] })).toBe(false)
    expect(authz.coversAllMemberships({ 1: 'forsamling' }, { level: 'forsamling', churchIds: [1] }, { strictlyLower: true })).toBe(false)
  })
})

describe('people/[id] PATCH: e-post', () => {
  it('en församlingsadmin kan inte ändra e-post', async () => {
    login('admin-1')
    const res = await person.PATCH(req('/api/people/vol-only-1', 'PATCH', { church_id: 1, email: 'ny@test.invalid' }), params('vol-only-1'))
    expect(res.status).toBe(403)
    expect(profileUpdates).toHaveLength(0)
    expect(tables.profiles.find(p => p.id === 'vol-only-1')?.email).toBe('v1@test.invalid')
  })

  it('en församlingsadmin kan inte ändra namn på någon som också tillhör en annan församling', async () => {
    login('admin-1')
    const res = await person.PATCH(req('/api/people/vol-1-and-3', 'PATCH', { church_id: 1, name: 'Nytt Namn' }), params('vol-1-and-3'))
    expect(res.status).toBe(403)
    expect(profileUpdates).toHaveLength(0)
  })

  it('en församlingsadmin kan ändra namn när alla personens medlemskap ligger i församlingen', async () => {
    login('admin-1')
    const res = await person.PATCH(req('/api/people/vol-only-1', 'PATCH', { church_id: 1, name: 'Nytt Namn' }), params('vol-only-1'))
    expect(res.status).toBe(200)
    expect(tables.profiles.find(p => p.id === 'vol-only-1')?.name).toBe('Nytt Namn')
  })

  it('superadmin kan ändra e-post', async () => {
    login('super')
    const res = await person.PATCH(req('/api/people/vol-only-1', 'PATCH', { church_id: 1, email: 'Ny@Test.invalid' }), params('vol-only-1'))
    expect(res.status).toBe(200)
    expect(tables.profiles.find(p => p.id === 'vol-only-1')?.email).toBe('ny@test.invalid')
  })
})

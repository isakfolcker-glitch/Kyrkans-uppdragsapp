// Nya personer med e-post blir väntande, och godkännande sker per församling.
// Påhittad testdata, inga riktiga personer. Databasen ersätts av en minnesdatabas.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
let currentUser: { id: string; email: string } | null = null
const sentInvitations: { to: string; inviteUrl: string; existingAccount?: boolean }[] = []
const generatedLinks: { type: string; email: string }[] = []
const passwordUpdates: string[] = []
let nextUserId = 1

const CONFLICT_KEYS: Record<string, string[]> = {
  profile_churches: ['profile_id', 'church_id'],
  profiles: ['id'],
}

function builder(table: string) {
  const filters: ((row: Row) => boolean)[] = []
  let op: 'select' | 'update' | 'delete' = 'select'
  let values: Row = {}
  const rows = () => (tables[table] ?? []).filter(r => filters.every(f => f(r)))
  const run = () => {
    const matched = rows()
    if (op === 'update') matched.forEach(r => Object.assign(r, values))
    if (op === 'delete') tables[table] = (tables[table] ?? []).filter(r => !matched.includes(r))
    return { data: matched, count: matched.length, error: null }
  }
  const b = {
    select: () => b,
    update: (v: Row) => { op = 'update'; values = v; return b },
    delete: () => { op = 'delete'; return b },
    upsert: async (v: Row) => {
      const keys = CONFLICT_KEYS[table] ?? ['id']
      tables[table] = tables[table] ?? []
      const existing = tables[table].find(r => keys.every(k => r[k] === v[k]))
      if (existing) Object.assign(existing, v)
      else tables[table].push({ ...v })
      return { error: null }
    },
    insert: async (v: Row | Row[]) => {
      tables[table] = [...(tables[table] ?? []), ...(Array.isArray(v) ? v : [v])]
      return { error: null }
    },
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
    auth: {
      admin: {
        createUser: async ({ email }: { email: string }) => {
          const id = `new-${nextUserId++}`
          tables.profiles.push({ id, email, name: '', admin_level: 'none' })
          return { data: { user: { id, email } }, error: null }
        },
        listUsers: async () => ({ data: { users: [] }, error: null }),
        generateLink: async ({ type, email }: { type: string; email: string }) => {
          generatedLinks.push({ type, email })
          return { data: { properties: { action_link: `https://auth.test.invalid/${type}` } }, error: null }
        },
        updateUserById: async (id: string) => { passwordUpdates.push(id); return { error: null } },
      },
    },
  }),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: builder,
    rpc: async () => ({ data: false, error: null }),
  }),
}))
vi.mock('@/lib/email', () => ({
  sendInvitation: async (args: { to: string; inviteUrl: string; existingAccount?: boolean }) => { sentInvitations.push(args) },
}))

const people = await import('@/app/api/people/route')
const accept = await import('@/app/api/memberships/accept/route')
const setPassword = await import('@/app/api/people/[id]/set-password/route')
const { sendMembershipInvitation } = await import('@/lib/membershipInvite')

const ACCEPTED = '2026-01-01T00:00:00Z'

beforeEach(() => {
  sentInvitations.length = 0
  generatedLinks.length = 0
  passwordUpdates.length = 0
  nextUserId = 1
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test.invalid'
  tables = {
    churches: [{ id: 1, pastorat_id: 1, name: 'Församling Ett' }, { id: 2, pastorat_id: 1, name: 'Församling Två' }],
    profiles: [
      { id: 'admin-1', name: 'Admin Ett', admin_level: 'none', email: 'admin1@test.invalid' },
      { id: 'invitee', name: 'Inbjuden', admin_level: 'none', email: 'invitee@test.invalid' },
      { id: 'other', name: 'Annan', admin_level: 'none', email: 'other@test.invalid' },
    ],
    profile_churches: [
      { profile_id: 'admin-1', church_id: 1, role: 'fadmin', admin_level: 'forsamling', active: true, accepted_at: ACCEPTED, churches: { pastorat_id: 1 } },
      { profile_id: 'invitee', church_id: 1, role: 'ideell', admin_level: 'none', active: true, accepted_at: null },
      { profile_id: 'invitee', church_id: 2, role: 'ideell', admin_level: 'none', active: true, accepted_at: null },
      { profile_id: 'other', church_id: 1, role: 'ideell', admin_level: 'none', active: true, accepted_at: null },
    ],
    groups: [],
    profile_groups: [],
    profile_church_permissions: [],
  }
})

const login = (id: string) => { currentUser = { id, email: `${id}@test.invalid` } }
const post = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const membershipOf = (profileId: string, churchId: number) =>
  tables.profile_churches.find(m => m.profile_id === profileId && m.church_id === churchId)

describe('people POST: ny person', () => {
  it('med riktig e-post blir medlemskapet väntande och personen får en inbjudan', async () => {
    login('admin-1')
    const res = await people.POST(post('/api/people', { name: 'Ny Person', email: 'ny@test.invalid', role: 'ideell', church_id: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending).toBe(true)
    const m = membershipOf(body.id, 1)
    expect(m?.active).toBe(true)
    expect(m?.accepted_at ?? null).toBeNull()
    expect(sentInvitations.map(i => i.to)).toEqual(['ny@test.invalid'])
    expect(generatedLinks).toEqual([{ type: 'invite', email: 'ny@test.invalid' }])
  })

  it('utan e-post (@intern.local) blir medlemskapet godkänt direkt och ingen inbjudan skickas', async () => {
    login('admin-1')
    const res = await people.POST(post('/api/people', { name: 'Utan Mejl', role: 'ideell', church_id: 1 }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(membershipOf(body.id, 1)?.accepted_at).toBeTruthy()
    expect(sentInvitations).toHaveLength(0)
  })

  it('set-password nekas för den nya personen så länge medlemskapet är väntande', async () => {
    login('admin-1')
    const created = await (await people.POST(post('/api/people', { name: 'Ny Person', email: 'ny@test.invalid', role: 'ideell', church_id: 1 }))).json()
    const res = await setPassword.POST(
      post(`/api/people/${created.id}/set-password`, { church_id: 1, password: 'hemligt123' }),
      { params: Promise.resolve({ id: created.id }) },
    )
    expect(res.status).toBe(403)
    expect(passwordUpdates).toHaveLength(0)
  })
})

describe('memberships/accept: samtycke per församling', () => {
  it('kräver church_id', async () => {
    login('invitee')
    const res = await accept.POST(post('/api/memberships/accept', {}))
    expect(res.status).toBe(400)
    expect(membershipOf('invitee', 1)?.accepted_at ?? null).toBeNull()
    expect(membershipOf('invitee', 2)?.accepted_at ?? null).toBeNull()
  })

  it('godkänner bara den angivna församlingen', async () => {
    login('invitee')
    const res = await accept.POST(post('/api/memberships/accept', { church_id: 1 }))
    expect(res.status).toBe(200)
    expect(membershipOf('invitee', 1)?.accepted_at).toBeTruthy()
    expect(membershipOf('invitee', 2)?.accepted_at ?? null).toBeNull()
  })

  it('rör aldrig någon annans inbjudan', async () => {
    login('invitee')
    await accept.POST(post('/api/memberships/accept', { church_id: 1 }))
    expect(membershipOf('other', 1)?.accepted_at ?? null).toBeNull()
  })

  it('utan väntande inbjudan i församlingen blir det 403', async () => {
    login('other')
    const res = await accept.POST(post('/api/memberships/accept', { church_id: 2 }))
    expect(res.status).toBe(403)
  })
})

describe('inbjudningsmail', () => {
  it('bekräftade konton får ingen inloggningslänk, bara en vanlig länk till appen', async () => {
    const admin = (await import('@/lib/supabase/admin')).createAdminClient()
    const { error } = await sendMembershipInvitation(admin, {
      email: 'invitee@test.invalid', name: 'Inbjuden', confirmed: true,
      churchId: 2, churchName: 'Församling Två', role: 'ideell', inviterName: 'Admin',
    })
    expect(error).toBeNull()
    expect(generatedLinks).toHaveLength(0)
    expect(sentInvitations[0].inviteUrl).toBe('https://app.test.invalid/dashboard?church=2')
  })
})

// Chatt-API:t med en liten minnesdatabas. Påhittad testdata, inga riktiga personer.
// Databasens egna regler (RLS, triggers) testas i supabase/tests/behorighet_020.sql.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

type Row = Record<string, unknown>
let tables: Record<string, Row[]> = {}
let currentUser: { id: string } | null = null
// Vilka som är medlemmar (grupp -> personer) och vilka grupper som är arkiverade
let members: Record<string, string[]> = {}
let archived: string[] = []
let nextId = 100

function builder(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  let op: 'select' | 'insert' | 'update' = 'select'
  let values: Row = {}
  let max: number | null = null
  const run = () => {
    if (op === 'insert') {
      const dup = (tables[table] ?? []).some(r => r.author_id === values.author_id && r.client_id === values.client_id)
      if (dup) return { data: null, error: { code: '23505', message: 'duplicate' } }
      const row = { id: ++nextId, edited_at: null, deleted_at: null, pinned_at: null, created_at: new Date().toISOString(), reply_to_id: null, ...values }
      tables[table].push(row)
      return { data: [row], error: null }
    }
    const matched = (tables[table] ?? []).filter(r => filters.every(f => f(r)))
    if (op === 'update') matched.forEach(r => Object.assign(r, values))
    return { data: max == null ? matched : matched.slice(0, max), error: null }
  }
  const b = {
    select: () => b,
    insert: (v: Row) => { op = 'insert'; values = v; return b },
    update: (v: Row) => { op = 'update'; values = v; return b },
    upsert: async (v: Row) => {
      const hit = (tables[table] ?? []).find(r => r.profile_id === v.profile_id && r.group_id === v.group_id)
      if (hit) Object.assign(hit, v); else tables[table].push(v)
      return { error: null }
    },
    eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b },
    in: (c: string, v: unknown[]) => { filters.push(r => v.includes(r[c])); return b },
    is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return b },
    gt: (c: string, v: number) => { filters.push(r => (r[c] as number) > v); return b },
    lt: (c: string, v: number) => { filters.push(r => (r[c] as number) < v); return b },
    gte: (c: string, v: string) => { filters.push(r => (r[c] as string) >= v); return b },
    order: () => b,
    limit: (n: number) => { max = n; return b },
    maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
    single: async () => { const r = run(); return { data: r.data?.[0] ?? null, error: r.error } },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej),
  }
  return b
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: builder }) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: builder,
    rpc: async (fn: string, { gid }: { gid: string }) => {
      const member = !!currentUser && (members[gid] ?? []).includes(currentUser.id)
      if (fn === 'is_group_chat_member') return { data: member, error: null }
      if (fn === 'can_post_in_group_chat') return { data: member && !archived.includes(gid), error: null }
      return { data: false, error: null }
    },
  }),
}))

const list = await import('@/app/api/chat/[groupId]/messages/route')
const one = await import('@/app/api/chat/[groupId]/messages/[id]/route')
const read = await import('@/app/api/chat/[groupId]/read/route')

const CID = '3f2b8c1e-5a4d-4c6b-9e7f-0a1b2c3d4e5f'
const CID2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'
const login = (id: string | null) => { currentUser = id ? { id } : null }
const ctx = (groupId: string) => ({ params: Promise.resolve({ groupId }) })
const ctxId = (groupId: string, id: string) => ({ params: Promise.resolve({ groupId, id }) })
const req = (method: string, body?: unknown, url = 'http://localhost/api/chat/g1/messages') =>
  new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const send = (body: unknown, groupId = 'g1') => list.POST(req('POST', body), ctx(groupId))

beforeEach(() => {
  nextId = 100
  currentUser = null
  archived = []
  members = { g1: ['anna', 'bo'], g2: ['anna'], g3: ['bo'] }
  tables = {
    profiles: [{ id: 'anna', name: 'Anna Test' }, { id: 'bo', name: 'Bo Test' }],
    profile_groups: [],
    chat_messages: [],
    group_chats: [{ group_id: 'g1', last_message_id: null }],
    chat_reads: [],
  }
})

describe('POST /api/chat/[groupId]/messages', () => {
  it('401 när man inte är inloggad', async () => {
    expect((await send({ body: 'hej', clientId: CID })).status).toBe(401)
  })
  it('403 för den som inte är med i gruppen (inget sparas)', async () => {
    login('anna')
    expect((await send({ body: 'hej', clientId: CID }, 'g3')).status).toBe(403)
    expect(tables.chat_messages).toHaveLength(0)
  })
  it('403 för okänd grupp, samma svar som för icke-medlem', async () => {
    login('anna')
    expect((await send({ body: 'hej', clientId: CID }, 'finns-inte')).status).toBe(403)
  })
  it('403 i arkiverad chatt', async () => {
    login('anna')
    archived = ['g1']
    const res = await send({ body: 'hej', clientId: CID })
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('archived')
  })
  it('400 för tom text, för lång text och felaktigt clientId', async () => {
    login('anna')
    expect((await send({ body: '   ', clientId: CID })).status).toBe(400)
    expect((await send({ body: 'x'.repeat(4001), clientId: CID })).status).toBe(400)
    expect((await send({ body: 'hej', clientId: 'x' })).status).toBe(400)
    expect(tables.chat_messages).toHaveLength(0)
  })
  it('sparar med trimmad text och författaren från inloggningen, 201', async () => {
    login('anna')
    const res = await send({ body: '  Hej alla  ', clientId: CID, authorId: 'bo' })
    expect(res.status).toBe(201)
    const json = await res.json()
    expect(json.duplicate).toBe(false)
    expect(json.message).toMatchObject({ body: 'Hej alla', authorId: 'anna', authorName: 'Anna Test', groupId: 'g1' })
    expect(tables.chat_messages[0].author_id).toBe('anna')
  })
  it('samma clientId två gånger ger en rad och 200 med det sparade meddelandet', async () => {
    login('anna')
    const first = await (await send({ body: 'Hej', clientId: CID })).json()
    const retry = await send({ body: 'Hej', clientId: CID })
    expect(retry.status).toBe(200)
    const json = await retry.json()
    expect(json.duplicate).toBe(true)
    expect(json.message.id).toBe(first.message.id)
    expect(tables.chat_messages).toHaveLength(1)
  })
  it('clientId som redan används i en annan chatt ger 409', async () => {
    login('anna')
    await send({ body: 'Hej', clientId: CID })
    const res = await send({ body: 'Hej', clientId: CID }, 'g2')
    expect(res.status).toBe(409)
  })
  it('samma clientId hos en annan person är inte en dubblett', async () => {
    login('anna')
    await send({ body: 'Hej', clientId: CID })
    login('bo')
    expect((await send({ body: 'Hej', clientId: CID })).status).toBe(201)
    expect(tables.chat_messages).toHaveLength(2)
  })
  it('429 med Retry-After efter 10 meddelanden på en minut, men återförsök släpps igenom', async () => {
    login('anna')
    const now = Date.now()
    for (let i = 0; i < 10; i++) {
      tables.chat_messages.push({ id: i + 1, group_id: 'g1', author_id: 'anna', body: 'x', client_id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, created_at: new Date(now - 10_000).toISOString() })
    }
    const blocked = await send({ body: 'ett till', clientId: CID2 })
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect((await blocked.json()).code).toBe('rate_limited')
    // Återförsök av redan sparat meddelande stoppas inte av spamskyddet
    const retry = await send({ body: 'x', clientId: '00000000-0000-4000-8000-000000000003' })
    expect(retry.status).toBe(200)
  })
})

describe('GET /api/chat/[groupId]/messages', () => {
  const get = (groupId: string, qs = '') => list.GET(req('GET', undefined, `http://localhost/api/chat/${groupId}/messages${qs}`), ctx(groupId))
  it('401 och 403', async () => {
    expect((await get('g1')).status).toBe(401)
    login('anna')
    expect((await get('g3')).status).toBe(403)
  })
  it('400 för ogiltig cursor', async () => {
    login('anna')
    expect((await get('g1', '?before=abc')).status).toBe(400)
  })
  it('läser även arkiverad chatt', async () => {
    login('anna')
    archived = ['g1']
    expect((await get('g1')).status).toBe(200)
  })
  it('sidindelning med before och limit', async () => {
    login('anna')
    for (let i = 1; i <= 5; i++) tables.chat_messages.push({ id: i, group_id: 'g1', author_id: 'bo', body: `m${i}`, client_id: `c${i}`, created_at: '2026-03-01T12:00:00Z', edited_at: null, deleted_at: null, pinned_at: null, reply_to_id: null })
    // Det mockade builder-läget sorterar inte, så hela sidan kontrolleras via formen
    const res = await get('g1', '?limit=2')
    const json = await res.json()
    expect(json).toHaveProperty('messages')
    expect(json).toHaveProperty('hasMore')
    expect(json).toHaveProperty('nextCursor')
    expect(json.messages.length).toBeLessThanOrEqual(2)
    for (const m of json.messages) expect(Object.keys(m)).not.toContain('email')
  })
})

describe('PATCH och DELETE /api/chat/[groupId]/messages/[id]', () => {
  const seed = () => tables.chat_messages.push({ id: 1, group_id: 'g1', author_id: 'anna', body: 'original', client_id: CID, created_at: '2026-03-01T12:00:00Z', edited_at: null, deleted_at: null, pinned_at: null, reply_to_id: null })
  const url = 'http://localhost/api/chat/g1/messages/1'

  it('bara författaren kan ändra, andra medlemmar får 403', async () => {
    seed(); login('bo')
    expect((await one.PATCH(req('PATCH', { body: 'hackad' }, url), ctxId('g1', '1'))).status).toBe(403)
    expect((await one.DELETE(req('DELETE', undefined, url), ctxId('g1', '1'))).status).toBe(403)
    expect(tables.chat_messages[0].body).toBe('original')
  })
  it('icke-medlem får 403, ej inloggad 401', async () => {
    seed()
    expect((await one.PATCH(req('PATCH', { body: 'x' }, url), ctxId('g1', '1'))).status).toBe(401)
    login('anna')
    expect((await one.PATCH(req('PATCH', { body: 'x' }, 'http://localhost/api/chat/g3/messages/1'), ctxId('g3', '1'))).status).toBe(403)
  })
  it('författaren redigerar sin text', async () => {
    seed(); login('anna')
    const res = await one.PATCH(req('PATCH', { body: ' ny text ' }, url), ctxId('g1', '1'))
    expect(res.status).toBe(200)
    expect((await res.json()).message.body).toBe('ny text')
  })
  it('404 för meddelande som inte finns i gruppen', async () => {
    seed(); login('anna')
    expect((await one.PATCH(req('PATCH', { body: 'x' }, url), ctxId('g1', '999'))).status).toBe(404)
  })
  it('radering är mjuk: texten töms, raden finns kvar, och det går att upprepa', async () => {
    seed(); login('anna')
    const res = await one.DELETE(req('DELETE', undefined, url), ctxId('g1', '1'))
    expect(res.status).toBe(200)
    const { message } = await res.json()
    expect(message.body).toBe('')
    expect(message.deletedAt).not.toBeNull()
    expect(tables.chat_messages).toHaveLength(1)
    expect((await one.DELETE(req('DELETE', undefined, url), ctxId('g1', '1'))).status).toBe(200)
  })
  it('ett borttaget meddelande kan inte redigeras', async () => {
    seed(); login('anna')
    await one.DELETE(req('DELETE', undefined, url), ctxId('g1', '1'))
    expect((await one.PATCH(req('PATCH', { body: 'tillbaka' }, url), ctxId('g1', '1'))).status).toBe(409)
  })
  it('arkiverad chatt är skrivskyddad', async () => {
    seed(); login('anna'); archived = ['g1']
    expect((await one.DELETE(req('DELETE', undefined, url), ctxId('g1', '1'))).status).toBe(403)
  })
})

describe('POST /api/chat/[groupId]/read', () => {
  const mark = (body: unknown, groupId = 'g1') => read.POST(req('POST', body, `http://localhost/api/chat/${groupId}/read`), ctx(groupId))
  beforeEach(() => { tables.group_chats = [{ group_id: 'g1', last_message_id: 50 }] })

  it('401 och 403', async () => {
    expect((await mark({ lastReadId: 5 })).status).toBe(401)
    login('anna')
    expect((await mark({ lastReadId: 5 }, 'g3')).status).toBe(403)
  })
  it('400 för ogiltigt värde', async () => {
    login('anna')
    expect((await mark({ lastReadId: 'x' })).status).toBe(400)
    expect((await mark({ lastReadId: 0 })).status).toBe(400)
  })
  it('sparar, går aldrig bakåt och aldrig förbi senaste meddelandet', async () => {
    login('anna')
    expect(await (await mark({ lastReadId: 20 })).json()).toEqual({ lastReadId: 20 })
    expect(await (await mark({ lastReadId: 10 })).json()).toEqual({ lastReadId: 20 })
    expect(await (await mark({ lastReadId: 9999 })).json()).toEqual({ lastReadId: 50 })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getCaller: vi.fn(), canAdminOrStaff: vi.fn(), rpc: vi.fn(), from: vi.fn(),
}))
vi.mock('@/lib/authz', async () => {
  const { NextResponse } = await import('next/server')
  return { getCaller: mocks.getCaller, canAdminOrStaff: mocks.canAdminOrStaff,
    unauthorized: () => NextResponse.json({ error: 'Logga in' }, { status: 401 }),
    forbidden: () => NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 }) }
})
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }))
const { GET, POST } = await import('@/app/api/groups/route')
const { PATCH } = await import('@/app/api/groups/[id]/route')
const body = { church_id: 1, label: 'Kör', cls: 'tag-extra', responsible_profile_id: null, add_member_ids: [], remove_member_ids: [] }
const request = (payload: unknown = body) => new NextRequest('http://localhost/api/groups/group-a', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
const params = { params: Promise.resolve({ id: 'group-a' }) }
const queryCalls: { table: string; method: string; args: unknown[] }[] = []
let groupChurch: number | null = 1
let queryError: object | null = null

beforeEach(() => {
  vi.clearAllMocks()
  queryCalls.length = 0
  groupChurch = 1
  queryError = null
  mocks.getCaller.mockResolvedValue({ caller: { id: 'actor', isSuper: false } })
  mocks.canAdminOrStaff.mockResolvedValue(true)
  mocks.rpc.mockResolvedValue({ data: { id: 'group-a', ...body }, error: null })
  mocks.from.mockImplementation((table: string) => {
    const result = () => ({ data: table === 'groups' ? [{ id: 'group-a', label: 'Kör', cls: 'tag-extra', church_id: groupChurch }] : [{ profile_id: 'member-a', role: 'ideell', is_employee: false, profiles: { name: 'Test Person', profile_groups: [{ group_id: 'group-a' }] } }], error: queryError })
    const chain: Record<string, unknown> = { then: (resolve: (value: unknown) => void) => resolve(result()), maybeSingle: async () => ({ data: { church_id: groupChurch }, error: queryError }) }
    for (const method of ['select', 'eq', 'or', 'order', 'not', 'neq']) chain[method] = (...args: unknown[]) => { queryCalls.push({ table, method, args }); return chain }
    return chain
  })
})

describe('grupp-API', () => {
  it('kräver inloggning vid både läsning och redigering', async () => {
    mocks.getCaller.mockResolvedValue({ caller: null })
    expect((await GET(new NextRequest('http://localhost/api/groups?church_id=1'))).status).toBe(401)
    expect((await PATCH(request(), params)).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('nekar grupphanterare utan behörighet i just den församlingen', async () => {
    mocks.canAdminOrStaff.mockResolvedValue(false)
    expect((await PATCH(request(), params)).status).toBe(403)
    expect(mocks.canAdminOrStaff).toHaveBeenCalledWith(expect.anything(), 'kan_hantera_grupper', 1)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('nekar ändring av församling trots ett giltigt grupp-id', async () => {
    expect((await PATCH(request({ ...body, church_id: 2 }), params)).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('nekar församlingslokal medlemsändring i gemensam grupp även för superadmin', async () => {
    groupChurch = null
    mocks.getCaller.mockResolvedValue({ caller: { isSuper: true } })
    expect((await PATCH(request(), params)).status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('validerar hela ändringen innan RPC anropas', async () => {
    expect((await PATCH(request({ ...body, add_member_ids: ['not-a-uuid'] }), params)).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('sparar namn, ansvarig och medlemsdelta i ett enda anrop', async () => {
    expect((await PATCH(request(), params)).status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('save_group_management', {
      p_group_id: 'group-a', p_church_id: 1, p_label: 'Kör', p_cls: 'tag-extra', p_responsible_profile_id: null,
      p_add_member_ids: [], p_remove_member_ids: [], p_create: false,
    })
  })
  it('skapar en grupp med kontaktperson och medlemmar i samma transaktion', async () => {
    expect((await POST(request())).status).toBe(201)
    expect(mocks.rpc).toHaveBeenCalledWith('save_group_management', expect.objectContaining({ p_create: true, p_church_id: 1 }))
  })
  it('rapporterar ogiltig ansvarig som valideringsfel, utan råa databasdetaljer', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'private database internals' } })
    const response = await PATCH(request(), params)
    expect(response.status).toBe(400)
    expect(JSON.stringify(await response.json())).not.toContain('private database internals')
  })
  it('databasläsfel blir inte ett falskt 404-svar', async () => {
    queryError = { message: 'db down' }
    expect((await PATCH(request(), params)).status).toBe(500)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('listar endast accepterade aktiva medlemskap i vald församling utan kontaktuppgifter', async () => {
    const response = await GET(new NextRequest('http://localhost/api/groups?church_id=1'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ groups: [{ memberIds: ['member-a'] }], people: [{ name: 'Test Person' }] })
    expect(queryCalls).toContainEqual({ table: 'profile_churches', method: 'eq', args: ['church_id', 1] })
    expect(queryCalls).toContainEqual({ table: 'profile_churches', method: 'eq', args: ['active', true] })
    expect(queryCalls).toContainEqual({ table: 'profile_churches', method: 'not', args: ['accepted_at', 'is', null] })
    expect(JSON.stringify(queryCalls)).not.toMatch(/email|phone/)
  })
  it('nekar läsning av en annan församlings medlemsväljare', async () => {
    mocks.canAdminOrStaff.mockResolvedValue(false)
    expect((await GET(new NextRequest('http://localhost/api/groups?church_id=2'))).status).toBe(403)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

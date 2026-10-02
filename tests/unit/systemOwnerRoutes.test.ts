import { beforeEach, describe, expect, it, vi } from 'vitest'
const { getUser, rpc, deletePersonData, deleteUser, resolveSystemOwner } = vi.hoisted(() => ({
  getUser: vi.fn(), rpc: vi.fn(), deletePersonData: vi.fn(), deleteUser: vi.fn(), resolveSystemOwner: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser }, rpc }) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: { deleteUser } } }) }))
vi.mock('@/lib/systemOwnerServer', () => ({ resolveSystemOwner }))
vi.mock('@/lib/gdpr', () => ({ deletePersonData }))
import { POST } from '@/app/api/system/owner/route'
import { DELETE } from '@/app/api/account/delete/route'
beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'authenticated-id' } } })
  rpc.mockResolvedValue({ data: false, error: null })
  deleteUser.mockResolvedValue({ error: null })
})
describe('systemägare API', () => {
  it('kräver inloggning', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await POST()).status).toBe(401)
    expect(resolveSystemOwner).not.toHaveBeenCalled()
  })
  it('använder identiteten från verifierad session', async () => {
    resolveSystemOwner.mockResolvedValue(true)
    expect(await (await POST()).json()).toEqual({ isOwner: true })
    expect(resolveSystemOwner.mock.calls[0][1]).toEqual({ id: 'authenticated-id' })
  })
  it('ger inget ägarskap vid databasfel', async () => {
    resolveSystemOwner.mockRejectedValue(new Error('migration missing'))
    expect((await POST()).status).toBe(503)
  })
})
describe('radering av systemägarkonto', () => {
  it('nekar innan några personuppgifter eller kontot tas bort', async () => {
    rpc.mockResolvedValue({ data: true, error: null })
    expect((await DELETE()).status).toBe(403)
    expect(deletePersonData).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
  })
  it('avbryter före radering när ägarstatus inte kan kontrolleras', async () => {
    rpc.mockResolvedValue({ data: null, error: {} })
    expect((await DELETE()).status).toBe(503)
    expect(deletePersonData).not.toHaveBeenCalled()
  })
  it('behåller möjligheten för vanliga användare att radera sitt konto', async () => {
    expect((await DELETE()).status).toBe(200)
    expect(deletePersonData).toHaveBeenCalledWith(expect.anything(), 'authenticated-id')
    expect(deleteUser).toHaveBeenCalledWith('authenticated-id', false)
  })
})

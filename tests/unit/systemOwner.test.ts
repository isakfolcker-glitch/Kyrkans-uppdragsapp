import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient, User } from '@supabase/supabase-js'
const { claim } = vi.hoisted(() => ({ claim: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: claim }) }))
import { resolveSystemOwner } from '@/lib/systemOwnerServer'
import { canAssignRole } from '@/lib/membershipAuth'
const user = { id: 'verified-owner-id', email: 'owner@test.invalid', email_confirmed_at: '2026-01-01' } as User
const client = (data = false, error: unknown = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) }) as unknown as SupabaseClient
beforeEach(() => {
  vi.stubEnv('SYSTEM_OWNER_EMAIL', 'owner@test.invalid')
  claim.mockReset().mockResolvedValue({ data: true, error: null })
})
describe('systemägarens identifiering', () => {
  it('binder bara den verifierade inloggningens id', async () => {
    expect(await resolveSystemOwner(client(), user)).toBe(true)
    expect(claim).toHaveBeenCalledWith('claim_system_owner', { p_profile_id: user.id })
  })
  it('jämför e-post utan skiftläge eller omgivande blanksteg', async () => {
    vi.stubEnv('SYSTEM_OWNER_EMAIL', ' OWNER@TEST.INVALID ')
    expect(await resolveSystemOwner(client(), user)).toBe(true)
  })
  it.each([
    { ...user, email: 'someone@test.invalid' },
    { ...user, email_confirmed_at: undefined },
    { ...user, email: undefined },
  ])('ger inte ägarskap till annat eller overifierat konto', async candidate => {
    expect(await resolveSystemOwner(client(), candidate as User)).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })
  it('ger ingen ny ägare när inställningen saknas', async () => {
    vi.stubEnv('SYSTEM_OWNER_EMAIL', '')
    expect(await resolveSystemOwner(client(), user)).toBe(false)
    expect(claim).not.toHaveBeenCalled()
  })
  it('befintlig ägare behåller identiteten efter ändrad e-post/inställning', async () => {
    vi.stubEnv('SYSTEM_OWNER_EMAIL', '')
    expect(await resolveSystemOwner(client(true), { ...user, email: 'changed@test.invalid' })).toBe(true)
    expect(claim).not.toHaveBeenCalled()
  })
  it('faller inte tillbaka på gamla rollflaggor vid databasfel', async () => {
    await expect(resolveSystemOwner(client(false, { message: 'missing migration' }), user)).rejects.toThrow()
    expect(claim).not.toHaveBeenCalled()
  })
  it('kan inte byta ut en redan registrerad ägare', async () => {
    claim.mockResolvedValue({ data: null, error: { code: '42501' } })
    await expect(resolveSystemOwner(client(), user)).rejects.toThrow()
  })
  it('inte ens systemägaren kan dela ut superadminrollen via rollhantering', async () => {
    expect(await canAssignRole(client(true), user.id, 1, 'superadmin')).toBe(false)
  })
})

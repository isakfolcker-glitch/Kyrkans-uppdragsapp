import { describe, expect, it, vi } from 'vitest'
import { saveOnboarding, validateOnboardingInput, type OnboardingSupabaseClient } from '@/lib/onboardingSave'

type UpdateUserCall = { password: string; current_password?: string }

function fakeSupabase(opts: {
  updateUserResponses: Array<{ error: { code?: string; message?: string; reasons?: string[] } | null }>
}) {
  const updateUserCalls: UpdateUserCall[] = []
  const profileUpdates: Record<string, unknown>[] = []
  let call = 0

  const supabase: OnboardingSupabaseClient = {
    auth: {
      updateUser: async (attrs: UpdateUserCall) => {
        updateUserCalls.push(attrs)
        const response = opts.updateUserResponses[call] ?? opts.updateUserResponses[opts.updateUserResponses.length - 1]
        call++
        return response
      },
    },
    from: () => ({
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          profileUpdates.push(values)
          return { error: null }
        },
      }),
    }),
  }

  return { supabase, updateUserCalls, profileUpdates }
}

const VALID_INPUT = {
  phone: '070-123 45 67',
  birthYear: '1990',
  ecName: 'Anna Andersson',
  ecPhone: '070-987 65 43',
  password: 'Hemligt123',
  password2: 'Hemligt123',
}

function fetchJson(body: unknown, ok = true, status = ok ? 200 : 500): typeof fetch {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch
}

describe('validateOnboardingInput', () => {
  it('kräver alla fält', () => {
    expect(validateOnboardingInput({ ...VALID_INPUT, phone: '  ' })).toContain('telefonnummer')
  })

  it('stoppar lösenord som bara har å som bokstav (räknas inte som a-z)', () => {
    const error = validateOnboardingInput({ ...VALID_INPUT, password: 'åååååå12', password2: 'åååååå12' })
    expect(error).toContain('krav')
  })

  it('godkänner giltig inmatning', () => {
    expect(validateOnboardingInput(VALID_INPUT)).toBeNull()
  })
})

describe('saveOnboarding', () => {
  it('lyckas första gången: profil sparas, lösenord sätts direkt, inga inbjudningar', async () => {
    const { supabase, updateUserCalls, profileUpdates } = fakeSupabase({
      updateUserResponses: [{ error: null }],
    })
    const fetchFn = fetchJson([])

    const result = await saveOnboarding({
      supabase, fetchFn, userId: 'user-1', churchId: null, input: VALID_INPUT,
    })

    expect(result).toEqual({
      ok: true, passwordAlreadySet: false, membershipAcceptFailed: false, hasPendingInvites: false,
    })
    expect(updateUserCalls).toEqual([{ password: 'Hemligt123' }])
    // Profiluppgifter sparas före onboarding_done, i två separata uppdateringar.
    expect(profileUpdates[0]).not.toHaveProperty('onboarding_done')
    expect(profileUpdates[1]).toEqual({ onboarding_done: true })
  })

  it('retry efter delvis misslyckande: current_password_required följt av same_password räknas som klart', async () => {
    const { supabase, updateUserCalls } = fakeSupabase({
      updateUserResponses: [
        { error: { code: 'current_password_required' } },
        { error: { code: 'same_password' } },
      ],
    })
    const fetchFn = fetchJson([])

    const result = await saveOnboarding({ supabase, fetchFn, userId: 'user-1', churchId: null, input: VALID_INPUT })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.passwordAlreadySet).toBe(false)
    expect(updateUserCalls).toEqual([
      { password: 'Hemligt123' },
      { password: 'Hemligt123', current_password: 'Hemligt123' },
    ])
  })

  it('lösenord redan satt till ett ANNAT lösenord: current_password_invalid, men flödet fortsätter', async () => {
    const { supabase, profileUpdates } = fakeSupabase({
      updateUserResponses: [
        { error: { code: 'current_password_required' } },
        { error: { code: 'current_password_invalid' } },
      ],
    })
    const fetchFn = fetchJson([])

    const result = await saveOnboarding({ supabase, fetchFn, userId: 'user-1', churchId: null, input: VALID_INPUT })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.passwordAlreadySet).toBe(true)
      expect(result.membershipAcceptFailed).toBe(false)
    }
    // onboarding_done sattes trots att lösenordet inte gick att byta.
    expect(profileUpdates.some(u => u.onboarding_done === true)).toBe(true)
  })

  it('svagt lösenord stoppas redan vid validering, innan något sparas', async () => {
    const { supabase, profileUpdates } = fakeSupabase({ updateUserResponses: [{ error: null }] })
    const fetchFn = fetchJson([])

    const weakInput = { ...VALID_INPUT, password: 'abcdefgh', password2: 'abcdefgh' }
    const result = await saveOnboarding({ supabase, fetchFn, userId: 'user-1', churchId: null, input: weakInput })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('krav')
    expect(profileUpdates).toHaveLength(0)
  })

  it('svagt lösenord enligt Supabase (t.ex. pwned) stoppar efter att profilen redan sparats', async () => {
    const { supabase, profileUpdates } = fakeSupabase({
      updateUserResponses: [{ error: { code: 'weak_password', reasons: ['pwned'] } }],
    })
    const fetchFn = fetchJson([])

    const result = await saveOnboarding({ supabase, fetchFn, userId: 'user-1', churchId: null, input: VALID_INPUT })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('dataintrång')
    // Steg b (profiluppgifter) har redan sparats, ofarligt att försöka igen.
    expect(profileUpdates).toHaveLength(1)
    expect(profileUpdates[0]).not.toHaveProperty('onboarding_done')
  })

  it('403 från memberships/accept (t.ex. borttagen inbjudan) stoppar inte flödet', async () => {
    const { supabase, profileUpdates } = fakeSupabase({ updateUserResponses: [{ error: null }] })
    const fetchFn = vi.fn(async (url: string) => {
      if (url === '/api/memberships/accept') return { ok: false, status: 403, json: async () => ({ error: 'Inbjudan hittades inte' }) }
      return { ok: true, status: 200, json: async () => [] }
    }) as unknown as typeof fetch

    const result = await saveOnboarding({ supabase, fetchFn, userId: 'user-1', churchId: 7, input: VALID_INPUT })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.membershipAcceptFailed).toBe(true)
      expect(result.hasPendingInvites).toBe(false)
    }
    // onboarding_done sattes trots det misslyckade medlemskapsgodkännandet.
    expect(profileUpdates.some(u => u.onboarding_done === true)).toBe(true)
  })

  it('väntande inbjudningar efter lyckad godkännande rapporteras till UI', async () => {
    const { supabase } = fakeSupabase({ updateUserResponses: [{ error: null }] })
    const fetchFn = vi.fn(async (url: string) => {
      if (url === '/api/memberships/accept') return { ok: true, status: 200, json: async () => ({ ok: true }) }
      return { ok: true, status: 200, json: async () => ([{ churchId: 2, churchName: 'Annan församling' }]) }
    }) as unknown as typeof fetch

    const result = await saveOnboarding({ supabase, fetchFn, userId: 'user-1', churchId: 7, input: VALID_INPUT })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.membershipAcceptFailed).toBe(false)
      expect(result.hasPendingInvites).toBe(true)
    }
  })
})

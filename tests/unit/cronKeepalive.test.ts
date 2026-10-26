// Håller Supabase-projekten vakna. Testar bara att behörigheten kontrolleras
// och att svaret aldrig innehåller riktig data, nycklar eller felmeddelanden,
// samt att ett fel i en databas inte stoppar frågan mot den andra.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const calls: { url: string; key: string }[] = []
let results: Record<string, { data: unknown; error: unknown }> = {}

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => {
    calls.push({ url, key })
    return {
      from: (_table: string) => ({
        select: (_cols: string) => ({
          limit: (_n: number) => Promise.resolve(results[url] ?? { data: [{ id: 1 }], error: null }),
        }),
      }),
    }
  },
}))

const { GET } = await import('@/app/api/cron/keepalive/route')

const PROD_URL = 'https://prod.supabase.co'
const TEST_URL = 'https://test.supabase.co'

const req = (headers: Record<string, string> = {}) =>
  new NextRequest('http://localhost/api/cron/keepalive', { headers })

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  calls.length = 0
  results = {}
  process.env.CRON_SECRET = 'hemligt-test-värde'
  process.env.NEXT_PUBLIC_SUPABASE_URL = PROD_URL
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'prod-anon-nyckel'
  delete process.env.KEEPALIVE_TEST_SUPABASE_URL
  delete process.env.KEEPALIVE_TEST_SUPABASE_ANON_KEY
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('GET /api/cron/keepalive', () => {
  it('nekar anrop utan Authorization-header', async () => {
    const res = await GET(req())
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('nekar anrop med fel hemlighet', async () => {
    const res = await GET(req({ authorization: 'Bearer fel-värde' }))
    expect(res.status).toBe(401)
    expect(calls).toHaveLength(0)
  })

  it('hoppar över testdatabasen när dess miljövariabler saknas', async () => {
    const res = await GET(req({ authorization: 'Bearer hemligt-test-värde' }))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, prod: 'ok', test: 'skipped' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(PROD_URL)
  })

  it('frågar båda databaserna när testvariablerna är satta, och läcker aldrig data', async () => {
    process.env.KEEPALIVE_TEST_SUPABASE_URL = TEST_URL
    process.env.KEEPALIVE_TEST_SUPABASE_ANON_KEY = 'test-anon-nyckel'

    const res = await GET(req({ authorization: 'Bearer hemligt-test-värde' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, prod: 'ok', test: 'ok' })
    expect(JSON.stringify(body)).not.toMatch(/anon-nyckel|id.*1/i)
    expect(calls.map(c => c.url).sort()).toEqual([PROD_URL, TEST_URL].sort())
  })

  it('ett fel i en databas stoppar inte frågan mot den andra, och felet läcker aldrig ut', async () => {
    process.env.KEEPALIVE_TEST_SUPABASE_URL = TEST_URL
    process.env.KEEPALIVE_TEST_SUPABASE_ANON_KEY = 'test-anon-nyckel'
    results[PROD_URL] = { data: null, error: { message: 'hemlig databasdetalj', code: '42P01' } }

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET(req({ authorization: 'Bearer hemligt-test-värde' }))
    const body = await res.json()

    expect(body).toEqual({ ok: false, prod: 'error', test: 'ok' })
    // Testdatabasen frågades trots att produktionsfrågan felade.
    expect(calls.map(c => c.url).sort()).toEqual([PROD_URL, TEST_URL].sort())
    expect(JSON.stringify(body)).not.toContain('hemlig databasdetalj')

    const logged = errorSpy.mock.calls.map(args => args.join(' ')).join(' ')
    expect(logged).not.toContain('hemlig databasdetalj')
    expect(logged).not.toContain('test-anon-nyckel')

    errorSpy.mockRestore()
  })
})

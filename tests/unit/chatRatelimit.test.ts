import { describe, it, expect } from 'vitest'
import { evaluateRateLimit, checkRateLimit } from '@/lib/chat/ratelimit'
import type { SupabaseClient } from '@supabase/supabase-js'

const NOW = Date.parse('2026-03-01T12:00:00Z')
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()

describe('evaluateRateLimit', () => {
  it('släpper igenom när inget skickats', () => {
    expect(evaluateRateLimit([], NOW)).toEqual({ allowed: true })
  })
  it('tillåter 9 meddelanden på en minut', () => {
    expect(evaluateRateLimit(Array.from({ length: 9 }, (_, i) => ago(i)), NOW).allowed).toBe(true)
  })
  it('stoppar det 11:e på en minut och säger när det går igen', () => {
    // 10 meddelanden: det äldsta för 50 s sedan faller ur minutfönstret om 10 s
    const times = Array.from({ length: 10 }, (_, i) => ago(5 * i + 5))
    expect(times.at(-1)).toBe(ago(50))
    expect(evaluateRateLimit(times, NOW)).toEqual({ allowed: false, retryAfterSeconds: 10 })
  })
  it('meddelanden äldre än en minut räknas inte mot minutgränsen', () => {
    const times = Array.from({ length: 10 }, (_, i) => ago(61 + i))
    expect(evaluateRateLimit(times, NOW).allowed).toBe(true)
  })
  it('stoppar efter 30 på 10 minuter även om minutgränsen är fri', () => {
    // 30 meddelanden, ett var 19:e sekund: aldrig 10 på en minut
    const times = Array.from({ length: 30 }, (_, i) => ago(i * 19 + 1))
    const r = evaluateRateLimit(times, NOW)
    expect(r.allowed).toBe(false)
    // Det äldsta (552 s sedan) faller ur 600 s-fönstret om 48 s
    expect(r).toEqual({ allowed: false, retryAfterSeconds: 48 })
  })
  it('vid båda gränserna gäller den längsta väntan', () => {
    const times = [...Array.from({ length: 10 }, (_, i) => ago(i + 1)), ...Array.from({ length: 20 }, (_, i) => ago(100 + i * 10))]
    const r = evaluateRateLimit(times, NOW)
    expect(r.allowed).toBe(false)
    if (!r.allowed) expect(r.retryAfterSeconds).toBeGreaterThan(50)
  })
  it('ignorerar ogiltiga tider och klarar osorterad indata', () => {
    expect(evaluateRateLimit(['inte ett datum', ago(5)], NOW).allowed).toBe(true)
  })
})

describe('checkRateLimit', () => {
  const client = (rows: { created_at: string }[] | null, error: unknown = null) => {
    const calls: Record<string, unknown[]> = {}
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'gte', 'order']) b[m] = (...a: unknown[]) => { calls[m] = a; return b }
    b.limit = async (n: number) => { calls.limit = [n]; return { data: rows, error } }
    return { client: { from: () => b } as unknown as SupabaseClient, calls }
  }
  it('frågar bara efter personens egna meddelanden de senaste 10 minuterna', async () => {
    const { client: c, calls } = client([])
    expect(await checkRateLimit(c, 'user-1', NOW)).toEqual({ allowed: true })
    expect(calls.eq).toEqual(['author_id', 'user-1'])
    expect(calls.gte).toEqual(['created_at', new Date(NOW - 600_000).toISOString()])
    expect(calls.limit).toEqual([30])
  })
  it('stoppar när databasen visar 10 på en minut', async () => {
    const { client: c } = client(Array.from({ length: 10 }, (_, i) => ({ created_at: ago(i + 1) })))
    expect((await checkRateLimit(c, 'user-1', NOW)).allowed).toBe(false)
  })
  it('stoppar tillfälligt vid databasfel i stället för att släppa igenom', async () => {
    const { client: c } = client(null, { message: 'fel' })
    expect(await checkRateLimit(c, 'user-1', NOW)).toEqual({ allowed: false, retryAfterSeconds: 5 })
  })
})

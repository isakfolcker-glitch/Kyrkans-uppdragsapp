import { describe, it, expect, vi, afterEach } from 'vitest'
import { passStartDate, isLockedForSelfCancel } from '@/lib/passTiming'

describe('passStartDate', () => {
  it('läser starttid från tidsintervall med tankstreck', () => {
    const d = passStartDate('2026-10-10', '18:00–20:00')
    expect(d?.getHours()).toBe(18)
    expect(d?.getMinutes()).toBe(0)
  })

  it('läser starttid från tidsintervall med bindestreck', () => {
    expect(passStartDate('2026-10-10', '09:30-11:00')?.getHours()).toBe(9)
  })

  it('faller tillbaka på midnatt när tiden saknas eller är fritext', () => {
    expect(passStartDate('2026-10-10', '')?.getHours()).toBe(0)
    expect(passStartDate('2026-10-10', 'efter gudstjänsten')?.getHours()).toBe(0)
  })

  it('returnerar null för tomt eller ogiltigt datum', () => {
    expect(passStartDate('', '10:00')).toBeNull()
    expect(passStartDate('inte-ett-datum', '10:00')).toBeNull()
  })
})

describe('isLockedForSelfCancel', () => {
  afterEach(() => { vi.useRealTimers() })

  const now = new Date('2026-10-01T12:00:00')

  it('låser pass som börjar inom 24 timmar', () => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    expect(isLockedForSelfCancel('2026-10-02', '10:00–12:00')).toBe(true)
  })

  it('låser inte pass som börjar om mer än 24 timmar', () => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    expect(isLockedForSelfCancel('2026-10-03', '10:00–12:00')).toBe(false)
  })

  it('låser pass som redan har börjat', () => {
    vi.useFakeTimers(); vi.setSystemTime(now)
    expect(isLockedForSelfCancel('2026-10-01', '08:00–10:00')).toBe(true)
  })

  it('låser aldrig pass utan datum', () => {
    expect(isLockedForSelfCancel('', '10:00')).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { parseLocalDate, localDateString, isoWeek, weekLabel, weekKey, relativeDay, shortMonth, weekday, formatTime } from '@/lib/dates'

describe('parseLocalDate och localDateString', () => {
  it('går fram och tillbaka utan att datumet flyttas', () => {
    expect(localDateString(parseLocalDate('2026-10-04'))).toBe('2026-10-04')
    expect(parseLocalDate('2026-10-04').getDate()).toBe(4)
  })
})

describe('isoWeek', () => {
  it('räknar veckor som i Sverige', () => {
    expect(isoWeek(parseLocalDate('2026-01-01'))).toBe(1)
    expect(isoWeek(parseLocalDate('2026-10-04'))).toBe(40)
    expect(isoWeek(parseLocalDate('2026-10-05'))).toBe(41)
    expect(isoWeek(parseLocalDate('2027-01-01'))).toBe(53)
  })
})

describe('weekLabel', () => {
  const today = parseLocalDate('2026-09-30') // onsdag vecka 40
  it('samma vecka (måndag till söndag)', () => {
    expect(weekLabel(parseLocalDate('2026-09-28'), today)).toBe('Den här veckan')
    expect(weekLabel(parseLocalDate('2026-10-04'), today)).toBe('Den här veckan')
  })
  it('nästa vecka', () => {
    expect(weekLabel(parseLocalDate('2026-10-05'), today)).toBe('Nästa vecka')
    expect(weekLabel(parseLocalDate('2026-10-11'), today)).toBe('Nästa vecka')
  })
  it('senare veckor får veckonummer', () => {
    expect(weekLabel(parseLocalDate('2026-10-12'), today)).toBe('Vecka 42')
  })
  it('weekKey är lika inom samma vecka', () => {
    expect(weekKey(parseLocalDate('2026-09-28'))).toBe(weekKey(parseLocalDate('2026-10-04')))
    expect(weekKey(parseLocalDate('2026-10-04'))).not.toBe(weekKey(parseLocalDate('2026-10-05')))
  })
})

describe('relativeDay', () => {
  const today = new Date(2026, 8, 30, 14, 0)
  it('i dag och i går', () => {
    expect(relativeDay(new Date(2026, 8, 30, 8, 0), today)).toBe('i dag')
    expect(relativeDay(new Date(2026, 8, 29, 23, 0), today)).toBe('i går')
  })
  it('annars dag och månad', () => {
    expect(relativeDay(new Date(2026, 9, 5), today)).toBe('5 oktober')
  })
})

describe('textformat', () => {
  it('kort månad utan punkt', () => {
    expect(shortMonth(parseLocalDate('2026-10-04'))).toBe('okt')
  })
  it('veckodag lång och kort', () => {
    expect(weekday(parseLocalDate('2026-10-04'), 'long')).toBe('söndag')
    expect(weekday(parseLocalDate('2026-10-05'), 'short')).toBe('mån')
  })
  it('tid med punkt', () => {
    expect(formatTime('09:30')).toBe('09.30')
    expect(formatTime('18:00–20:00')).toBe('18.00–20.00')
  })
})

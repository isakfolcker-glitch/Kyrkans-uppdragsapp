import { describe, it, expect } from 'vitest'
import { avBg, avFg, DEFAULT_AV, DEFAULT_AC } from '@/lib/avatarColors'

const WARM = ['#FFEBE1', '#FFC3AA', '#F3E3CC', '#FFDCCB']

describe('avBg', () => {
  it('behåller varma färger', () => {
    expect(avBg('#FFC3AA')).toBe('#FFC3AA')
    expect(avBg('#ffebe1')).toBe('#FFEBE1')
  })
  it('mappar gamla lila och gröna färger till varma', () => {
    for (const old of ['#EEEDFE', '#E6F5F0', '#E5F0FF', '#F5E5FF', '#BEE1C8']) {
      expect(WARM).toContain(avBg(old))
    }
  })
  it('samma gamla färg ger samma nya', () => {
    expect(avBg('#EEEDFE')).toBe(avBg('#eeedfe'))
  })
  it('saknad färg ger förval', () => {
    expect(avBg(null)).toBe(DEFAULT_AV)
    expect(avBg('')).toBe(DEFAULT_AV)
  })
})

describe('avFg', () => {
  it('gamla textfärger blir vinröda', () => {
    expect(avFg('#3C3489')).toBe(DEFAULT_AC)
    expect(avFg('#085041')).toBe(DEFAULT_AC)
    expect(avFg(undefined)).toBe(DEFAULT_AC)
  })
  it('vinrött och svart behålls', () => {
    expect(avFg('#7d0037')).toBe('#7D0037')
    expect(avFg('#000')).toBe('#000')
  })
})

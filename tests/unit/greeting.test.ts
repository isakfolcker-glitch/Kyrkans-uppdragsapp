import { describe, it, expect } from 'vitest'
import { greetingFor, firstName } from '@/lib/greeting'

describe('greetingFor', () => {
  it('säger God morgon på morgonen', () => {
    expect(greetingFor(5)).toBe('God morgon')
    expect(greetingFor(9)).toBe('God morgon')
  })
  it('säger God dag mitt på dagen', () => {
    expect(greetingFor(10)).toBe('God dag')
    expect(greetingFor(17)).toBe('God dag')
  })
  it('säger God kväll på kvällen och natten', () => {
    expect(greetingFor(18)).toBe('God kväll')
    expect(greetingFor(23)).toBe('God kväll')
    expect(greetingFor(2)).toBe('God kväll')
  })
})

describe('firstName', () => {
  it('tar första ordet i namnet', () => {
    expect(firstName('Anna Testsson')).toBe('Anna')
    expect(firstName('  Anna  ')).toBe('Anna')
  })
  it('ger tom sträng när namn saknas', () => {
    expect(firstName('')).toBe('')
    expect(firstName(null)).toBe('')
    expect(firstName(undefined)).toBe('')
  })
})

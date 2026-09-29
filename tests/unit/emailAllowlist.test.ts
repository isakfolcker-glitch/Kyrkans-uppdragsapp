import { describe, it, expect } from 'vitest'
import { isAllowedTestEmail } from '@/lib/email'

// Skyddar mot att testmiljön råkar maila riktiga volontärer.
describe('isAllowedTestEmail', () => {
  const list = ['test@exempel.se', '@testdomän.se']

  it('släpper igenom exakt adress oavsett versaler', () => {
    expect(isAllowedTestEmail('Test@Exempel.se', list)).toBe(true)
  })

  it('släpper igenom plus-alias av godkänd adress', () => {
    expect(isAllowedTestEmail('test+ideell1@exempel.se', list)).toBe(true)
  })

  it('släpper igenom hel godkänd domän', () => {
    expect(isAllowedTestEmail('vem.som.helst@testdomän.se', list)).toBe(true)
  })

  it('blockerar riktiga adresser utanför listan', () => {
    expect(isAllowedTestEmail('volontar@gmail.com', list)).toBe(false)
    expect(isAllowedTestEmail('annan@exempel.se', list)).toBe(false)
  })

  it('blockerar domäner som bara liknar en godkänd', () => {
    expect(isAllowedTestEmail('x@falsk-testdomän.se.evil.com', list)).toBe(false)
    expect(isAllowedTestEmail('test@exempel.se.evil.com', list)).toBe(false)
  })
})

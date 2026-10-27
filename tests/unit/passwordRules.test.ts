import { describe, expect, it } from 'vitest'
import { checkPassword, isPasswordValid, passwordErrorToSwedish } from '@/lib/passwordRules'

describe('checkPassword', () => {
  it('godkänner ett lösenord som uppfyller alla krav', () => {
    expect(checkPassword('Hemligt123')).toEqual([])
    expect(isPasswordValid('Hemligt123')).toBe(true)
  })

  it('kräver minst 8 tecken', () => {
    const unmet = checkPassword('Ab1')
    expect(unmet.map(r => r.key)).toContain('length')
  })

  it('kräver minst en liten bokstav, en stor bokstav och en siffra', () => {
    expect(checkPassword('abc12345').map(r => r.key)).toContain('uppercase')
    expect(checkPassword('ABC12345').map(r => r.key)).toContain('lowercase')
    expect(checkPassword('Abcdefgh').map(r => r.key)).toContain('digit')
  })

  it('å, ä, ö räknas INTE som en giltig liten bokstav', () => {
    // "åäöåäö12" har bara å/ä/ö som bokstäver, ingen ASCII a-z, så lowercase ska saknas.
    const unmet = checkPassword('åäöåäö12')
    expect(unmet.map(r => r.key)).toContain('lowercase')
  })

  it('stoppar vid mer än 72 byte (inte bara 72 tecken)', () => {
    // Varje "é" är 2 byte i UTF-8, så 40 stycken blir 80 byte men bara 40 tecken.
    const pw = 'Aa1' + 'é'.repeat(40)
    const unmet = checkPassword(pw)
    expect(unmet.map(r => r.key)).toContain('max_length')
  })

  it('isPasswordValid är falskt när något krav saknas', () => {
    expect(isPasswordValid('kort')).toBe(false)
  })
})

describe('passwordErrorToSwedish', () => {
  it('översätter current_password_required', () => {
    expect(passwordErrorToSwedish({ code: 'current_password_required' }))
      .toBe('Du måste ange ditt nuvarande lösenord för att byta det.')
  })

  it('översätter current_password_invalid', () => {
    expect(passwordErrorToSwedish({ code: 'current_password_invalid' }))
      .toBe('Det nuvarande lösenordet stämmer inte.')
  })

  it('översätter same_password', () => {
    expect(passwordErrorToSwedish({ code: 'same_password' }))
      .toContain('ett annat')
  })

  it('översätter weak_password med skäl', () => {
    const msg = passwordErrorToSwedish({ code: 'weak_password', reasons: ['length', 'characters'] })
    expect(msg).toContain('för kort eller för långt')
    expect(msg).toContain('saknar en liten bokstav')
  })

  it('weak_password utan skäl ger ett allmänt meddelande', () => {
    expect(passwordErrorToSwedish({ code: 'weak_password' })).toContain('för svagt')
  })

  it('okänd felkod ger ett allmänt svenskt meddelande', () => {
    expect(passwordErrorToSwedish({ code: 'something_else', message: 'boom' })).toContain('Något gick fel')
  })

  it('ingen fel-information ger ett allmänt meddelande utan att krascha', () => {
    expect(passwordErrorToSwedish(null)).toBe('Något gick fel. Försök igen.')
  })
})

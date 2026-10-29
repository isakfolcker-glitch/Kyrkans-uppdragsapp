import { describe, it, expect } from 'vitest'
import {
  validateBody, validateSendInput, parsePageQuery, parsePositiveInt, isUuid, isValidGroupId,
  MAX_BODY_LENGTH, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
} from '@/lib/chat/validate'

const UUID = '3f2b8c1e-5a4d-4c6b-9e7f-0a1b2c3d4e5f'

describe('validateBody', () => {
  it('trimmar texten', () => {
    expect(validateBody('  hej  ')).toEqual({ ok: true, body: 'hej' })
  })
  it('nekar tom text och bara blanksteg', () => {
    expect(validateBody('').ok).toBe(false)
    expect(validateBody('   \n ').ok).toBe(false)
  })
  it('nekar allt som inte är text', () => {
    for (const v of [null, undefined, 5, {}, ['a']]) expect(validateBody(v).ok).toBe(false)
  })
  it('tillåter exakt 4000 tecken men inte 4001', () => {
    expect(validateBody('x'.repeat(MAX_BODY_LENGTH)).ok).toBe(true)
    expect(validateBody('x'.repeat(MAX_BODY_LENGTH + 1)).ok).toBe(false)
  })
  it('räknar tecken som databasen (kodpunkter, inte UTF-16)', () => {
    expect(validateBody('😀'.repeat(MAX_BODY_LENGTH)).ok).toBe(true)
    expect(validateBody('😀'.repeat(MAX_BODY_LENGTH + 1)).ok).toBe(false)
  })
  it('nekar NUL-tecken', () => {
    expect(validateBody('hej\u0000då').ok).toBe(false)
  })
})

describe('validateSendInput', () => {
  it('godtar body och clientId', () => {
    const r = validateSendInput({ body: ' Hej ', clientId: UUID.toUpperCase() })
    expect(r).toEqual({ ok: true, input: { body: 'Hej', clientId: UUID, replyToId: null } })
  })
  it('kräver UUID som clientId', () => {
    expect(validateSendInput({ body: 'hej', clientId: 'abc' }).ok).toBe(false)
    expect(validateSendInput({ body: 'hej' }).ok).toBe(false)
  })
  it('tolkar replyToId och nekar ogiltigt', () => {
    const ok = validateSendInput({ body: 'hej', clientId: UUID, replyToId: 7 })
    expect(ok.ok && ok.input.replyToId).toBe(7)
    expect(validateSendInput({ body: 'hej', clientId: UUID, replyToId: -1 }).ok).toBe(false)
    expect(validateSendInput({ body: 'hej', clientId: UUID, replyToId: 'x' }).ok).toBe(false)
  })
  it('nekar body som inte är ett objekt', () => {
    for (const v of [null, 'text', [], 5]) expect(validateSendInput(v).ok).toBe(false)
  })
})

describe('parsePageQuery', () => {
  const q = (s: string) => parsePageQuery(new URLSearchParams(s))
  it('standard: senaste 50', () => {
    expect(q('')).toEqual({ ok: true, before: null, after: null, limit: DEFAULT_PAGE_SIZE })
  })
  it('begränsar limit uppåt', () => {
    const r = q('limit=5000')
    expect(r.ok && r.limit).toBe(MAX_PAGE_SIZE)
  })
  it('tolkar before och after, men inte båda', () => {
    expect(q('before=12')).toMatchObject({ ok: true, before: 12 })
    expect(q('after=0')).toMatchObject({ ok: true, after: 0 })
    expect(q('before=1&after=2').ok).toBe(false)
  })
  it('nekar ogiltiga värden', () => {
    for (const s of ['before=abc', 'before=-1', 'before=0', 'limit=0', 'limit=1.5', 'after=x']) expect(q(s).ok).toBe(false)
  })
})

describe('små hjälpfunktioner', () => {
  it('parsePositiveInt', () => {
    expect(parsePositiveInt('42')).toBe(42)
    expect(parsePositiveInt(42)).toBe(42)
    for (const v of ['0', '-3', '1e3', ' 4', 1.5, NaN, null, '9'.repeat(30)]) expect(parsePositiveInt(v)).toBeNull()
  })
  it('isUuid och isValidGroupId', () => {
    expect(isUuid(UUID)).toBe(true)
    expect(isUuid('nej')).toBe(false)
    expect(isValidGroupId('barnkor_123')).toBe(true)
    expect(isValidGroupId('')).toBe(false)
    expect(isValidGroupId('x'.repeat(201))).toBe(false)
    expect(isValidGroupId(5)).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import {
  buildPage, resolveExisting, toChatMessage, previewOf, initialsOf, classifyInsertError, DELETED_USER_NAME,
  type MessageRow, type AuthorInfo,
} from '@/lib/chat/server'
import { planGroupSync } from '@/lib/groupMembers'

const row = (id: number, extra: Partial<MessageRow> = {}): MessageRow => ({
  id, group_id: 'g1', author_id: 'u1', body: `m${id}`, reply_to_id: null,
  client_id: '3f2b8c1e-5a4d-4c6b-9e7f-0a1b2c3d4e5f', created_at: '2026-03-01T12:00:00Z',
  edited_at: null, deleted_at: null, pinned_at: null, ...extra,
})

describe('buildPage', () => {
  // before: databasen ger senaste först, limit + 1 rader
  it('äldre historik: vänder till stigande och ger cursor till nästa sida', () => {
    const fetched = [row(10), row(9), row(8), row(7)]
    const p = buildPage(fetched, 'before', 3)
    expect(p.rows.map(r => r.id)).toEqual([8, 9, 10])
    expect(p.hasMore).toBe(true)
    expect(p.nextCursor).toBe(8)
  })
  it('sista sidan har ingen cursor', () => {
    const p = buildPage([row(2), row(1)], 'before', 3)
    expect(p.rows.map(r => r.id)).toEqual([1, 2])
    expect(p.hasMore).toBe(false)
    expect(p.nextCursor).toBeNull()
  })
  it('nyare meddelanden (after): behåller stigande ordning', () => {
    const p = buildPage([row(5), row(6), row(7)], 'after', 2)
    expect(p.rows.map(r => r.id)).toEqual([5, 6])
    expect(p.hasMore).toBe(true)
    expect(p.nextCursor).toBe(6)
  })
  it('tom sida', () => {
    expect(buildPage([], 'before', 50)).toEqual({ rows: [], hasMore: false, nextCursor: null })
  })
})

describe('idempotens', () => {
  it('okänt clientId är nytt', () => {
    expect(resolveExisting(null, 'g1')).toBe('new')
  })
  it('samma clientId i samma chatt är ett återförsök', () => {
    expect(resolveExisting({ group_id: 'g1' }, 'g1')).toBe('duplicate')
  })
  it('samma clientId i en annan chatt är en krock', () => {
    expect(resolveExisting({ group_id: 'g2' }, 'g1')).toBe('conflict')
  })
  it('unikt-brott och okänt svarsmeddelande från databasen tolkas rätt', () => {
    expect(classifyInsertError('23505')).toBe('duplicate')
    expect(classifyInsertError('23503')).toBe('bad_reply')
    expect(classifyInsertError('XX000')).toBe('error')
    expect(classifyInsertError(undefined)).toBe('error')
  })
})

describe('toChatMessage', () => {
  const authors = new Map<string, AuthorInfo>([
    ['u1', { name: 'Anna Test', ini: null, avColor: '#FFEBE1', acColor: '#7D0037', isLeader: true }],
  ])
  it('lägger på namn, initialer, färger och gruppansvar', () => {
    const m = toChatMessage(row(1), authors)
    expect(m).toMatchObject({ id: 1, authorName: 'Anna Test', authorIni: 'AT', authorAvColor: '#FFEBE1', authorIsLeader: true, body: 'm1' })
  })
  it('exponerar inga känsliga fält', () => {
    const keys = Object.keys(toChatMessage(row(1), authors))
    for (const k of ['email', 'mail', 'phone', 'tel', 'deleted_by', 'pinned_by']) expect(keys).not.toContain(k)
  })
  it('raderat konto ger Borttagen användare', () => {
    const m = toChatMessage(row(2, { author_id: null }), authors)
    expect(m.authorName).toBe(DELETED_USER_NAME)
    expect(m.authorId).toBeNull()
  })
  it('ett borttaget meddelande har alltid tom text', () => {
    const m = toChatMessage(row(3, { body: 'läcker', deleted_at: '2026-03-01T13:00:00Z' }), authors)
    expect(m.body).toBe('')
    expect(m.deletedAt).toBe('2026-03-01T13:00:00Z')
  })
})

describe('förhandsvisning och initialer', () => {
  it('kortar långa texter och slår ihop radbrytningar', () => {
    expect(previewOf('a\n\n b')).toBe('a b')
    const p = previewOf('x'.repeat(500))
    expect(Array.from(p)).toHaveLength(200)
    expect(p.endsWith('…')).toBe(true)
  })
  it('initialer: sparade först, annars från namnet', () => {
    expect(initialsOf('Anna Test', 'AB')).toBe('AB')
    expect(initialsOf('Anna Maria Test')).toBe('AM')
    expect(initialsOf('')).toBe('')
  })
})

describe('planGroupSync (gruppmedlemskap och gruppansvar)', () => {
  const have = [{ group_id: 'a', is_leader: true }, { group_id: 'b', is_leader: false }]
  it('rör inte medlemskap som består (joined_at och gruppansvar bevaras)', () => {
    expect(planGroupSync(have, ['a', 'b'], undefined)).toEqual({ remove: [], add: [], setLeader: [], unsetLeader: [] })
  })
  it('tar bara bort och lägger bara till skillnaden', () => {
    const p = planGroupSync(have, ['b', 'c'], undefined)
    expect(p.remove).toEqual(['a'])
    expect(p.add).toEqual([{ group_id: 'c', is_leader: false }])
  })
  it('sätter och tar bort gruppansvar när listan skickas med', () => {
    const p = planGroupSync(have, ['a', 'b', 'c'], ['b', 'c'])
    expect(p.setLeader).toEqual(['b'])
    expect(p.unsetLeader).toEqual(['a'])
    expect(p.add).toEqual([{ group_id: 'c', is_leader: true }])
  })
  it('gruppansvar för en grupp personen inte är med i ignoreras', () => {
    const p = planGroupSync(have, ['a'], ['z'])
    expect(p.add).toEqual([])
    expect(p.unsetLeader).toEqual(['a'])
  })
})

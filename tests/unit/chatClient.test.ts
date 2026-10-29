import { describe, it, expect } from 'vitest'
import type { ChatMessage, ChatMessageRow, ChatSummary } from '@/lib/chat/types'
import {
  mergeMessages, lastRealId, firstRealId, applyRowUpdate, hasMessage, sortChats, filterChats, totalUnread,
  formatUnread, previewLine, formatListTime, formatDayLabel, shouldShowAuthor, isNearBottom, parseRetryAfter,
  describeSendFailure, ChatApiFailure, withLeader, type ChatItem,
} from '@/lib/chatClient'

const msg = (id: number, over: Partial<ChatItem> = {}): ChatItem => ({
  id, groupId: 'g', authorId: 'a', authorName: 'Anna Ek', authorIni: 'AE', authorAvColor: null, authorAcColor: null,
  authorIsLeader: false, body: `m${id}`, replyToId: null, clientId: `c${id}`,
  createdAt: '2026-10-01T10:00:00.000Z', editedAt: null, deletedAt: null, pinnedAt: null, ...over,
})
const local = (n: number, clientId: string) => msg(-n, { clientId, pending: true })

const chat = (over: Partial<ChatSummary> = {}): ChatSummary => ({
  groupId: 'g', label: 'Kyrkvärd', cls: 'tag-kv', churchId: 1, churchName: 'Domkyrkan', isLeader: false,
  archived: false, unreadCount: 0, lastMessage: null, lastActivityAt: null, ...over,
})

describe('mergeMessages', () => {
  it('tar bort dubbletter på id och sorterar äldst först', () => {
    const out = mergeMessages([msg(3), msg(1)], [msg(2), msg(3, { body: 'ny' })])
    expect(out.map(m => m.id)).toEqual([1, 2, 3])
    expect(out[2].body).toBe('ny')
  })
  it('ersätter ett lokalt meddelande när det sparade kommer (samma clientId)', () => {
    const out = mergeMessages([msg(1), local(1, 'abc')], [msg(2, { clientId: 'abc' })])
    expect(out.map(m => m.id)).toEqual([1, 2])
    expect(out.some(m => m.pending)).toBe(false)
  })
  it('lägger lokala meddelanden sist', () => {
    const out = mergeMessages([local(1, 'x'), msg(5)], [msg(6)])
    expect(out.map(m => m.id)).toEqual([5, 6, -1])
  })
  it('klarar tom lista', () => {
    expect(mergeMessages([], [])).toEqual([])
  })
})

describe('lastRealId och firstRealId', () => {
  it('hoppar över lokala meddelanden', () => {
    expect(lastRealId([msg(2), msg(7), local(1, 'x')])).toBe(7)
    expect(firstRealId([msg(4), msg(2), local(1, 'x')])).toBe(2)
  })
  it('null när inget är sparat', () => {
    expect(lastRealId([local(1, 'x')])).toBeNull()
    expect(firstRealId([])).toBeNull()
  })
})

const row = (over: Partial<ChatMessageRow> = {}): ChatMessageRow => ({
  id: 2, group_id: 'g', author_id: 'a', body: 'ändrad', reply_to_id: null, client_id: 'c2',
  created_at: '2026-10-01T10:00:00.000Z', edited_at: '2026-10-01T10:05:00.000Z', deleted_at: null,
  deleted_by: null, pinned_at: null, pinned_by: null, ...over,
})

describe('applyRowUpdate', () => {
  it('uppdaterar text och redigeringsmärke', () => {
    const out = applyRowUpdate([msg(1), msg(2)], row())
    expect(out[1].body).toBe('ändrad')
    expect(out[1].editedAt).toBe('2026-10-01T10:05:00.000Z')
  })
  it('markerar borttaget med tom text', () => {
    const out = applyRowUpdate([msg(2)], row({ body: '', deleted_at: '2026-10-01T11:00:00.000Z', edited_at: null }))
    expect(out[0].deletedAt).toBe('2026-10-01T11:00:00.000Z')
    expect(out[0].body).toBe('')
  })
  it('lämnar listan orörd för okänt meddelande eller ingen ändring', () => {
    const list = [msg(1)]
    expect(applyRowUpdate(list, row({ id: 99 }))).toBe(list)
    const same = [msg(2, { body: 'ändrad', editedAt: '2026-10-01T10:05:00.000Z' })]
    expect(applyRowUpdate(same, row())).toBe(same)
  })
})

describe('hasMessage', () => {
  it('känner igen på id eller clientId', () => {
    expect(hasMessage([msg(1)], { id: 1, client_id: 'z' })).toBe(true)
    expect(hasMessage([local(1, 'z')], { id: 9, client_id: 'z' })).toBe(true)
    expect(hasMessage([msg(1)], { id: 2, client_id: 'z' })).toBe(false)
  })
})

describe('sortChats och filterChats', () => {
  const a = chat({ groupId: 'a', label: 'Alla', lastActivityAt: '2026-10-01T10:00:00Z' })
  const b = chat({ groupId: 'b', label: 'Bönegrupp', lastActivityAt: '2026-10-02T10:00:00Z', unreadCount: 3 })
  const c = chat({ groupId: 'c', label: 'Ålderdom', lastActivityAt: null })
  const d = chat({ groupId: 'd', label: 'Caféjour', lastActivityAt: null })
  it('sorterar på senaste aktivitet, tomma sist på namn', () => {
    expect(sortChats([c, a, d, b]).map(x => x.groupId)).toEqual(['b', 'a', 'd', 'c'])
  })
  it('ändrar inte originallistan', () => {
    const list = [a, b]
    sortChats(list)
    expect(list[0]).toBe(a)
  })
  it('söker på namn utan hänsyn till versaler', () => {
    expect(filterChats([a, b, c], '  BÖNE', false).map(x => x.groupId)).toEqual(['b'])
    expect(filterChats([a, b, c], 'å', false).map(x => x.groupId)).toEqual(['c'])
  })
  it('filtrerar på olästa', () => {
    expect(filterChats([a, b], '', true).map(x => x.groupId)).toEqual(['b'])
  })
  it('summerar olästa', () => {
    expect(totalUnread([a, b, chat({ unreadCount: 2 })])).toBe(5)
  })
})

describe('formatUnread', () => {
  it('visar 99+ över 99', () => {
    expect(formatUnread(5)).toBe('5')
    expect(formatUnread(99)).toBe('99')
    expect(formatUnread(100)).toBe('99+')
  })
})

describe('previewLine', () => {
  const last = (over = {}) => ({ id: 1, authorId: 'x', authorName: 'Karin Lund', preview: 'Hej!', deleted: false, createdAt: '2026-10-01T10:00:00Z', ...over })
  it('visar avsändarens förnamn', () => {
    expect(previewLine(chat({ lastMessage: last() }), 'me')).toBe('Karin: Hej!')
  })
  it('visar Du för egna meddelanden', () => {
    expect(previewLine(chat({ lastMessage: last({ authorId: 'me' }) }), 'me')).toBe('Du: Hej!')
  })
  it('hanterar borttaget och tom chatt', () => {
    expect(previewLine(chat({ lastMessage: last({ deleted: true, preview: '' }) }), 'me')).toBe('Meddelandet togs bort')
    expect(previewLine(chat(), 'me')).toBe('Inga meddelanden än')
  })
})

describe('tid', () => {
  const now = new Date(2026, 9, 15, 12, 0, 0)
  const at = (d: Date) => d.toISOString()
  it('listtid: klockslag idag, igår, veckodag, datum', () => {
    expect(formatListTime(at(new Date(2026, 9, 15, 9, 5)), now)).toMatch(/^09[:.]05$/)
    expect(formatListTime(at(new Date(2026, 9, 14, 23, 0)), now)).toBe('igår')
    expect(formatListTime(at(new Date(2026, 9, 12, 8, 0)), now)).toBe('mån')
    expect(formatListTime(at(new Date(2026, 8, 3, 8, 0)), now)).toBe('3 sep')
    expect(formatListTime(null, now)).toBe('')
    expect(formatListTime('inte ett datum', now)).toBe('')
  })
  it('dagsrubrik', () => {
    expect(formatDayLabel(at(new Date(2026, 9, 15, 1, 0)), now)).toBe('Idag')
    expect(formatDayLabel(at(new Date(2026, 9, 14, 20, 0)), now)).toBe('Igår')
    expect(formatDayLabel(at(new Date(2026, 8, 3, 8, 0)), now)).toBe('3 september')
    expect(formatDayLabel(at(new Date(2025, 8, 3, 8, 0)), now)).toBe('3 september 2025')
  })
})

describe('shouldShowAuthor', () => {
  const t = (min: number) => new Date(2026, 9, 1, 10, min).toISOString()
  it('visar för första meddelandet och när avsändaren byts', () => {
    expect(shouldShowAuthor(undefined, msg(1))).toBe(true)
    expect(shouldShowAuthor(msg(1), msg(2, { authorId: 'b' }))).toBe(true)
  })
  it('döljer för samma person inom fem minuter', () => {
    expect(shouldShowAuthor(msg(1, { createdAt: t(0) }), msg(2, { createdAt: t(4) }))).toBe(false)
    expect(shouldShowAuthor(msg(1, { createdAt: t(0) }), msg(2, { createdAt: t(6) }))).toBe(true)
  })
  it('visar alltid för borttagen användare (authorId null)', () => {
    expect(shouldShowAuthor(msg(1, { authorId: null }), msg(2, { authorId: null }))).toBe(true)
  })
  it('visar när dagen byts', () => {
    const next = new Date(2026, 9, 2, 0, 1).toISOString()
    expect(shouldShowAuthor(msg(1, { createdAt: new Date(2026, 9, 1, 23, 59).toISOString() }), msg(2, { createdAt: next }))).toBe(true)
  })
})

describe('isNearBottom', () => {
  it('räknar avståndet till botten', () => {
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 600, clientHeight: 400 })).toBe(true)
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 530, clientHeight: 400 })).toBe(true)
    expect(isNearBottom({ scrollHeight: 1000, scrollTop: 400, clientHeight: 400 })).toBe(false)
  })
})

describe('parseRetryAfter', () => {
  it('använder headern, annars svaret, annars 30', () => {
    expect(parseRetryAfter('12', 5)).toBe(12)
    expect(parseRetryAfter(null, 7)).toBe(7)
    expect(parseRetryAfter('abc')).toBe(30)
    expect(parseRetryAfter('0')).toBe(1)
    expect(parseRetryAfter('99999')).toBe(600)
  })
})

describe('describeSendFailure', () => {
  it('nätverksfel kan prövas igen', () => {
    const f = describeSendFailure(new ChatApiFailure('x', 0))
    expect(f.permanent).toBeUndefined()
    expect(f.message).toContain('nätverket')
  })
  it('429 visar väntetiden', () => {
    const f = describeSendFailure(new ChatApiFailure('x', 429, 'rate_limited', 20))
    expect(f.retryAfter).toBe(20)
    expect(f.message).toContain('20 sekunder')
  })
  it('arkiverad och nekad är permanenta', () => {
    expect(describeSendFailure(new ChatApiFailure('x', 403, 'archived')).message).toContain('arkiverad')
    expect(describeSendFailure(new ChatApiFailure('x', 403)).permanent).toBe(true)
  })
  it('okända fel ger allmän text', () => {
    expect(describeSendFailure(new Error('x')).message).toBe('Något gick fel. Försök igen.')
  })
})

describe('withLeader', () => {
  it('lägger till och tar bort utan dubbletter', () => {
    expect(withLeader(['a'], 'b', true)).toEqual(['a', 'b'])
    expect(withLeader(['a', 'b'], 'b', true)).toEqual(['a', 'b'])
    expect(withLeader(['a', 'b'], 'a', false)).toEqual(['b'])
  })
})

// Typkontroll: ChatItem går att använda där ChatMessage väntas
const _typed: ChatMessage = msg(1)
void _typed

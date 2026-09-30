import { describe, it, expect } from 'vitest'
import {
  splitMentions, pruneMentionIds, activeMentionQuery, filterParticipants, insertMention,
} from '@/lib/comments/mentions'
import { groupThread, visibleMessages, countLive } from '@/lib/comments/threadView'
import type { PassMessage } from '@/types'

const anna = { profileId: 'a', name: 'Anna Berg' }
const annaK = { profileId: 'k', name: 'Anna' }
const bo = { profileId: 'b', name: 'Bo Ek' }

describe('splitMentions', () => {
  it('markerar nämnda personer och lämnar resten som text', () => {
    expect(splitMentions('Hej @Anna Berg, kan du?', [anna])).toEqual([
      { kind: 'text', text: 'Hej ' },
      { kind: 'mention', text: '@Anna Berg', profileId: 'a' },
      { kind: 'text', text: ', kan du?' },
    ])
  })

  it('längsta namnet vinner', () => {
    const s = splitMentions('@Anna Berg och @Anna', [annaK, anna])
    expect(s.filter(x => x.kind === 'mention').map(x => (x as { profileId: string }).profileId)).toEqual(['a', 'k'])
  })

  it('markerar inte namn som inte är nämnda eller står mitt i ett ord', () => {
    expect(splitMentions('mail@Anna Berg', [anna])).toEqual([{ kind: 'text', text: 'mail@Anna Berg' }])
    expect(splitMentions('@Anna Bergström', [anna])).toEqual([{ kind: 'text', text: '@Anna Bergström' }])
    expect(splitMentions('Hej @Bo Ek', [])).toEqual([{ kind: 'text', text: 'Hej @Bo Ek' }])
  })

  it('HTML i texten blir vanlig text', () => {
    const s = splitMentions('<img src=x onerror=alert(1)> @Bo Ek', [bo])
    expect(s[0]).toEqual({ kind: 'text', text: '<img src=x onerror=alert(1)> ' })
  })

  it('tom text ger inga delar', () => {
    expect(splitMentions('', [anna])).toEqual([])
  })
})

describe('pruneMentionIds', () => {
  it('behåller bara personer som fortfarande står i texten', () => {
    expect(pruneMentionIds('Hej @Anna Berg', [anna, bo])).toEqual(['a'])
    expect(pruneMentionIds('Hej @Anna Be', [anna])).toEqual([])
    expect(pruneMentionIds('@Bo Ek @Bo Ek', [bo])).toEqual(['b'])
  })
})

describe('activeMentionQuery', () => {
  it('hittar påbörjat namn vid markören', () => {
    expect(activeMentionQuery('Hej @An', 7)).toEqual({ start: 4, query: 'An' })
    expect(activeMentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(activeMentionQuery('Hej @Anna B', 11)).toEqual({ start: 4, query: 'Anna B' })
  })

  it('ignorerar mailadresser, radbrytning och långt efter @', () => {
    expect(activeMentionQuery('a@b', 3)).toBeNull()
    expect(activeMentionQuery('@Anna\nhej', 9)).toBeNull()
    expect(activeMentionQuery('@ hej', 5)).toBeNull()
    expect(activeMentionQuery('ingen', 5)).toBeNull()
  })
})

describe('filterParticipants', () => {
  const list = [anna, bo, { profileId: 'c', name: 'Åsa Öberg' }]
  it('matchar början av namnet eller av ett ord', () => {
    expect(filterParticipants(list, 'bo').map(p => p.profileId)).toEqual(['b'])
    expect(filterParticipants(list, 'berg').map(p => p.profileId)).toEqual(['a'])
    expect(filterParticipants(list, 'öb').map(p => p.profileId)).toEqual(['c'])
    expect(filterParticipants(list, '')).toHaveLength(3)
  })
})

describe('insertMention', () => {
  it('ersätter det påbörjade namnet och flyttar markören', () => {
    expect(insertMention('Hej @An', 4, 7, 'Anna Berg')).toEqual({ text: 'Hej @Anna Berg ', caret: 15 })
    expect(insertMention('Hej @An tack', 4, 7, 'Anna Berg')).toEqual({ text: 'Hej @Anna Berg tack', caret: 15 })
  })
})

const msg = (over: Partial<PassMessage>): PassMessage => ({
  id: 1, passId: 1, parentId: null, authorId: 'a', authorName: 'Anna', body: 'x',
  createdAt: '2026-09-01T10:00:00Z', editedAt: null, deletedAt: null, authorIsStaff: false, mentions: [],
  ...over,
})

describe('groupThread', () => {
  it('lägger svar under sin kommentar i tidsordning', () => {
    const g = groupThread([
      msg({ id: 3, parentId: 1, createdAt: '2026-09-01T12:00:00Z' }),
      msg({ id: 2, createdAt: '2026-09-01T11:00:00Z' }),
      msg({ id: 1 }),
      msg({ id: 4, parentId: 1, createdAt: '2026-09-01T11:30:00Z' }),
    ])
    expect(g.map(x => x.comment.id)).toEqual([1, 2])
    expect(g[0].replies.map(r => r.id)).toEqual([4, 3])
  })

  it('döljer borttagen kommentar utan svar men visar den med svar', () => {
    const del = { deletedAt: '2026-09-02T00:00:00Z', body: '' }
    expect(visibleMessages([msg({ id: 1, ...del })])).toEqual([])
    const withReply = [msg({ id: 1, ...del }), msg({ id: 2, parentId: 1 })]
    expect(visibleMessages(withReply).map(m => m.id)).toEqual([1, 2])
    expect(countLive(withReply)).toBe(1)
    const replyAlsoDeleted = [msg({ id: 1, ...del }), msg({ id: 2, parentId: 1, ...del })]
    expect(visibleMessages(replyAlsoDeleted)).toEqual([])
  })
})

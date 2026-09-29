import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  commentRecipients, shouldEmail, commentPreview, validCommentBody,
  COMMENT_MAIL_INTERVAL_MS, type CommentRecipientInput,
} from '@/lib/comments/notify'
import { buildThread, type MessageRow } from '@/lib/comments/thread'
import { levelCoversChurch } from '@/lib/authz'
import { sendCommentNotice } from '@/lib/email'

const base = (over: Partial<CommentRecipientInput> = {}): CommentRecipientInput => ({
  authorId: 'author',
  responsibleIds: ['resp'],
  vkId: 'vk',
  threadAuthorIds: [],
  mentionedIds: [],
  parentAuthorId: null,
  bookedIds: ['booked1', 'booked2'],
  churchAdminIds: ['fadmin'],
  authorIsStaff: false,
  isReply: false,
  ...over,
})

const asMap = (list: { profileId: string; type: string }[]) =>
  Object.fromEntries(list.map(r => [r.profileId, r.type]))

describe('commentRecipients', () => {
  it('ny kommentar från ideell: ansvarig, vaktmästare och admin får notis, inte bokade', () => {
    expect(asMap(commentRecipients(base()))).toEqual({ resp: 'comment', vk: 'comment', fadmin: 'comment' })
  })

  it('bokade får notis när personal skriver en ny kommentar', () => {
    const r = asMap(commentRecipients(base({ authorId: 'resp', authorIsStaff: true })))
    expect(r.booked1).toBe('comment')
    expect(r.booked2).toBe('comment')
  })

  it('bokade får inte notis när personal svarar i en tråd', () => {
    const r = asMap(commentRecipients(base({
      authorId: 'resp', authorIsStaff: true, isReply: true, parentAuthorId: 'booked1',
    })))
    expect(r.booked1).toBe('comment_reply')
    expect(r.booked2).toBeUndefined()
  })

  it('vid svar får den som skrev kommentaren comment_reply och övriga i tråden comment', () => {
    const r = asMap(commentRecipients(base({
      isReply: true, parentAuthorId: 'p', threadAuthorIds: ['p', 'other'],
    })))
    expect(r.p).toBe('comment_reply')
    expect(r.other).toBe('comment')
  })

  it('nämning går före svar, som går före vanlig notis', () => {
    const r = asMap(commentRecipients(base({
      isReply: true, parentAuthorId: 'p', threadAuthorIds: ['p', 'resp'], mentionedIds: ['p', 'vk'],
    })))
    expect(r.p).toBe('comment_mention')
    expect(r.vk).toBe('comment_mention')
    expect(r.resp).toBe('comment')
  })

  it('svar går före vanlig notis även när personen är ansvarig', () => {
    const r = asMap(commentRecipients(base({ isReply: true, parentAuthorId: 'resp' })))
    expect(r.resp).toBe('comment_reply')
  })

  it('en person får högst en notis', () => {
    const list = commentRecipients(base({
      responsibleIds: ['x', 'x'], vkId: 'x', churchAdminIds: ['x'], mentionedIds: ['x', 'x'],
      isReply: true, parentAuthorId: 'x', threadAuthorIds: ['x'],
    }))
    expect(list.filter(r => r.profileId === 'x')).toEqual([{ profileId: 'x', type: 'comment_mention' }])
  })

  it('författaren får aldrig notis, inte ens om hen nämner sig själv eller svarar sig själv', () => {
    const list = commentRecipients(base({
      authorId: 'resp', authorIsStaff: true, mentionedIds: ['resp'],
      isReply: true, parentAuthorId: 'resp', threadAuthorIds: ['resp'],
    }))
    expect(list.map(r => r.profileId)).not.toContain('resp')
  })

  it('utan vaktmästare och ansvariga blir listan tom när ingen annan finns', () => {
    expect(commentRecipients(base({ responsibleIds: [], vkId: null, churchAdminIds: [] }))).toEqual([])
  })
})

describe('shouldEmail', () => {
  const now = new Date('2026-10-01T12:00:00Z')

  it('mail vid nämning och svar', () => {
    expect(shouldEmail({ type: 'comment_mention', kommentarMail: true, lastEmailedAt: null, now })).toBe(true)
    expect(shouldEmail({ type: 'comment_reply', kommentarMail: true, lastEmailedAt: null, now })).toBe(true)
  })

  it('aldrig mail för vanlig kommentarsnotis', () => {
    expect(shouldEmail({ type: 'comment', kommentarMail: true, lastEmailedAt: null, now })).toBe(false)
  })

  it('inget mail om personen stängt av kommentarsmail', () => {
    expect(shouldEmail({ type: 'comment_mention', kommentarMail: false, lastEmailedAt: null, now })).toBe(false)
  })

  it('högst ett mail per 30 minuter för samma pass', () => {
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString()
    expect(shouldEmail({ type: 'comment_reply', kommentarMail: true, lastEmailedAt: tenMinAgo, now })).toBe(false)
    const justUnder = new Date(now.getTime() - COMMENT_MAIL_INTERVAL_MS + 1000)
    expect(shouldEmail({ type: 'comment_reply', kommentarMail: true, lastEmailedAt: justUnder, now })).toBe(false)
  })

  it('mail igen efter 30 minuter', () => {
    const exactly = new Date(now.getTime() - COMMENT_MAIL_INTERVAL_MS).toISOString()
    expect(shouldEmail({ type: 'comment_mention', kommentarMail: true, lastEmailedAt: exactly, now })).toBe(true)
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    expect(shouldEmail({ type: 'comment_mention', kommentarMail: true, lastEmailedAt: hourAgo, now })).toBe(true)
  })
})

describe('commentPreview och validCommentBody', () => {
  it('förhandsvisningen är högst 80 tecken', () => {
    const p = commentPreview('a'.repeat(200))
    expect(p.length).toBe(80)
    expect(p.endsWith('…')).toBe(true)
    expect(commentPreview('  kort\n text ')).toBe('kort text')
  })

  it('text måste vara 1 till 2000 tecken efter trim', () => {
    expect(validCommentBody('   ')).toBeNull()
    expect(validCommentBody(123)).toBeNull()
    expect(validCommentBody('x'.repeat(2001))).toBeNull()
    expect(validCommentBody('x'.repeat(2000))).toHaveLength(2000)
    expect(validCommentBody('  hej  ')).toBe('hej')
  })
})

describe('buildThread', () => {
  const row = (over: Partial<MessageRow>): MessageRow => ({
    id: 1, pass_id: 9, parent_id: null, author_id: 'a', author_name: 'A', body: 'text',
    created_at: '2026-10-01T10:00:00+00:00', edited_at: null, deleted_at: null, ...over,
  })

  it('döljer borttagen kommentar utan svar men visar den om den har svar', () => {
    const rows = [
      row({ id: 1, body: '', deleted_at: '2026-10-01T11:00:00+00:00' }),
      row({ id: 2, parent_id: 1, created_at: '2026-10-01T10:05:00+00:00', author_id: 'b' }),
      row({ id: 3, body: '', deleted_at: '2026-10-01T11:00:00+00:00', created_at: '2026-10-01T10:10:00+00:00' }),
    ]
    const t = buildThread(rows, [], new Set(['b']), new Map())
    expect(t.map(m => m.id)).toEqual([1, 2])
    expect(t[0].body).toBe('')
    expect(t[1].authorIsStaff).toBe(true)
  })

  it('borttagen kommentar vars enda svar också är borttaget döljs helt', () => {
    const rows = [
      row({ id: 1, body: '', deleted_at: '2026-10-01T11:00:00+00:00' }),
      row({ id: 2, parent_id: 1, body: '', deleted_at: '2026-10-01T11:00:00+00:00' }),
    ]
    expect(buildThread(rows, [], new Set(), new Map())).toEqual([])
  })

  it('nämningar får namn', () => {
    const t = buildThread([row({})], [{ message_id: 1, profile_id: 'p' }], new Set(), new Map([['p', 'Pia']]))
    expect(t[0].mentions).toEqual([{ profileId: 'p', name: 'Pia' }])
  })
})

describe('levelCoversChurch', () => {
  const target = { churchId: 2, pastoratId: 10 }
  it('följer samma regler som can_admin_church_for', () => {
    expect(levelCoversChurch({ adminLevel: 'super', churchId: null, pastoratId: null }, target)).toBe(true)
    expect(levelCoversChurch({ adminLevel: 'pastorat', churchId: 1, pastoratId: 10 }, target)).toBe(true)
    expect(levelCoversChurch({ adminLevel: 'pastorat', churchId: 1, pastoratId: 11 }, target)).toBe(false)
    expect(levelCoversChurch({ adminLevel: 'pastorat', churchId: null, pastoratId: null }, { churchId: 2, pastoratId: null })).toBe(false)
    expect(levelCoversChurch({ adminLevel: 'forsamling', churchId: 2, pastoratId: 10 }, target)).toBe(true)
    expect(levelCoversChurch({ adminLevel: 'forsamling', churchId: 1, pastoratId: 10 }, target)).toBe(false)
    expect(levelCoversChurch({ adminLevel: 'none', churchId: 2, pastoratId: 10 }, target)).toBe(false)
  })
})

describe('sendCommentNotice', () => {
  const sent: { subject: string; htmlContent: string }[] = []
  beforeEach(() => {
    sent.length = 0
    vi.stubEnv('EMAIL_ALLOWLIST', '')
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      sent.push(JSON.parse(init.body))
      return new Response('{}', { status: 200 })
    }))
  })

  it('escapar namn och titel och innehåller ingen kommentarstext', async () => {
    const evil = '<a href="https://phish.example">x</a>'
    await sendCommentNotice({ to: 'a@test.invalid', name: evil, passTitle: evil, authorName: evil, kind: 'mention', url: 'https://test.kyrkouppdrag.se/dashboard?pass=1' })
    expect(sent[0].htmlContent).not.toContain('<a href="https://phish.example">')
    expect(sent[0].htmlContent).toContain('https://test.kyrkouppdrag.se/dashboard?pass=1')
  })
})

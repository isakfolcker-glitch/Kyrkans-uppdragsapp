// Regler för vem som får notis och mail när någon kommenterar ett pass.
// Rena funktioner utan databasanrop, så att reglerna kan testas.
// Se docs/plan-pass-kommentarer.md.

export type CommentNoticeType = 'comment_mention' | 'comment_reply' | 'comment'

export type CommentRecipient = { profileId: string; type: CommentNoticeType }

export type CommentRecipientInput = {
  /** Den som skrev kommentaren. Får aldrig notis. */
  authorId: string
  /** Ansvariga för passet. */
  responsibleIds: string[]
  /** Vaktmästaren för passet (passes.vk_profile_id). */
  vkId: string | null
  /** Andra som skrivit i samma tråd (kommentaren och dess svar). Används bara vid svar. */
  threadAuthorIds: string[]
  /** @nämnda personer. Ska redan vara filtrerade till personer med åtkomst. */
  mentionedIds: string[]
  /** Författaren till kommentaren som besvaras. null för en ny kommentar. */
  parentAuthorId: string | null
  /** Bokade på passet. */
  bookedIds: string[]
  /** Admin för passets församling (can_admin_church). */
  churchAdminIds: string[]
  /** Är författaren personal för passet (ansvarig, vaktmästare, admin eller anställd)? */
  authorIsStaff: boolean
  /** Är kommentaren ett svar? */
  isReply: boolean
}

const PRIORITY: Record<CommentNoticeType, number> = { comment_mention: 3, comment_reply: 2, comment: 1 }

/**
 * Vem som får notis och av vilken typ.
 * - @nämnda får comment_mention.
 * - Vid svar får den som skrev kommentaren comment_reply, övriga i tråden comment.
 * - Ansvariga, vaktmästare och admin för församlingen får comment (bara notis i appen).
 * - Bokade får comment bara när personal skriver en ny kommentar (inte svar).
 * En person får högst en notis, med högsta prioritet: comment_mention före
 * comment_reply före comment. Författaren får aldrig notis.
 */
export function commentRecipients(input: CommentRecipientInput): CommentRecipient[] {
  const result = new Map<string, CommentNoticeType>()
  const add = (id: string | null | undefined, type: CommentNoticeType) => {
    if (!id || id === input.authorId) return
    const current = result.get(id)
    if (!current || PRIORITY[type] > PRIORITY[current]) result.set(id, type)
  }

  for (const id of input.responsibleIds) add(id, 'comment')
  add(input.vkId, 'comment')
  for (const id of input.churchAdminIds) add(id, 'comment')

  if (input.isReply) {
    for (const id of input.threadAuthorIds) add(id, 'comment')
    add(input.parentAuthorId, 'comment_reply')
  } else if (input.authorIsStaff) {
    for (const id of input.bookedIds) add(id, 'comment')
  }

  for (const id of input.mentionedIds) add(id, 'comment_mention')

  return Array.from(result, ([profileId, type]) => ({ profileId, type }))
}

/** Minsta tid mellan två kommentarsmail till samma person om samma pass. */
export const COMMENT_MAIL_INTERVAL_MS = 30 * 60 * 1000

/**
 * Ska personen få mail om notisen?
 * Bara vid @nämning eller svar, bara om personen inte stängt av kommentarsmail,
 * och högst ett mail per person och pass per 30 minuter.
 */
export function shouldEmail(opts: {
  type: CommentNoticeType
  kommentarMail: boolean
  lastEmailedAt: string | Date | null
  now: Date
}): boolean {
  if (opts.type !== 'comment_mention' && opts.type !== 'comment_reply') return false
  if (!opts.kommentarMail) return false
  if (opts.lastEmailedAt) {
    const last = new Date(opts.lastEmailedAt).getTime()
    if (!Number.isNaN(last) && opts.now.getTime() - last < COMMENT_MAIL_INTERVAL_MS) return false
  }
  return true
}

/** Förhandsvisning av kommentaren i notisen, högst 80 tecken. */
export function commentPreview(body: string, max = 80): string {
  const text = body.replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}

/** Validerar kommentarstext. Returnerar trimmad text eller null om den är ogiltig. */
export function validCommentBody(body: unknown): string | null {
  if (typeof body !== 'string') return null
  const text = body.trim()
  if (text.length < 1 || text.length > 2000) return null
  return text
}

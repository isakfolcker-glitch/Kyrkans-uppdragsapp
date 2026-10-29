// Hämtar och formar chattdata för API:t.
// Meddelanden läses med användarens egen klient (RLS gäller). Namn och
// avatarfärger hämtas med service role, eftersom ideella inte får läsa andras
// profiler. Anropas bara efter att behörigheten har kontrollerats (lib/chat/authz.ts).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChatMessage, MessagePage } from './types'
import type { PageQuery } from './validate'

export const MESSAGE_COLUMNS = 'id, group_id, author_id, body, reply_to_id, client_id, created_at, edited_at, deleted_at, pinned_at'

export const DELETED_USER_NAME = 'Borttagen användare'
export const PREVIEW_LENGTH = 200

export type MessageRow = {
  id: number
  group_id: string
  author_id: string | null
  body: string
  reply_to_id: number | null
  client_id: string
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  pinned_at: string | null
}

export type AuthorInfo = {
  name: string
  ini: string | null
  avColor: string | null
  acColor: string | null
  isLeader: boolean
}

/** Initialer när profilen saknar sparade: första bokstäverna i de två första orden. */
export function initialsOf(name: string, ini?: string | null): string {
  if (ini && ini.trim()) return ini.trim()
  return name.trim().split(/\s+/).map(w => Array.from(w)[0] ?? '').join('').slice(0, 2).toUpperCase()
}

/** Kort förhandsvisning för översikten. Tom för borttagna meddelanden. */
export function previewOf(body: string): string {
  const chars = Array.from(body.replace(/\s+/g, ' ').trim())
  return chars.length > PREVIEW_LENGTH ? chars.slice(0, PREVIEW_LENGTH - 1).join('') + '…' : chars.join('')
}

/** Rad från databasen till API-form. Rena funktionen, så att den kan enhetstestas. */
export function toChatMessage(row: MessageRow, authors: Map<string, AuthorInfo>): ChatMessage {
  const author = row.author_id ? authors.get(row.author_id) : undefined
  const name = author?.name ?? DELETED_USER_NAME
  return {
    id: Number(row.id),
    groupId: row.group_id,
    authorId: row.author_id,
    authorName: name,
    authorIni: initialsOf(name, author?.ini),
    authorAvColor: author?.avColor ?? null,
    authorAcColor: author?.acColor ?? null,
    authorIsLeader: author?.isLeader ?? false,
    // En borttagen rad har redan tom text; här en extra spärr om något skulle läcka.
    body: row.deleted_at ? '' : row.body,
    replyToId: row.reply_to_id == null ? null : Number(row.reply_to_id),
    clientId: row.client_id,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    pinnedAt: row.pinned_at,
  }
}

/** Namn, avatar och gruppansvar för givna författare i en grupp. Bara de fält profilen redan visar. */
export async function loadAuthors(admin: SupabaseClient, groupId: string, authorIds: string[]): Promise<Map<string, AuthorInfo>> {
  const ids = Array.from(new Set(authorIds))
  const result = new Map<string, AuthorInfo>()
  if (!ids.length) return result
  const [{ data: profiles }, { data: leaders }] = await Promise.all([
    admin.from('profiles').select('id, name, ini, av_color, ac_color').in('id', ids),
    admin.from('profile_groups').select('profile_id').eq('group_id', groupId).eq('is_leader', true).in('profile_id', ids),
  ])
  const leaderIds = new Set((leaders ?? []).map(l => l.profile_id as string))
  for (const p of profiles ?? []) {
    result.set(p.id as string, {
      name: p.name as string,
      ini: (p.ini as string | null) ?? null,
      avColor: (p.av_color as string | null) ?? null,
      acColor: (p.ac_color as string | null) ?? null,
      isLeader: leaderIds.has(p.id as string),
    })
  }
  return result
}

/** Rader till API-form, med författare. */
export async function withAuthors(admin: SupabaseClient, groupId: string, rows: MessageRow[]): Promise<ChatMessage[]> {
  const authors = await loadAuthors(admin, groupId, rows.map(r => r.author_id).filter((x): x is string => !!x))
  return rows.map(r => toChatMessage(r, authors))
}

/**
 * Ren sidindelning. rows är det som hämtades med limit + 1:
 * - before (eller utan): senaste först (id fallande), vänds till stigande.
 * - after: äldst först (id stigande).
 */
export function buildPage(rows: MessageRow[], mode: 'before' | 'after', limit: number): { rows: MessageRow[]; hasMore: boolean; nextCursor: number | null } {
  const hasMore = rows.length > limit
  const kept = rows.slice(0, limit)
  const ascending = mode === 'before' ? [...kept].reverse() : kept
  const edge = mode === 'before' ? ascending[0] : ascending[ascending.length - 1]
  return { rows: ascending, hasMore, nextCursor: hasMore && edge ? Number(edge.id) : null }
}

/** En sida meddelanden. null vid databasfel. Behörigheten ska redan vara kontrollerad. */
export async function loadPage(supabase: SupabaseClient, admin: SupabaseClient, groupId: string, q: Extract<PageQuery, { ok: true }>): Promise<MessagePage | null> {
  const mode = q.after !== null ? 'after' : 'before'
  let query = supabase.from('chat_messages').select(MESSAGE_COLUMNS).eq('group_id', groupId)
  if (mode === 'after') {
    query = query.gt('id', q.after as number).order('id', { ascending: true })
  } else {
    if (q.before !== null) query = query.lt('id', q.before)
    query = query.order('id', { ascending: false })
  }
  const { data, error } = await query.limit(q.limit + 1)
  if (error) return null
  const page = buildPage((data ?? []) as MessageRow[], mode, q.limit)
  return { messages: await withAuthors(admin, groupId, page.rows), hasMore: page.hasMore, nextCursor: page.nextCursor }
}

/** Ett meddelande i chatten (även borttaget), läst med användarens klient. null om det inte syns. */
export async function loadRow(supabase: SupabaseClient, groupId: string, id: number): Promise<MessageRow | null> {
  const { data } = await supabase.from('chat_messages').select(MESSAGE_COLUMNS).eq('id', id).eq('group_id', groupId).maybeSingle()
  return (data as MessageRow | null) ?? null
}

/** Personens eget meddelande med givet clientId (för återförsök). Service role: kontrollerat av anroparen. */
export async function findByClientId(admin: SupabaseClient, userId: string, clientId: string): Promise<MessageRow | null> {
  const { data } = await admin.from('chat_messages').select(MESSAGE_COLUMNS).eq('author_id', userId).eq('client_id', clientId).maybeSingle()
  return (data as MessageRow | null) ?? null
}

export type ExistingOutcome = 'new' | 'duplicate' | 'conflict'

/**
 * Idempotens: finns clientId redan hos personen och i samma chatt är det ett
 * återförsök (returnera det sparade meddelandet). Finns det i en annan chatt är
 * det en krock (klienten har återanvänt ett id).
 */
export function resolveExisting(existing: Pick<MessageRow, 'group_id'> | null, groupId: string): ExistingOutcome {
  if (!existing) return 'new'
  return existing.group_id === groupId ? 'duplicate' : 'conflict'
}

/** Vad ett insättningsfel betyder. 23505 = unik (clientId redan sparat), 23503 = svar på okänt meddelande. */
export function classifyInsertError(code: string | undefined): 'duplicate' | 'bad_reply' | 'error' {
  if (code === '23505') return 'duplicate'
  if (code === '23503') return 'bad_reply'
  return 'error'
}

export const chatError = (status: number, error: string, extra: Record<string, unknown> = {}, headers?: HeadersInit) =>
  Response.json({ error, ...extra }, { status, headers })

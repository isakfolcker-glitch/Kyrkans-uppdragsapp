// Bygger API-svaret för ett pass kommentarer från databasrader.
// Rena funktioner utan databasanrop.
import type { PassMessage } from '@/types'

export type MessageRow = {
  id: number
  pass_id: number
  parent_id: number | null
  author_id: string | null
  author_name: string
  body: string
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  is_staff_reply?: boolean | null
}

export type MentionRow = { message_id: number; profile_id: string }

export const MESSAGE_COLUMNS =
  'id, pass_id, parent_id, author_id, author_name, body, created_at, edited_at, deleted_at, is_staff_reply'

export function toPassMessage(
  row: MessageRow,
  mentions: MentionRow[],
  staffIds: Set<string>,
  names: Map<string, string>,
): PassMessage {
  const deleted = row.deleted_at != null
  return {
    id: row.id,
    passId: row.pass_id,
    parentId: row.parent_id ?? null,
    authorId: row.author_id,
    authorName: row.author_name,
    body: deleted ? '' : row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    deletedAt: row.deleted_at ?? null,
    authorIsStaff: !!row.author_id && staffIds.has(row.author_id),
    mentions: deleted
      ? []
      : mentions
          .filter(m => m.message_id === row.id)
          .map(m => ({ profileId: m.profile_id, name: names.get(m.profile_id) ?? 'Okänd' })),
  }
}

/**
 * Hela tråden sorterad efter created_at. Borttagna kommentarer visas bara om
 * de har minst ett svar som inte är borttaget (då som "Kommentaren är borttagen").
 */
export function buildThread(
  rows: MessageRow[],
  mentions: MentionRow[],
  staffIds: Set<string>,
  names: Map<string, string>,
): PassMessage[] {
  const liveReplyParents = new Set(
    rows.filter(r => r.parent_id != null && r.deleted_at == null).map(r => r.parent_id as number),
  )
  return rows
    .filter(r => r.deleted_at == null || liveReplyParents.has(r.id))
    .sort((a, b) => (Date.parse(a.created_at) - Date.parse(b.created_at)) || a.id - b.id)
    .map(r => toPassMessage(r, mentions, staffIds, names))
}

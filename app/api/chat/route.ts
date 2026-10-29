import { createAdminClient } from '@/lib/supabase/admin'
import { unauthorized } from '@/lib/authz'
import { getChatCaller } from '@/lib/chat/authz'
import { chatError, previewOf, DELETED_USER_NAME, type MessageRow } from '@/lib/chat/server'
import type { ChatOverview, ChatSummary } from '@/lib/chat/types'

type UnreadRow = { group_id: string; unread_count: number | string; last_message_id: number | null; last_message_at: string | null }
type ChurchJoin = { name: string } | { name: string }[] | null

/**
 * Översikt: den inloggades chattar med gruppnamn, senaste meddelande, olästa
 * och senaste aktivitet. Vilka chattar som ingår avgörs av databasen
 * (chat_unread_counts), som bara returnerar grupper där personen är medlem.
 */
export async function GET() {
  const { userId, supabase } = await getChatCaller()
  if (!userId) return unauthorized()

  const { data: counts, error } = await supabase.rpc('chat_unread_counts')
  if (error) return chatError(500, 'Kunde inte hämta chattar')
  const rows = (counts ?? []) as UnreadRow[]
  if (!rows.length) return Response.json({ chats: [] } satisfies ChatOverview)

  const groupIds = rows.map(r => r.group_id)
  const lastIds = rows.map(r => r.last_message_id).filter((x): x is number => x != null)

  const [groups, chats, mine, lastMessages] = await Promise.all([
    supabase.from('groups').select('id, label, cls, church_id, churches(name)').in('id', groupIds),
    supabase.from('group_chats').select('group_id, archived_at').in('group_id', groupIds),
    supabase.from('profile_groups').select('group_id, is_leader').eq('profile_id', userId).in('group_id', groupIds),
    lastIds.length
      ? supabase.from('chat_messages').select('id, author_id, body, created_at, deleted_at').in('id', lastIds)
      : Promise.resolve({ data: [] as Pick<MessageRow, 'id' | 'author_id' | 'body' | 'created_at' | 'deleted_at'>[], error: null }),
  ])
  if (groups.error || chats.error || mine.error || lastMessages.error) return chatError(500, 'Kunde inte hämta chattar')

  // Avsändarnamn: ideella får inte läsa andras profiler, därför service role (bara namn).
  const lastRows = (lastMessages.data ?? []) as Pick<MessageRow, 'id' | 'author_id' | 'body' | 'created_at' | 'deleted_at'>[]
  const authorIds = Array.from(new Set(lastRows.map(m => m.author_id).filter((x): x is string => !!x)))
  const names = new Map<string, string>()
  if (authorIds.length) {
    const { data: profiles } = await createAdminClient().from('profiles').select('id, name').in('id', authorIds)
    for (const p of profiles ?? []) names.set(p.id as string, p.name as string)
  }

  const groupById = new Map((groups.data ?? []).map(g => [g.id as string, g]))
  const archived = new Map((chats.data ?? []).map(c => [c.group_id as string, c.archived_at != null]))
  const leader = new Map((mine.data ?? []).map(m => [m.group_id as string, m.is_leader === true]))
  const lastById = new Map(lastRows.map(m => [Number(m.id), m]))

  const summaries: ChatSummary[] = rows.flatMap(r => {
    const g = groupById.get(r.group_id)
    if (!g) return []
    const church = g.churches as ChurchJoin
    const last = r.last_message_id != null ? lastById.get(Number(r.last_message_id)) : undefined
    return [{
      groupId: r.group_id,
      label: g.label as string,
      cls: g.cls as string,
      churchId: g.church_id == null ? null : Number(g.church_id),
      churchName: (Array.isArray(church) ? church[0]?.name : church?.name) ?? null,
      isLeader: leader.get(r.group_id) ?? false,
      archived: archived.get(r.group_id) ?? false,
      unreadCount: Number(r.unread_count),
      lastMessage: last ? {
        id: Number(last.id),
        authorId: last.author_id,
        authorName: (last.author_id && names.get(last.author_id)) || DELETED_USER_NAME,
        preview: last.deleted_at ? '' : previewOf(last.body),
        deleted: last.deleted_at != null,
        createdAt: last.created_at,
      } : null,
      lastActivityAt: r.last_message_at,
    }]
  })

  // Senaste aktivitet först, tomma chattar sist i namnordning
  summaries.sort((a, b) => {
    if (a.lastActivityAt && b.lastActivityAt) return b.lastActivityAt.localeCompare(a.lastActivityAt)
    if (a.lastActivityAt) return -1
    if (b.lastActivityAt) return 1
    return a.label.localeCompare(b.label, 'sv')
  })

  return Response.json({ chats: summaries } satisfies ChatOverview)
}

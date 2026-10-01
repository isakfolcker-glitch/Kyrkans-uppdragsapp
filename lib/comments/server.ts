// Hämtar ett pass kommentarer för API:t. Kommentarerna och nämningarna läses
// med användarens egen klient (RLS gäller). Namn och personalmärke hämtas med
// service role, eftersom ideella inte får läsa andras profiler. Anropas bara
// efter att canAccessPassThread har godkänt anroparen.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PassThreadAudience } from '@/lib/authz'
import type { PassMessage } from '@/types'
import { buildThread, toPassMessage, MESSAGE_COLUMNS, type MessageRow, type MentionRow } from './thread'

/** Personalmärke och namn för givna personer: ansvarig, vaktmästare, admin för passet eller anställd. */
async function staffAndNames(audience: PassThreadAudience, ids: string[]) {
  const staffIds = new Set<string>()
  const names = new Map<string, string>()
  const missing: string[] = []
  for (const id of new Set(ids)) {
    const m = audience.members.get(id)
    if (m) {
      names.set(id, m.name)
      if (m.isStaff) staffIds.add(id)
    } else {
      missing.push(id)
    }
  }
  // Personer som skrivit tidigare men inte längre har åtkomst (t.ex. avbokade)
  if (missing.length) {
    const { data } = await createAdminClient().from('profiles').select('id, name, is_employee').in('id', missing)
    for (const p of data ?? []) {
      names.set(p.id, p.name)
      if (p.is_employee === true) staffIds.add(p.id)
    }
  }
  return { staffIds, names }
}

async function withDetails(supabase: SupabaseClient, audience: PassThreadAudience, rows: MessageRow[]) {
  const ids = rows.map(r => r.id)
  let mentions: MentionRow[] = []
  if (ids.length) {
    const { data } = await supabase.from('pass_message_mentions').select('message_id, profile_id').in('message_id', ids)
    mentions = (data ?? []) as MentionRow[]
  }
  const people = [
    ...rows.map(r => r.author_id).filter((x): x is string => !!x),
    ...mentions.map(m => m.profile_id),
  ]
  const { staffIds, names } = await staffAndNames(audience, people)
  return { mentions, staffIds, names }
}

/** Hela tråden för passet, i API-form. null vid databasfel. */
export async function loadThread(supabase: SupabaseClient, audience: PassThreadAudience): Promise<PassMessage[] | null> {
  const { data, error } = await supabase
    .from('pass_messages')
    .select(MESSAGE_COLUMNS)
    .eq('pass_id', audience.passId)
    .order('created_at', { ascending: true })
  if (error) return null
  const rows = (data ?? []) as MessageRow[]
  const { mentions, staffIds, names } = await withDetails(supabase, audience, rows)
  return buildThread(rows, mentions, staffIds, names)
}

/** En enskild kommentar i API-form (även om den är borttagen). null om den inte syns. */
export async function loadOne(supabase: SupabaseClient, audience: PassThreadAudience, messageId: number): Promise<PassMessage | null> {
  const { data } = await supabase
    .from('pass_messages')
    .select(MESSAGE_COLUMNS)
    .eq('id', messageId)
    .eq('pass_id', audience.passId)
    .maybeSingle()
  if (!data) return null
  const row = data as MessageRow
  const { mentions, staffIds, names } = await withDetails(supabase, audience, [row])
  return toPassMessage(row, mentions, staffIds, names)
}

/** Tolkar id från URL:en. null om det inte är ett positivt heltal. */
export function parseId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** Översätter databasfel till HTTP-status: behörighet 403, regelbrott 400, annat 500. */
export function dbErrorStatus(code: string | undefined): number {
  if (code === '42501') return 403
  if (code === '23514' || code === '23503' || code === '22001') return 400
  return 500
}

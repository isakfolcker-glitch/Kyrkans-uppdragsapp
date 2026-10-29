import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { unauthorized, forbidden } from '@/lib/authz'
import { getChatCaller, isChatMember } from '@/lib/chat/authz'
import { chatError } from '@/lib/chat/server'
import { isValidGroupId, parsePositiveInt } from '@/lib/chat/validate'
import type { MarkReadResult } from '@/lib/chat/types'

type Ctx = { params: Promise<{ groupId: string }> }

/** Markerar chatten som läst till och med lastReadId. Går aldrig bakåt och aldrig förbi chattens senaste meddelande. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params
  const { userId, supabase } = await getChatCaller()
  if (!userId) return unauthorized()

  // Även arkiverade chattar kan markeras som lästa.
  if (!isValidGroupId(groupId) || !(await isChatMember(supabase, groupId))) return forbidden('Du är inte med i den här chatten')

  let json: unknown
  try { json = await req.json() } catch { return chatError(400, 'Ogiltig begäran') }
  const requested = parsePositiveInt((json as { lastReadId?: unknown } | null)?.lastReadId)
  if (requested === null) return chatError(400, 'lastReadId måste vara ett positivt heltal')

  // Skrivningen sker med service role efter kontrollen ovan.
  const admin = createAdminClient()
  const [{ data: chat }, { data: current }] = await Promise.all([
    admin.from('group_chats').select('last_message_id').eq('group_id', groupId).maybeSingle(),
    admin.from('chat_reads').select('last_read_message_id').eq('profile_id', userId).eq('group_id', groupId).maybeSingle(),
  ])
  const last = chat?.last_message_id == null ? 0 : Number(chat.last_message_id)
  const previous = current?.last_read_message_id == null ? 0 : Number(current.last_read_message_id)
  const value = Math.max(Math.min(requested, last), previous)
  if (value === 0 || value === previous) return Response.json({ lastReadId: previous } satisfies MarkReadResult)

  const { error } = await admin.from('chat_reads').upsert({
    profile_id: userId,
    group_id: groupId,
    last_read_message_id: value,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,group_id' })
  if (error) return chatError(500, 'Kunde inte spara läsmarkeringen')
  return Response.json({ lastReadId: value } satisfies MarkReadResult)
}

import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { unauthorized, forbidden } from '@/lib/authz'
import { getChatCaller, chatAccess } from '@/lib/chat/authz'
import { chatError, loadRow, withAuthors, MESSAGE_COLUMNS, type MessageRow } from '@/lib/chat/server'
import { isValidGroupId, parsePositiveInt, validateBody } from '@/lib/chat/validate'

type Ctx = { params: Promise<{ groupId: string; id: string }> }

/**
 * Gemensam kontroll för PATCH och DELETE: inloggad, medlem i en chatt som inte
 * är arkiverad, och meddelandet är författarens eget. Ingen admin kan ändra
 * eller ta bort andras meddelanden (moderering kommer i en senare PR).
 */
type Authorized =
  | { response: Response }
  | { response?: undefined; groupId: string; userId: string; id: number; row: MessageRow }

async function authorize(params: Ctx['params']): Promise<Authorized> {
  const { groupId, id: rawId } = await params
  const { userId, supabase } = await getChatCaller()
  if (!userId) return { response: unauthorized() }

  if (!isValidGroupId(groupId)) return { response: forbidden('Du är inte med i den här chatten') }
  const access = await chatAccess(supabase, groupId)
  if (access === 'none') return { response: forbidden('Du är inte med i den här chatten') }
  if (access === 'read_only') return { response: chatError(403, 'Chatten är arkiverad', { code: 'archived' }) }

  const id = parsePositiveInt(rawId)
  if (id === null) return { response: chatError(404, 'Meddelandet finns inte') }
  const row = await loadRow(supabase, groupId, id)
  if (!row) return { response: chatError(404, 'Meddelandet finns inte') }
  if (row.author_id !== userId) return { response: forbidden('Du kan bara ändra dina egna meddelanden') }
  return { groupId, userId, id, row }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await authorize(params)
  if (auth.response) return auth.response
  const { groupId, userId, id, row } = auth

  let json: unknown
  try { json = await req.json() } catch { return chatError(400, 'Ogiltig begäran') }
  const parsed = validateBody((json as { body?: unknown } | null)?.body)
  if (!parsed.ok) return chatError(400, parsed.error)

  if (row.deleted_at) return chatError(409, 'Meddelandet är borttaget')
  const admin = createAdminClient()
  // Oförändrad text ändrar inget och ger inget redigeringsmärke.
  if (parsed.body === row.body) {
    const [message] = await withAuthors(admin, groupId, [row])
    return Response.json({ message })
  }

  // Databasen sätter edited_at och låser alla andra fält (trigger).
  const { data, error } = await admin.from('chat_messages')
    .update({ body: parsed.body })
    .eq('id', id).eq('group_id', groupId).eq('author_id', userId).is('deleted_at', null)
    .select(MESSAGE_COLUMNS).maybeSingle()
  if (error) return chatError(500, 'Kunde inte spara ändringen')
  if (!data) return chatError(409, 'Meddelandet är borttaget')

  const [message] = await withAuthors(admin, groupId, [data as MessageRow])
  return Response.json({ message })
}

/** Mjuk radering: texten töms och deleted_at sätts. Raden finns kvar så att svar och historik hänger ihop. */
export async function DELETE(_: NextRequest, { params }: Ctx) {
  const auth = await authorize(params)
  if (auth.response) return auth.response
  const { groupId, userId, id, row } = auth

  const admin = createAdminClient()
  if (row.deleted_at) {
    const [message] = await withAuthors(admin, groupId, [row])
    return Response.json({ message })
  }

  const { data, error } = await admin.from('chat_messages')
    .update({ body: '', deleted_at: new Date().toISOString(), deleted_by: userId })
    .eq('id', id).eq('group_id', groupId).eq('author_id', userId).is('deleted_at', null)
    .select(MESSAGE_COLUMNS).maybeSingle()
  if (error) return chatError(500, 'Kunde inte ta bort meddelandet')
  // Någon hann före (t.ex. dubbelklick): visa det som finns
  const current = (data as MessageRow | null) ?? await loadRow(admin, groupId, id)
  const [message] = await withAuthors(admin, groupId, [current as MessageRow])
  return Response.json({ message })
}

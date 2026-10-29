import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { unauthorized, forbidden } from '@/lib/authz'
import { getChatCaller, chatAccess } from '@/lib/chat/authz'
import { checkRateLimit } from '@/lib/chat/ratelimit'
import {
  chatError, classifyInsertError, findByClientId, loadPage, resolveExisting, withAuthors, MESSAGE_COLUMNS, type MessageRow,
} from '@/lib/chat/server'
import { isValidGroupId, parsePageQuery, validateSendInput } from '@/lib/chat/validate'
import type { MessagePage, SendMessageResult } from '@/lib/chat/types'

type Ctx = { params: Promise<{ groupId: string }> }

/** Meddelanden, aldrig hela historiken: ?before=<id>&limit=50 (äldre) eller ?after=<id> (nyare). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params
  const { userId, supabase } = await getChatCaller()
  if (!userId) return unauthorized()

  // Samma funktion som RLS använder. Även arkiverade chattar går att läsa.
  if (!isValidGroupId(groupId) || (await chatAccess(supabase, groupId)) === 'none') return forbidden('Du är inte med i den här chatten')

  const q = parsePageQuery(req.nextUrl.searchParams)
  if (!q.ok) return chatError(400, q.error)

  const page = await loadPage(supabase, createAdminClient(), groupId, q)
  if (!page) return chatError(500, 'Kunde inte hämta meddelanden')
  return Response.json(page satisfies MessagePage)
}

/** Skickar ett meddelande. Idempotent på clientId: ett återförsök ger 200 med det sparade meddelandet. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const { groupId } = await params
  const { userId, supabase } = await getChatCaller()
  if (!userId) return unauthorized()

  if (!isValidGroupId(groupId)) return forbidden('Du är inte med i den här chatten')
  const access = await chatAccess(supabase, groupId)
  if (access === 'none') return forbidden('Du är inte med i den här chatten')
  if (access === 'read_only') return chatError(403, 'Chatten är arkiverad', { code: 'archived' })

  let json: unknown
  try { json = await req.json() } catch { return chatError(400, 'Ogiltig begäran') }
  const parsed = validateSendInput(json)
  if (!parsed.ok) return chatError(400, parsed.error)
  const { body, clientId, replyToId } = parsed.input

  // Skrivningen sker med service role efter kontrollerna ovan; klienten har inga skrivrättigheter.
  const admin = createAdminClient()

  // Återförsök först, så att ett nätverksfel aldrig stoppas av spamskyddet.
  const existing = await findByClientId(admin, userId, clientId)
  const outcome = resolveExisting(existing, groupId)
  if (outcome === 'conflict') return chatError(409, 'clientId används redan i en annan chatt', { code: 'client_id_conflict' })
  if (outcome === 'duplicate') {
    const [message] = await withAuthors(admin, groupId, [existing as MessageRow])
    return Response.json({ message, duplicate: true } satisfies SendMessageResult, { status: 200 })
  }

  const limit = await checkRateLimit(admin, userId)
  if (!limit.allowed) {
    return chatError(429, 'Du skickar för många meddelanden. Vänta en stund.',
      { code: 'rate_limited', retryAfter: limit.retryAfterSeconds },
      { 'Retry-After': String(limit.retryAfterSeconds) })
  }

  const { data, error } = await admin
    .from('chat_messages')
    .insert({ group_id: groupId, author_id: userId, body, client_id: clientId, reply_to_id: replyToId })
    .select(MESSAGE_COLUMNS)
    .single()

  if (error || !data) {
    const kind = classifyInsertError(error?.code)
    if (kind === 'duplicate') {
      // Två förfrågningar med samma clientId samtidigt: den andra får det sparade meddelandet.
      const again = await findByClientId(admin, userId, clientId)
      if (again && again.group_id === groupId) {
        const [message] = await withAuthors(admin, groupId, [again])
        return Response.json({ message, duplicate: true } satisfies SendMessageResult, { status: 200 })
      }
      return chatError(409, 'clientId används redan', { code: 'client_id_conflict' })
    }
    if (kind === 'bad_reply') return chatError(400, 'Meddelandet du svarar på finns inte i den här chatten')
    return chatError(500, 'Kunde inte skicka meddelandet')
  }

  const [message] = await withAuthors(admin, groupId, [data as MessageRow])
  return Response.json({ message, duplicate: false } satisfies SendMessageResult, { status: 201 })
}

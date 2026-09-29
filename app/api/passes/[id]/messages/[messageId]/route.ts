// Redigera eller ta bort en kommentar på ett pass.
// Körs med användarens egen klient så att RLS och triggern i migration 018 gäller:
// författaren får ändra texten och ta bort, admin för passet får bara ta bort.
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAccessPassThread, canAdminPass, loadPassThreadAudience, unauthorized, forbidden } from '@/lib/authz'
import { validCommentBody, commentPreview } from '@/lib/comments/notify'
import { loadOne, parseId, dbErrorStatus } from '@/lib/comments/server'

type Ctx = { params: Promise<{ id: string; messageId: string }> }

async function setup(ctx: Ctx) {
  const { caller, supabase } = await getCaller()
  if (!caller) return { res: unauthorized() }
  const { id, messageId } = await ctx.params
  const passId = parseId(id)
  const msgId = parseId(messageId)
  if (!passId || !msgId) return { res: NextResponse.json({ error: 'Ogiltig kommentar' }, { status: 400 }) }
  if (!(await canAccessPassThread(caller, passId, supabase))) return { res: forbidden() }

  const { data: msg } = await supabase
    .from('pass_messages')
    .select('id, pass_id, author_id, deleted_at')
    .eq('id', msgId)
    .eq('pass_id', passId)
    .maybeSingle()
  if (!msg) return { res: NextResponse.json({ error: 'Kommentaren finns inte' }, { status: 404 }) }
  return { caller, supabase, passId, msgId, msg }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const s = await setup(ctx)
  if ('res' in s) return s.res
  const { caller, supabase, passId, msgId, msg } = s

  if (msg.author_id !== caller.id) return forbidden('Du kan bara redigera dina egna kommentarer.')
  if (msg.deleted_at != null) return NextResponse.json({ error: 'Kommentaren är borttagen.' }, { status: 409 })

  const input = await req.json().catch(() => null) as { body?: unknown } | null
  const text = validCommentBody(input?.body)
  if (!text) return NextResponse.json({ error: 'Kommentaren måste vara 1 till 2000 tecken.' }, { status: 400 })

  // edited_at sätts av databasen när texten ändras
  const { error } = await supabase.from('pass_messages').update({ body: text }).eq('id', msgId)
  if (error) return NextResponse.json({ error: 'Kunde inte spara ändringen.' }, { status: dbErrorStatus(error.code) })

  // Notiser som redan gått ut ska inte visa den gamla texten
  await createAdminClient().from('notifications')
    .update({ body: `${caller.name}: ${commentPreview(text)}` })
    .eq('comment_id', msgId)

  const audience = await loadPassThreadAudience(passId)
  const message = audience && await loadOne(supabase, audience, msgId)
  if (!message) return NextResponse.json({ error: 'Kunde inte hämta kommentaren.' }, { status: 500 })
  return NextResponse.json(message)
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const s = await setup(ctx)
  if ('res' in s) return s.res
  const { caller, supabase, passId, msgId, msg } = s

  if (msg.author_id !== caller.id && !(await canAdminPass(caller, passId))) {
    return forbidden('Du kan bara ta bort dina egna kommentarer.')
  }
  if (msg.deleted_at != null) return NextResponse.json({ error: 'Kommentaren är redan borttagen.' }, { status: 409 })

  // Mjuk borttagning: databasen tömmer texten och sätter tiden
  const { data: updated, error } = await supabase
    .from('pass_messages')
    .update({ deleted_at: new Date().toISOString(), body: '' })
    .eq('id', msgId)
    .select('id')
  if (error) return NextResponse.json({ error: 'Kunde inte ta bort kommentaren.' }, { status: dbErrorStatus(error.code) })
  if (!updated?.length) return forbidden()

  // Notiser om kommentaren innehåller en förhandsvisning av texten, så de tas bort också,
  // liksom nämningarna. Behörigheten är kontrollerad ovan och av databasen.
  const admin = createAdminClient()
  await Promise.all([
    admin.from('notifications').delete().eq('comment_id', msgId),
    admin.from('pass_message_mentions').delete().eq('message_id', msgId),
  ])

  const audience = await loadPassThreadAudience(passId)
  const message = audience && await loadOne(supabase, audience, msgId)
  if (!message) return NextResponse.json({ error: 'Kunde inte hämta kommentaren.' }, { status: 500 })
  return NextResponse.json(message)
}

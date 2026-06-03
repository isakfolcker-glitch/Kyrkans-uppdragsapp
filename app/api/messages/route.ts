import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBulkMessage } from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: sender } = await supabase.from('profiles').select('name, admin_level').eq('id', user.id).single()
  if (!['forsamling','pastorat','super'].includes(sender?.admin_level ?? '')) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const body_json = await req.json()
  const { to, to_label, subject, body } = body_json

  if (!to?.length)      return NextResponse.json({ error: 'Inga mottagare' }, { status: 400 })
  if (!subject?.trim()) return NextResponse.json({ error: 'Ämne saknas' }, { status: 400 })
  if (!body?.trim())    return NextResponse.json({ error: 'Meddelande saknas' }, { status: 400 })

  // Skicka mail via Resend
  await sendBulkMessage({ to, subject, body, fromName: sender?.name ?? 'Admin' })

  // Logga utskicket
  await supabase.from('message_logs').insert({
    from_user_id: user.id,
    from_name: sender?.name ?? 'Admin',
    to_label: to_label ?? 'Okänt',
    to_count: to.length,
    subject,
    body,
  })

  return NextResponse.json({ ok: true, count: to.length })
}

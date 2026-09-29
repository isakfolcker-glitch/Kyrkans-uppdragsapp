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

  if (!Array.isArray(to) || !to.length) return NextResponse.json({ error: 'Inga mottagare' }, { status: 400 })

  // Bara personer som avsändaren får administrera kan få utskick (databasens regler avgör)
  const raw = to.filter((x: unknown): x is string => typeof x === 'string').map(x => x.trim()).filter(Boolean)
  const requested = Array.from(new Set(raw.map(x => x.toLowerCase())))
  const { data: allowedProfiles } = await supabase.from('profiles').select('email').in('email', Array.from(new Set([...raw, ...requested])))
  const allowed = new Set((allowedProfiles ?? []).map(p => (p.email ?? '').toLowerCase()))
  const recipients = requested.filter(addr => allowed.has(addr))
  if (!recipients.length) return NextResponse.json({ error: 'Inga giltiga mottagare' }, { status: 400 })
  if (!subject?.trim()) return NextResponse.json({ error: 'Ämne saknas' }, { status: 400 })
  if (!body?.trim())    return NextResponse.json({ error: 'Meddelande saknas' }, { status: 400 })

  // Skicka mail via Brevo
  try {
    await sendBulkMessage({ to: recipients, subject, body, fromName: sender?.name ?? 'Admin' })
  } catch (e: any) {
    return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
  }

  // Logga utskicket
  await supabase.from('message_logs').insert({
    from_user_id: user.id,
    from_name: sender?.name ?? 'Admin',
    to_label: to_label ?? 'Okänt',
    to_count: recipients.length,
    subject,
    body,
  })

  return NextResponse.json({ ok: true, count: recipients.length, skipped: requested.length - recipients.length })
}

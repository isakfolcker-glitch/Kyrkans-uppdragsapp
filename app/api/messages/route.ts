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

  const { to_all, group_ids, church_id, subject, body } = await req.json()

  // Hämta mottagare
  let query = supabase.from('profiles').select('id, name, church_id').not('id', 'is', null)
  if (to_all) {
    query = query.eq('church_id', church_id).eq('role', 'ideell')
  } else if (group_ids?.length) {
    const { data: pgRows } = await supabase.from('profile_groups').select('profile_id').in('group_id', group_ids)
    const ids = pgRows?.map((r: any) => r.profile_id) ?? []
    query = query.in('id', ids)
  }

  const { data: recipients } = await query
  const emails = (recipients ?? []).map((r: any) => r.email).filter(Boolean)
  const toLabel = to_all ? 'Alla ideella' : `Grupper: ${group_ids?.join(', ')}`

  // Skicka mail
  if (emails.length) {
    await sendBulkMessage({ to: emails, subject, body, fromName: sender?.name ?? 'Admin' })
  }

  // Logga utskicket
  await supabase.from('message_logs').insert({
    from_user_id: user.id, from_name: sender?.name ?? 'Admin',
    to_label: toLabel, to_count: recipients?.length ?? 0, subject, body,
  })

  return NextResponse.json({ ok: true, count: recipients?.length ?? 0 })
}

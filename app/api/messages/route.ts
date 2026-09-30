import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBulkMessage } from '@/lib/email'
import { getCaller, canAdminChurch } from '@/lib/authz'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { church_id, to, to_label, subject, body } = await req.json()
  const churchId = Number(church_id)

  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Församling krävs' }, { status: 400 })
  }

  // Bara admin för den församling utskicket gäller.
  const { caller } = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })
  if (!(await canAdminChurch(caller, churchId))) {
    return NextResponse.json({ error: 'Saknar behörighet att skicka utskick i församlingen' }, { status: 403 })
  }

  if (!Array.isArray(to) || !to.length) return NextResponse.json({ error: 'Inga mottagare' }, { status: 400 })
  if (typeof subject !== 'string' || typeof body !== 'string') {
    return NextResponse.json({ error: 'Ämne och meddelande måste vara text' }, { status: 400 })
  }
  if (!subject?.trim()) return NextResponse.json({ error: 'Ämne saknas' }, { status: 400 })
  if (!body?.trim()) return NextResponse.json({ error: 'Meddelande saknas' }, { status: 400 })

  const admin = createAdminClient()
  const { data: sender } = await admin.from('profiles').select('name').eq('id', user.id).single()

  const { data: memberships } = await admin
    .from('profile_churches')
    .select('profile_id, profiles!inner(email)')
    .eq('church_id', churchId)
    .eq('active', true)

  // Mottagare måste vara aktiva medlemmar i församlingen OCH synliga för
  // avsändaren enligt databasens regler (vanlig klient med RLS).
  const memberRows = (memberships ?? []).map((membership: any) => {
    const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles
    return { id: membership.profile_id as string, email: (profile?.email as string | null)?.toLowerCase() }
  })
  const requestedRecipients = Array.from(new Set(
    to
      .filter((email: unknown): email is string => typeof email === 'string')
      .map(email => email.trim().toLowerCase())
      .filter(Boolean)
  ))

  const requestedSet = new Set(requestedRecipients)
  const memberIds = memberRows.filter(row => row.email && requestedSet.has(row.email)).map(row => row.id)
  const { data: visibleProfiles } = memberIds.length
    ? await supabase.from('profiles').select('id').in('id', memberIds)
    : { data: [] as { id: string }[] }
  const visibleIds = new Set((visibleProfiles ?? []).map(p => p.id))

  const allowedEmails = new Set(
    memberRows
      .filter(row => row.email && visibleIds.has(row.id))
      .map(row => row.email as string)
  )

  const recipients = requestedRecipients.filter(email => allowedEmails.has(email))
  if (!recipients.length) {
    return NextResponse.json({ error: 'Inga giltiga mottagare i vald församling' }, { status: 400 })
  }
  if (recipients.length !== requestedRecipients.length) {
    return NextResponse.json({ error: 'En eller flera mottagare tillhör inte vald församling' }, { status: 400 })
  }

  try {
    await sendBulkMessage({
      to: recipients,
      subject: subject.trim(),
      body: body.trim(),
      fromName: sender?.name ?? 'Admin',
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
  }

  const { error: logError } = await admin.from('message_logs').insert({
    from_user_id: caller.id,
    from_name: sender?.name ?? 'Admin',
    church_id: churchId,
    to_label: to_label ?? 'Okänt',
    to_count: recipients.length,
    subject: subject.trim(),
    body: body.trim(),
  })
  if (logError) {
    return NextResponse.json({ error: `Mailet skickades men kunde inte loggas: ${logError.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, count: recipients.length })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendApplicationReceived, sendNewApplicationNotice } from '@/lib/email'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Publikt: någon utan konto ansöker om att bli ideell.
export async function POST(req: NextRequest) {
  const body = await req.json()
  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const phone = (body.phone ?? '').trim()
  const churchId = Number(body.church_id)
  const message = (body.message ?? '').trim()
  const birthYear = body.birth_year ? Number(body.birth_year) : null
  const ecName = (body.emergency_contact_name ?? '').trim()
  const ecPhone = (body.emergency_contact_phone ?? '').trim()

  if (!name || !email || !phone) return NextResponse.json({ error: 'Namn, e-post och telefon krävs.' }, { status: 400 })
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Ogiltig e-postadress.' }, { status: 400 })
  if (!churchId || isNaN(churchId)) return NextResponse.json({ error: 'Välj en församling.' }, { status: 400 })

  const admin = createAdminClient()

  // Redan konto? Skicka dem till inloggningen istället för en dubbel ansökan.
  const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (existingUsers?.users?.some((u: any) => u.email?.toLowerCase() === email)) {
    return NextResponse.json({ error: 'Det finns redan ett konto med den e-postadressen. Prova att logga in eller återställ lösenordet.' }, { status: 409 })
  }

  // Redan en väntande ansökan?
  const { data: pending } = await admin.from('applications').select('id').eq('email', email).eq('status', 'pending').maybeSingle()
  if (pending) {
    return NextResponse.json({ error: 'Du har redan en ansökan som väntar på granskning.' }, { status: 409 })
  }

  const { error } = await admin.from('applications').insert({
    name, email, phone, church_id: churchId, message,
    birth_year: birthYear, emergency_contact_name: ecName, emergency_contact_phone: ecPhone,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await sendApplicationReceived({ to: email, name }).catch(() => {})

  // Meddela administratörer för församlingen (samt pastorat/super).
  const { data: church } = await admin.from('churches').select('name').eq('id', churchId).single()
  const { data: admins } = await admin
    .from('profiles')
    .select('email')
    .not('email', 'is', null)
    .or(`admin_level.in.(pastorat,super),and(admin_level.eq.forsamling,church_id.eq.${churchId})`)
  const adminEmails = (admins ?? []).map((a: any) => a.email).filter(Boolean)
  if (adminEmails.length) {
    await sendNewApplicationNotice({ to: adminEmails, applicantName: name, churchName: church?.name ?? '' }).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

// Admin: lista ansökningar.
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('admin_level, church_id').eq('id', user.id).single()
  if (!profile || !['forsamling', 'pastorat', 'super'].includes(profile.admin_level)) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const status = req.nextUrl.searchParams.get('status') ?? 'pending'
  let query = supabase.from('applications').select('*, churches(name)').order('created_at', { ascending: false })
  if (status !== 'all') query = query.eq('status', status)
  if (profile.admin_level === 'forsamling') query = query.eq('church_id', profile.church_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

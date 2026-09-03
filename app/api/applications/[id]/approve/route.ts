import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitation } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('admin_level, church_id, name').eq('id', user.id).single()
  if (!caller || !['forsamling', 'pastorat', 'super'].includes(caller.admin_level)) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: application } = await admin.from('applications').select('*').eq('id', id).single()
  if (!application) return NextResponse.json({ error: 'Ansökan hittades inte' }, { status: 404 })
  if (application.status !== 'pending') return NextResponse.json({ error: 'Ansökan är redan hanterad' }, { status: 409 })
  if (caller.admin_level === 'forsamling' && application.church_id !== caller.church_id) {
    return NextResponse.json({ error: 'Ansökan gäller en annan församling' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const churchId = body.church_id ? Number(body.church_id) : application.church_id
  const { data: inviterAuthUser } = await supabase.auth.getUser()
  const inviterName = caller.name ?? 'Administratören'
  const inviterEmail = inviterAuthUser.user?.email

  const profileFields = {
    email: application.email, name: application.name, church_id: churchId,
    role: 'ideell', admin_level: 'none', is_employee: false,
    phone: application.phone, birth_year: application.birth_year,
    emergency_contact_name: application.emergency_contact_name,
    emergency_contact_phone: application.emergency_contact_phone,
  }

  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email: application.email,
    email_confirm: false,
    user_metadata: { name: application.name, role: 'ideell', church_id: churchId, admin_level: 'none', is_employee: false },
  })

  let userId: string
  if (createError) {
    const alreadyExists = createError.message.toLowerCase().includes('already been registered')
      || createError.message.toLowerCase().includes('already exists')
    if (!alreadyExists) return NextResponse.json({ error: createError.message }, { status: 400 })

    const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })
    const existingUser = usersPage?.users?.find((u: any) => u.email?.toLowerCase() === application.email.toLowerCase())
    if (!existingUser) return NextResponse.json({ error: 'Kunde inte hitta befintlig användare. Kontakta support.' }, { status: 400 })
    userId = existingUser.id

    const hasPassword = !!(existingUser as any).encrypted_password
    const isConfirmed = !!(existingUser as any).email_confirmed_at
    const linkType = hasPassword || isConfirmed ? 'recovery' : 'invite'
    const redirectTo = linkType === 'recovery'
      ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset`
      : `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`

    await admin.from('profiles').upsert({ id: userId, ...profileFields }, { onConflict: 'id' })

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({ type: linkType, email: application.email, options: { redirectTo } })
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 })

    try {
      await sendInvitation({
        to: application.email, name: application.name, inviterName, inviterEmail,
        inviteUrl: linkData.properties.action_link, role: 'ideell',
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Kontot uppdaterades men mailet kunde inte skickas: ${e.message}` }, { status: 500 })
    }
  } else {
    if (!createData.user) return NextResponse.json({ error: 'Kunde inte skapa användaren.' }, { status: 500 })
    userId = createData.user.id

    await admin.from('profiles').upsert({ id: userId, ...profileFields }, { onConflict: 'id' })

    const { data: linkData } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: application.email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm` },
    })

    try {
      await sendInvitation({
        to: application.email, name: application.name, inviterName, inviterEmail,
        inviteUrl: linkData?.properties?.action_link ?? `${process.env.NEXT_PUBLIC_APP_URL}/`,
        role: 'ideell',
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Kontot skapades men mailet kunde inte skickas: ${e.message}` }, { status: 500 })
    }
  }

  await admin.from('applications').update({
    status: 'approved', reviewed_by: user.id, reviewed_at: new Date().toISOString(),
  }).eq('id', id)

  return NextResponse.json({ ok: true })
}

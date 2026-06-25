import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitation } from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  if (!profile || !['forsamling','pastorat','super'].includes(profile.admin_level)) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const { email, name, role, church_id } = await req.json()
  if (!email || !name || !role) return NextResponse.json({ error: 'Saknar fält' }, { status: 400 })
  if (!church_id || isNaN(Number(church_id))) return NextResponse.json({ error: `Ogiltigt kyrk-ID: ${church_id}. Ladda om sidan och försök igen.` }, { status: 400 })

  const admin = createAdminClient()
  const adminLevel = role === 'fadmin' ? 'forsamling' : role === 'padmin' ? 'pastorat' : role === 'superadmin' ? 'super' : 'none'
  const isEmployee = role !== 'ideell'

  const { data: inviterProfile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
  const { data: inviterAuthUser } = await supabase.auth.getUser()
  const inviterName = inviterProfile?.name ?? 'Administratören'
  const inviterEmail = inviterAuthUser.user?.email

  // Försök skapa ny användare
  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { name, role, church_id, admin_level: adminLevel, is_employee: isEmployee },
  })

  // Användaren finns redan — hitta dem och skicka ny länk
  if (createError) {
    const alreadyExists = createError.message.toLowerCase().includes('already been registered')
      || createError.message.toLowerCase().includes('already exists')
    if (!alreadyExists) {
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    // Hitta befintlig användare via listUsers
    const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

    const existingUser = usersPage?.users?.find(
      (u: any) => u.email?.toLowerCase() === email.toLowerCase()
    )
    if (!existingUser) {
      return NextResponse.json({ error: 'Kunde inte hitta befintlig användare. Kontakta support.' }, { status: 400 })
    }

    // Uppdatera profil
    await admin.from('profiles').upsert({
      id: existingUser.id, email, name, church_id, role, admin_level: adminLevel, is_employee: isEmployee,
    }, { onConflict: 'id' })

    // Har de satt lösenord eller bekräftat e-post? → recovery, annars invite
    const hasPassword = !!(existingUser as any).encrypted_password
    const isConfirmed = !!(existingUser as any).email_confirmed_at
    const useRecovery = hasPassword || isConfirmed
    const linkType = useRecovery ? 'recovery' : 'invite'
    const redirectTo = useRecovery
      ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset`
      : `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: linkType, email, options: { redirectTo },
    })
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 })

    try {
      await sendInvitation({
        to: email, name, inviterName, inviterEmail,
        inviteUrl: linkData.properties.action_link, role,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // Ny användare skapad — spara profil och skicka inbjudningslänk
  if (createData.user) {
    await admin.from('profiles').upsert({
      id: createData.user.id, email, name, church_id, role, admin_level: adminLevel, is_employee: isEmployee,
    }, { onConflict: 'id' })

    const { data: linkData } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm` },
    })

    try {
      await sendInvitation({
        to: email, name, inviterName, inviterEmail,
        inviteUrl: linkData?.properties?.action_link ?? `${process.env.NEXT_PUBLIC_APP_URL}/`,
        role,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

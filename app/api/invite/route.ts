import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitation } from '@/lib/email'
import { canAssignRole, roleIsEmployee, roleToAdminLevel } from '@/lib/membershipAuth'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { email, name, role, church_id } = await req.json()
  const churchId = Number(church_id)

  if (!email?.trim() || !name?.trim() || !role) {
    return NextResponse.json({ error: 'Namn, e-post och roll krävs' }, { status: 400 })
  }
  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: `Ogiltigt kyrk-ID: ${church_id}. Ladda om sidan och försök igen.` }, { status: 400 })
  }

  if (!(await canAssignRole(supabase, user.id, churchId, role))) {
    return NextResponse.json({ error: 'Saknar behörighet att bjuda in med den rollen i församlingen' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: church } = await admin
    .from('churches')
    .select('id, name')
    .eq('id', churchId)
    .single()

  if (!church) return NextResponse.json({ error: 'Församlingen finns inte' }, { status: 404 })

  const { data: inviterProfile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()
  const inviterName = inviterProfile?.name ?? 'Administratören'
  const inviterEmail = user.email
  const adminLevel = roleToAdminLevel(role)
  const isEmployee = roleIsEmployee(role)
  const normalizedEmail = email.trim().toLowerCase()
  const normalizedName = name.trim()

  const saveMembership = async (profileId: string) => {
    const { error } = await admin.from('profile_churches').upsert({
      profile_id: profileId,
      church_id: churchId,
      role,
      admin_level: adminLevel,
      is_employee: isEmployee,
      active: true,
      invited_by: user.id,
      invited_at: new Date().toISOString(),
    }, { onConflict: 'profile_id,church_id' })
    return error
  }

  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: false,
    user_metadata: { name: normalizedName },
  })

  if (!createError && createData.user) {
    await admin.from('profiles')
      .update({ email: normalizedEmail, name: normalizedName })
      .eq('id', createData.user.id)

    const membershipError = await saveMembership(createData.user.id)
    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 500 })
    }

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?church=${churchId}` },
    })
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 })

    try {
      await sendInvitation({
        to: normalizedEmail,
        name: normalizedName,
        inviterName,
        inviterEmail,
        inviteUrl: linkData.properties.action_link,
        role,
        churchName: church.name,
        existingAccount: false,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, existingAccount: false, churchId })
  }

  const alreadyExists = createError?.message.toLowerCase().includes('already been registered')
    || createError?.message.toLowerCase().includes('already exists')
  if (!alreadyExists) {
    return NextResponse.json({ error: createError?.message ?? 'Kunde inte skapa användaren' }, { status: 400 })
  }

  const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  const existingUser = usersPage?.users?.find(
    existing => existing.email?.toLowerCase() === normalizedEmail
  )
  if (!existingUser) {
    return NextResponse.json({ error: 'Kunde inte hitta befintlig användare. Kontakta support.' }, { status: 400 })
  }

  const membershipError = await saveMembership(existingUser.id)
  if (membershipError) {
    return NextResponse.json({ error: membershipError.message }, { status: 500 })
  }

  const isConfirmed = Boolean(existingUser.email_confirmed_at)
  const linkType = isConfirmed ? 'magiclink' : 'invite'
  const redirectTo = isConfirmed
    ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?church=${churchId}`
    : `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?church=${churchId}`

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: linkType,
    email: normalizedEmail,
    options: { redirectTo },
  })
  if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 })

  try {
    await sendInvitation({
      to: normalizedEmail,
      name: existingUser.user_metadata?.name || normalizedName,
      inviterName,
      inviterEmail,
      inviteUrl: linkData.properties.action_link,
      role,
      churchName: church.name,
      existingAccount: isConfirmed,
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true, existingAccount: isConfirmed, churchId })
}

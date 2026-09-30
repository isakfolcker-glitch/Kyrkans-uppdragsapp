import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitation } from '@/lib/email'
import { canAssignRole, roleIsEmployee, roleToAdminLevel } from '@/lib/membershipAuth'
import {
  getCaller, canAdminChurch, canAssignLevel, churchLevel, isValidRole, levelRank, profileMaxLevel,
  unauthorized, forbidden,
} from '@/lib/authz'

export async function POST(req: NextRequest) {
  const { caller, supabase } = await getCaller()
  if (!caller) return unauthorized()

  const { email, name, role, church_id } = await req.json()
  const churchId = Number(church_id)

  if (typeof email !== 'string' || !email.trim() || typeof name !== 'string' || !name.trim() || !role) {
    return NextResponse.json({ error: 'Namn, e-post och roll krävs' }, { status: 400 })
  }
  if (!isValidRole(role)) return NextResponse.json({ error: 'Ogiltig roll' }, { status: 400 })
  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: `Ogiltigt kyrk-ID: ${church_id}. Ladda om sidan och försök igen.` }, { status: 400 })
  }

  const normalizedEmail = email.trim().toLowerCase()
  const normalizedName = name.trim()
  const adminLevel = roleToAdminLevel(role)

  // Bara admin för församlingen, och aldrig högre nivå än man själv har där.
  if (!(await canAdminChurch(caller, churchId))) {
    return forbidden('Du kan bara bjuda in till en församling du är admin för.')
  }
  const myLevel = await churchLevel(caller, churchId)
  if (!canAssignLevel(myLevel, adminLevel) || !(await canAssignRole(supabase, caller.id, churchId, role))) {
    return forbidden('Du kan inte ge någon högre behörighet än du själv har i församlingen.')
  }
  if (normalizedEmail === caller.email?.toLowerCase()) {
    return forbidden('Du kan inte bjuda in dig själv.')
  }

  const admin = createAdminClient()
  const { data: church } = await admin
    .from('churches')
    .select('id, name')
    .eq('id', churchId)
    .single()

  if (!church) return NextResponse.json({ error: 'Församlingen finns inte' }, { status: 404 })

  const inviterName = caller.name
  const inviterEmail = caller.email ?? undefined
  const isEmployee = roleIsEmployee(role)

  const saveMembership = async (profileId: string) => {
    const { error } = await admin.from('profile_churches').upsert({
      profile_id: profileId,
      church_id: churchId,
      role,
      admin_level: adminLevel,
      is_employee: isEmployee,
      active: true,
      invited_by: caller.id,
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
    const { error: profileErr } = await admin.from('profiles')
      .update({ email: normalizedEmail, name: normalizedName })
      .eq('id', createData.user.id)
    if (profileErr) {
      return NextResponse.json({ error: `Kunde inte spara personen: ${profileErr.message}` }, { status: 500 })
    }

    const membershipError = await saveMembership(createData.user.id)
    if (membershipError) {
      return NextResponse.json({ error: `Kunde inte spara roll och församling: ${membershipError.message}` }, { status: 500 })
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
  if (existingUser.id === caller.id) return forbidden('Du kan inte bjuda in dig själv.')

  // Befintlig person: inbjudan lägger bara till eller ändrar medlemskapet i den här
  // församlingen. Har personen redan ett medlemskap här med högre nivå än
  // anroparens, eller en högre nivå någonstans, får anroparen inte ändra den.
  const { data: currentMembership } = await admin
    .from('profile_churches')
    .select('admin_level, active')
    .eq('profile_id', existingUser.id)
    .eq('church_id', churchId)
    .maybeSingle()
  if (currentMembership?.active && levelRank(currentMembership.admin_level) > levelRank(myLevel)) {
    return forbidden('Personen har högre behörighet i församlingen än du. Kontakta en pastoratsadmin.')
  }
  const target = await profileMaxLevel(existingUser.id)
  if (currentMembership?.active && target && levelRank(target.level) > levelRank(myLevel)) {
    return forbidden('Personen har högre behörighet än du. Kontakta en pastoratsadmin.')
  }

  const membershipError = await saveMembership(existingUser.id)
  if (membershipError) {
    return NextResponse.json({ error: `Kunde inte spara roll och församling: ${membershipError.message}` }, { status: 500 })
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

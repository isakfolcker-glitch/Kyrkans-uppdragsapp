import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitation } from '@/lib/email'
import { getCaller, canAdminProfile, hasStaffPermission, profileMaxLevel, unauthorized, forbidden } from '@/lib/authz'

export async function POST(req: NextRequest) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const { profileId, churchId: rawChurchId } = await req.json()
  const churchId = Number(rawChurchId)
  if (typeof profileId !== 'string' || !profileId || !churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Person och församling krävs' }, { status: 400 })
  }

  // Admin för personens församling (personen får inte ha högre nivå än anroparen),
  // eller anställd med kan_lagg_till_personal där, som bara får bjuda in ideella
  // utan adminnivå någonstans.
  const isProfileAdmin = await canAdminProfile(caller, profileId, churchId)
  const staffResend = !isProfileAdmin && profileId !== caller.id
    && await hasStaffPermission(caller, 'kan_lagg_till_personal', churchId)
  if (!isProfileAdmin && !staffResend) {
    return forbidden('Saknar behörighet för personen i församlingen')
  }
  if (staffResend) {
    const target = await profileMaxLevel(profileId)
    if (!target || target.level !== 'none') return forbidden('Du får bara bjuda in ideella igen')
  }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('profile_churches')
    .select('role, active, profiles!inner(email, name), churches!inner(name)')
    .eq('profile_id', profileId)
    .eq('church_id', churchId)
    .eq('active', true)
    .maybeSingle()

  if (!membership) return NextResponse.json({ error: 'Aktivt medlemskap saknas' }, { status: 404 })
  if (staffResend && membership.role !== 'ideell') {
    return forbidden('Du får bara bjuda in ideella igen')
  }

  const rawProfile = Array.isArray((membership as any).profiles)
    ? (membership as any).profiles[0]
    : (membership as any).profiles
  const rawChurch = Array.isArray((membership as any).churches)
    ? (membership as any).churches[0]
    : (membership as any).churches

  if (!rawProfile?.email || String(rawProfile.email).endsWith('@intern.local')) {
    return NextResponse.json({ error: 'Ingen e-post registrerad på personen' }, { status: 400 })
  }

  const { data: authUsers, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const authUser = authUsers?.users?.find(
    existing => existing.email?.toLowerCase() === rawProfile.email.toLowerCase()
  )
  if (!authUser) return NextResponse.json({ error: 'Auth-konto saknas' }, { status: 404 })
  // Länken loggar in som kontot, så kontot måste vara just den person man får administrera.
  if (authUser.id !== profileId) {
    return NextResponse.json({ error: 'E-postadressen hör till ett annat konto. Kontakta support.' }, { status: 409 })
  }

  const isConfirmed = Boolean(authUser.email_confirmed_at)
  const linkType = isConfirmed ? 'magiclink' : 'invite'
  const redirectTo = isConfirmed
    ? `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?church=${churchId}`
    : `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm?church=${churchId}`

  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: linkType,
    email: rawProfile.email,
    options: { redirectTo },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await sendInvitation({
      to: rawProfile.email,
      name: rawProfile.name,
      inviterName: caller.name,
      inviterEmail: caller.email ?? undefined,
      inviteUrl: linkData.properties.action_link,
      role: membership.role,
      churchName: rawChurch?.name,
      existingAccount: isConfirmed,
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

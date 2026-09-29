import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitation } from '@/lib/email'
import { canAdminChurch, hasStaffPermission } from '@/lib/membershipAuth'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { profileId, churchId: rawChurchId } = await req.json()
  const churchId = Number(rawChurchId)
  if (!profileId || !churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Person och församling krävs' }, { status: 400 })
  }

  const canAdmin = await canAdminChurch(supabase, churchId)
  const canInvite = await hasStaffPermission(supabase, user.id, churchId, 'kan_lagg_till_personal')
  if (!canAdmin && !canInvite) {
    return NextResponse.json({ error: 'Saknar behörighet i församlingen' }, { status: 403 })
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
  if (!canAdmin && membership.role !== 'ideell') {
    return NextResponse.json({ error: 'Du får bara återinbjuda ideella' }, { status: 403 })
  }

  const rawProfile = Array.isArray((membership as any).profiles)
    ? (membership as any).profiles[0]
    : (membership as any).profiles
  const rawChurch = Array.isArray((membership as any).churches)
    ? (membership as any).churches[0]
    : (membership as any).churches

  if (!rawProfile?.email) {
    return NextResponse.json({ error: 'Ingen e-post registrerad på personen' }, { status: 400 })
  }

  const { data: caller } = await admin.from('profiles').select('name').eq('id', user.id).single()
  const { data: authUsers, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const authUser = authUsers?.users?.find(
    existing => existing.email?.toLowerCase() === rawProfile.email.toLowerCase()
  )
  if (!authUser) return NextResponse.json({ error: 'Auth-konto saknas' }, { status: 404 })

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
      inviterName: caller?.name ?? 'Administratören',
      inviterEmail: user.email,
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

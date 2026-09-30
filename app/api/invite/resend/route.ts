import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendMembershipInvitation } from '@/lib/membershipInvite'
import {
  getCaller, churchLevel, hasStaffPermission, levelAllows, levelRank, profileMaxLevel, unauthorized, forbidden,
} from '@/lib/authz'

export async function POST(req: NextRequest) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const { profileId, churchId: rawChurchId } = await req.json()
  const churchId = Number(rawChurchId)
  if (typeof profileId !== 'string' || !profileId || !churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Person och församling krävs' }, { status: 400 })
  }

  // Admin för församlingen (personen får inte ha högre nivå än anroparen där),
  // eller anställd med kan_lagg_till_personal där, som bara får bjuda in ideella
  // utan adminnivå någonstans. Gäller både accepterade och väntande medlemskap
  // (en ny inbjudan ger ingen behörighet förrän personen accepterar).
  if (profileId === caller.id) return forbidden('Du kan inte bjuda in dig själv.')
  const myLevel = await churchLevel(caller, churchId)
  const isChurchAdmin = levelRank(myLevel) >= 1
  const staffResend = !isChurchAdmin && await hasStaffPermission(caller, 'kan_lagg_till_personal', churchId)
  if (!isChurchAdmin && !staffResend) {
    return forbidden('Saknar behörighet för personen i församlingen')
  }
  const target = await profileMaxLevel(profileId)
  if (!target) return NextResponse.json({ error: 'Personen finns inte' }, { status: 404 })
  if (staffResend && target.level !== 'none') return forbidden('Du får bara bjuda in ideella igen')
  if (isChurchAdmin && !levelAllows(myLevel, target.level)) {
    return forbidden('Personen har högre behörighet än du. Kontakta en pastoratsadmin.')
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
  // Inbjudningslänken hör till kontot, så kontot måste vara just den person man får administrera.
  if (authUser.id !== profileId) {
    return NextResponse.json({ error: 'E-postadressen hör till ett annat konto. Kontakta support.' }, { status: 409 })
  }

  // Bekräftade konton får aldrig en inloggningslänk, bara en vanlig länk till appen.
  const isConfirmed = Boolean(authUser.email_confirmed_at)
  const { error: mailErr } = await sendMembershipInvitation(admin, {
    email: rawProfile.email,
    name: rawProfile.name,
    confirmed: isConfirmed,
    churchId,
    churchName: rawChurch?.name,
    role: membership.role,
    inviterName: caller.name,
    inviterEmail: caller.email ?? undefined,
  })
  if (mailErr) return NextResponse.json({ error: mailErr }, { status: 500 })

  return NextResponse.json({ ok: true })
}

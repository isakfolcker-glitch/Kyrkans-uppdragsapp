import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAssignRole, roleToAdminLevel } from '@/lib/membershipAuth'
import { savePendingMembership, sendMembershipInvitation } from '@/lib/membershipInvite'
import {
  getCaller, canAdminChurch, canAssignLevel, churchLevel, hasStaffPermission, isValidRole, levelRank,
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

  // Admin för församlingen (aldrig högre nivå än man själv har där), eller
  // anställd med kan_lagg_till_personal i just den församlingen, som bara får
  // bjuda in med rollen ideell och aldrig ändra någons befintliga roll.
  const isChurchAdmin = await canAdminChurch(caller, churchId)
  const staffInvite = !isChurchAdmin && await hasStaffPermission(caller, 'kan_lagg_till_personal', churchId)
  if (!isChurchAdmin && !staffInvite) {
    return forbidden('Du kan bara bjuda in till en församling där du har behörighet.')
  }
  if (staffInvite && role !== 'ideell') {
    return forbidden('Du kan bara bjuda in ideella.')
  }
  const myLevel = await churchLevel(caller, churchId)
  if (isChurchAdmin && (!canAssignLevel(myLevel, adminLevel) || !(await canAssignRole(supabase, caller.id, churchId, role)))) {
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

  // Ny användare: profilen är nyskapad av inbjudan och får namn och e-post.
  // Medlemskapet är väntande tills personen gjort onboarding och accepterat.
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

    const membershipError = await savePendingMembership(admin, {
      profileId: createData.user.id, churchId, role, invitedBy: caller.id,
    })
    if (membershipError) {
      return NextResponse.json({ error: `Kunde inte spara roll och församling: ${membershipError.message}` }, { status: 500 })
    }

    const { error: mailErr } = await sendMembershipInvitation(admin, {
      email: normalizedEmail, name: normalizedName, confirmed: false,
      churchId, churchName: church.name, role, inviterName, inviterEmail,
    })
    if (mailErr) return NextResponse.json({ error: mailErr }, { status: 500 })

    return NextResponse.json({ ok: true, existingAccount: false, pending: true, churchId })
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

  // Befintlig person: bara ett VÄNTANDE medlemskap i den här församlingen skapas
  // eller återaktiveras. Profilen (namn, telefon, e-post) rörs inte. Personen blir
  // medlem först när hen själv accepterar. Är personen redan accepterad medlem
  // här ändras rollen via Behörigheter, inte via en ny inbjudan.
  const { data: currentMembership } = await admin
    .from('profile_churches')
    .select('admin_level, active, accepted_at')
    .eq('profile_id', existingUser.id)
    .eq('church_id', churchId)
    .maybeSingle()
  if (currentMembership?.active && currentMembership.accepted_at) {
    return NextResponse.json({ error: 'Personen finns redan i församlingen. Ändra rollen under Behörigheter.' }, { status: 409 })
  }
  if (staffInvite && currentMembership?.active) {
    return NextResponse.json({ error: 'Personen har redan en väntande inbjudan' }, { status: 409 })
  }
  if (currentMembership?.active && levelRank(currentMembership.admin_level) > levelRank(myLevel)) {
    return forbidden('Inbjudan har högre behörighet än du har i församlingen. Kontakta en pastoratsadmin.')
  }

  const membershipError = await savePendingMembership(admin, {
    profileId: existingUser.id, churchId, role, invitedBy: caller.id,
  })
  if (membershipError) {
    return NextResponse.json({ error: `Kunde inte spara roll och församling: ${membershipError.message}` }, { status: 500 })
  }

  const isConfirmed = Boolean(existingUser.email_confirmed_at)
  const { error: mailErr } = await sendMembershipInvitation(admin, {
    email: normalizedEmail,
    name: existingUser.user_metadata?.name || normalizedName,
    confirmed: isConfirmed,
    churchId, churchName: church.name, role, inviterName, inviterEmail,
  })
  if (mailErr) return NextResponse.json({ error: mailErr }, { status: 500 })

  return NextResponse.json({ ok: true, existingAccount: isConfirmed, pending: true, churchId })
}

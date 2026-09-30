import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAssignRole, roleIsEmployee, roleToAdminLevel } from '@/lib/membershipAuth'
import { savePendingMembership, sendMembershipInvitation } from '@/lib/membershipInvite'
import {
  getCaller, canAdminChurch, canAssignLevel, churchLevel, hasStaffPermission, isValidRole, levelRank, profileMaxLevel,
  unauthorized, forbidden,
} from '@/lib/authz'

export async function POST(req: NextRequest) {
  const { caller, supabase } = await getCaller()
  if (!caller) return unauthorized()

  const { name, email, phone, role = 'ideell', church_id, groups = [] } = await req.json()
  const churchId = Number(church_id)

  if (typeof name !== 'string' || !name.trim()) return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Ogiltigt kyrk-ID' }, { status: 400 })
  }
  if (!isValidRole(role)) return NextResponse.json({ error: 'Ogiltig roll' }, { status: 400 })
  if (email != null && typeof email !== 'string') return NextResponse.json({ error: 'Ogiltig e-post' }, { status: 400 })
  if (phone != null && typeof phone !== 'string') return NextResponse.json({ error: 'Ogiltigt telefonnummer' }, { status: 400 })

  // Admin för församlingen (aldrig högre nivå än man själv har där), eller
  // anställd med kan_lagg_till_personal i just den församlingen, som bara får
  // lägga till personer med rollen ideell.
  const isChurchAdmin = await canAdminChurch(caller, churchId)
  const staffAdd = !isChurchAdmin && await hasStaffPermission(caller, 'kan_lagg_till_personal', churchId)
  if (!isChurchAdmin && !staffAdd) {
    return forbidden('Du kan bara lägga till personer i en församling där du har behörighet.')
  }
  if (staffAdd && role !== 'ideell') return forbidden('Du kan bara lägga till ideella.')
  const myLevel = await churchLevel(caller, churchId)
  if (isChurchAdmin && (!canAssignLevel(myLevel, roleToAdminLevel(role)) || !(await canAssignRole(supabase, caller.id, churchId, role)))) {
    return forbidden('Du kan inte ge någon högre behörighet än du själv har i församlingen.')
  }

  const admin = createAdminClient()
  const normalizedEmail = email?.trim().toLowerCase() || ''
  if (normalizedEmail && normalizedEmail === caller.email?.toLowerCase()) {
    return forbidden('Du kan inte lägga till dig själv.')
  }

  let uid: string
  let existingAuthUser: { id: string } | null = null

  if (normalizedEmail) {
    const { data: usersPage, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
    existingAuthUser = usersPage?.users?.find(
      existing => existing.email?.toLowerCase() === normalizedEmail
    ) ?? null
  }

  const ini = name.trim().split(' ').map((word: string) => word[0]).join('').slice(0, 2).toUpperCase()

  if (existingAuthUser) {
    uid = existingAuthUser.id
    if (uid === caller.id) return forbidden('Du kan inte lägga till dig själv.')

    // Befintlig person: rör inte profilen (namn, e-post, telefon). Personen får
    // bara ett VÄNTANDE medlemskap och en inbjudan; hen blir medlem först när hen
    // själv accepterar. Ett befintligt aktivt medlemskap här ändras inte.
    const { data: currentMembership } = await admin
      .from('profile_churches')
      .select('active, accepted_at')
      .eq('profile_id', uid)
      .eq('church_id', churchId)
      .maybeSingle()
    if (currentMembership?.active) {
      return NextResponse.json({
        error: currentMembership.accepted_at ? 'Personen finns redan i församlingen' : 'Personen har redan en väntande inbjudan',
      }, { status: 409 })
    }
    const target = await profileMaxLevel(uid)
    if (!target) {
      return NextResponse.json({ error: 'Personens profil saknas. Kontakta support.' }, { status: 500 })
    }
    if (levelRank(target.level) > levelRank(myLevel)) {
      return forbidden('Personen har högre behörighet än du. Kontakta en pastoratsadmin.')
    }

    const { data: church } = await admin.from('churches').select('name').eq('id', churchId).maybeSingle()
    if (!church) return NextResponse.json({ error: 'Församlingen finns inte' }, { status: 404 })

    const pendingErr = await savePendingMembership(admin, { profileId: uid, churchId, role, invitedBy: caller.id })
    if (pendingErr) {
      return NextResponse.json({ error: `Kunde inte spara inbjudan: ${pendingErr.message}` }, { status: 500 })
    }

    const authUser = existingAuthUser as { id: string; email_confirmed_at?: string | null; user_metadata?: { name?: string } }
    const { error: mailErr } = await sendMembershipInvitation(admin, {
      email: normalizedEmail,
      name: authUser.user_metadata?.name || name.trim(),
      confirmed: Boolean(authUser.email_confirmed_at),
      churchId,
      churchName: church.name,
      role,
      inviterName: caller.name,
      inviterEmail: caller.email ?? undefined,
    })
    if (mailErr) return NextResponse.json({ error: mailErr }, { status: 500 })

    // Grupper sätts inte förrän personen har accepterat.
    return NextResponse.json({ id: uid, ini, existingAccount: true, invited: true, pending: true })
  } else {
    const authEmail = normalizedEmail || `noemail+${crypto.randomUUID()}@intern.local`
    const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: !normalizedEmail,
      user_metadata: { name: name.trim() },
    })
    if (authErr || !authUser.user) {
      return NextResponse.json({ error: authErr?.message ?? 'Kunde inte skapa person' }, { status: 500 })
    }
    uid = authUser.user.id

    // Ny person: fyll i profilen. Roll och nivå sätts bara i profile_churches.
    const { error: profileErr } = await admin.from('profiles').upsert({
      id: uid,
      name: name.trim(),
      email: normalizedEmail || null,
      phone: phone?.trim() || null,
      ini,
      available: true,
    }, { onConflict: 'id' })
    if (profileErr) {
      return NextResponse.json({ error: `Kunde inte spara personen: ${profileErr.message}` }, { status: 500 })
    }
  }

  // Helt ny person som anroparen själv skapat (ingen annan äger kontot än):
  // medlemskapet gäller direkt.
  const now = new Date().toISOString()
  const { error: membershipErr } = await admin.from('profile_churches').upsert({
    profile_id: uid,
    church_id: churchId,
    role,
    admin_level: roleToAdminLevel(role),
    is_employee: roleIsEmployee(role),
    active: true,
    invited_by: caller.id,
    invited_at: now,
    accepted_at: now,
  }, { onConflict: 'profile_id,church_id' })
  if (membershipErr) {
    return NextResponse.json({ error: `Kunde inte spara roll och församling: ${membershipErr.message}` }, { status: 500 })
  }

  // Grupper: bara församlingens egna grupper, andra församlingars grupper lämnas orörda.
  const { data: churchGroups } = await admin
    .from('groups')
    .select('id')
    .eq('church_id', churchId)
  const churchGroupIds = (churchGroups ?? []).map(group => group.id as string)

  if (churchGroupIds.length) {
    await admin.from('profile_groups')
      .delete()
      .eq('profile_id', uid)
      .in('group_id', churchGroupIds)
  }

  const safeGroups = Array.isArray(groups)
    ? Array.from(new Set(groups.filter((groupId: unknown): groupId is string =>
        typeof groupId === 'string' && churchGroupIds.includes(groupId))))
    : []
  if (safeGroups.length) {
    const { error } = await admin.from('profile_groups').insert(
      safeGroups.map(groupId => ({ profile_id: uid, group_id: groupId }))
    )
    if (error) return NextResponse.json({ error: `Kunde inte spara grupper: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({
    id: uid,
    ini,
    existingAccount: false,
    invited: false,
  })
}

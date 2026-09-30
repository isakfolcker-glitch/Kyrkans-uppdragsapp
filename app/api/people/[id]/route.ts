import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAssignRole, roleIsEmployee, roleToAdminLevel } from '@/lib/membershipAuth'
import {
  getCaller, canAdminProfile, canAdminAllMemberships, canAssignLevel, churchLevel, isValidRole,
  levelAllows, levelRank, STAFF_PERMISSIONS, unauthorized, forbidden, type AdminLevel,
} from '@/lib/authz'
import { deletePersonData } from '@/lib/gdpr'
import { promoteFromWaitlist } from '@/app/api/waitlist/route'

// Profilfält som får ändras via denna route. Allt annat i profiles (roll,
// nivå, församling m.m.) ignoreras. Roll och nivå per församling ändras bara
// via fältet role nedan, med nivåtak.
// - email: bara superadmin (personen själv ändrar sin e-post via Min profil).
// - övriga profilfält påverkar hela kontot, så de kräver att anroparen
//   administrerar ALLA personens accepterade medlemskap.
const TEXT_FIELDS = ['name', 'phone', 'email', 'ini', 'av_color', 'ac_color'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller, supabase } = await getCaller()
  if (!caller) return unauthorized()

  const { id: targetId } = await params
  const body = await req.json()
  const churchId = Number(body.church_id)
  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Församling krävs' }, { status: 400 })
  }

  // Admin för personens församling, och personen har inte högre nivå än anroparen där.
  // canAdminProfile kräver också att personen har aktivt, accepterat medlemskap i församlingen.
  if (!(await canAdminProfile(caller, targetId, churchId))) {
    return forbidden('Saknar behörighet för personen i församlingen')
  }

  // Kontogemensamma profilfält kontrolleras innan något sparas.
  const touchesProfile = TEXT_FIELDS.some(key => key in body) || 'available' in body
  if ('email' in body && !caller.isSuper) {
    return forbidden('E-post kan bara ändras av personen själv eller av superadmin.')
  }
  if (touchesProfile && !(await canAdminAllMemberships(caller, targetId, { churchId }))) {
    return forbidden('Personen tillhör även en församling du inte administrerar. Namn och telefon kan du inte ändra.')
  }

  const admin = createAdminClient()
  const { data: targetMembership } = await admin
    .from('profile_churches')
    .select('profile_id, church_id, role, admin_level, active')
    .eq('profile_id', targetId)
    .eq('church_id', churchId)
    .eq('active', true)
    .not('accepted_at', 'is', null)
    .maybeSingle()
  if (!targetMembership) return NextResponse.json({ error: 'Medlemskapet finns inte' }, { status: 404 })

  const { groups, role, staff_permissions, responsible_pass_ids } = body
  const isSelf = targetId === caller.id

  // Ingen får ändra sin egen roll, nivå eller personalbehörighet.
  if (isSelf && (role !== undefined || staff_permissions !== undefined)) {
    return forbidden('Du kan inte ändra din egen roll eller behörighet.')
  }

  // Personalbehörigheter: bara kända nycklar och bara sant/falskt.
  let safePerms: Record<string, boolean> | null = null
  if (staff_permissions !== undefined && staff_permissions !== null) {
    if (typeof staff_permissions !== 'object' || Array.isArray(staff_permissions)) {
      return NextResponse.json({ error: 'Ogiltiga behörigheter' }, { status: 400 })
    }
    safePerms = {}
    for (const key of STAFF_PERMISSIONS) {
      if (key in staff_permissions) safePerms[key] = staff_permissions[key] === true
    }
  }

  let effectiveRole: string = targetMembership.role
  if (role !== undefined) {
    if (!isValidRole(role)) return NextResponse.json({ error: 'Ogiltig roll' }, { status: 400 })
    const myLevel = await churchLevel(caller, churchId)
    if (!canAssignLevel(myLevel, roleToAdminLevel(role)) || !(await canAssignRole(supabase, caller.id, churchId, role))) {
      return forbidden('Du kan inte ge någon högre behörighet än du själv har i församlingen.')
    }

    const { error } = await admin.from('profile_churches').update({
      role,
      admin_level: roleToAdminLevel(role),
      is_employee: roleIsEmployee(role),
    }).eq('profile_id', targetId).eq('church_id', churchId)
    if (error) return NextResponse.json({ error: `Kunde inte spara rollen: ${error.message}` }, { status: 500 })
    effectiveRole = role

    if (role !== 'anstalld') {
      await admin.from('profile_church_permissions').delete().eq('profile_id', targetId).eq('church_id', churchId)
    }
  }

  if (safePerms) {
    if (effectiveRole !== 'anstalld') {
      if (role === undefined) {
        return NextResponse.json({ error: 'Personalbehörigheter gäller bara anställda' }, { status: 400 })
      }
    } else {
      const { error: permError } = await admin.from('profile_church_permissions').upsert({
        ...safePerms,
        profile_id: targetId,
        church_id: churchId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'profile_id,church_id' })
      if (permError) return NextResponse.json({ error: `Kunde inte spara behörigheterna: ${permError.message}` }, { status: 500 })
    }
  }

  // Vitlistade profilfält. Aldrig fri inmatning till profiles.
  const profileUpdate: Record<string, string | boolean | null> = {}
  for (const key of TEXT_FIELDS) {
    if (!(key in body)) continue
    const value = body[key]
    if (value !== null && typeof value !== 'string') {
      return NextResponse.json({ error: `Ogiltigt värde för ${key}` }, { status: 400 })
    }
    const trimmed = value === null ? null : value.trim()
    if (key === 'name') {
      if (!trimmed) return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
      profileUpdate.name = trimmed
    } else if (key === 'email') {
      profileUpdate.email = trimmed ? trimmed.toLowerCase() : null
    } else {
      profileUpdate[key] = trimmed || null
    }
  }
  if ('available' in body) {
    if (typeof body.available !== 'boolean') {
      return NextResponse.json({ error: 'Ogiltigt värde för available' }, { status: 400 })
    }
    profileUpdate.available = body.available
  }
  if (Object.keys(profileUpdate).length) {
    const { error } = await admin.from('profiles').update(profileUpdate).eq('id', targetId)
    if (error) return NextResponse.json({ error: `Kunde inte spara personen: ${error.message}` }, { status: 500 })
  }

  // Grupper: bara församlingens egna grupper påverkas. Grupper i andra
  // församlingar (och gemensamma grupper) lämnas orörda.
  if (Array.isArray(groups)) {
    const { data: churchGroups, error: groupsErr } = await admin.from('groups').select('id').eq('church_id', churchId)
    if (groupsErr) return NextResponse.json({ error: `Kunde inte läsa grupper: ${groupsErr.message}` }, { status: 500 })
    const churchGroupIds = (churchGroups ?? []).map(group => group.id as string)

    if (churchGroupIds.length) {
      const { error: delErr } = await admin.from('profile_groups')
        .delete()
        .eq('profile_id', targetId)
        .in('group_id', churchGroupIds)
      if (delErr) return NextResponse.json({ error: `Kunde inte spara grupper: ${delErr.message}` }, { status: 500 })
    }

    const safeGroups = Array.from(new Set(
      groups.filter((groupId: unknown): groupId is string => typeof groupId === 'string' && churchGroupIds.includes(groupId))
    ))
    if (safeGroups.length) {
      const { error } = await admin.from('profile_groups').insert(
        safeGroups.map(groupId => ({ profile_id: targetId, group_id: groupId }))
      )
      if (error) return NextResponse.json({ error: `Kunde inte spara grupper: ${error.message}` }, { status: 500 })
    }
  } else if (groups !== undefined) {
    return NextResponse.json({ error: 'Grupper måste vara en lista' }, { status: 400 })
  }

  if (Array.isArray(responsible_pass_ids)) {
    const { data: churchPasses } = await admin.from('passes').select('id').eq('church_id', churchId)
    const churchPassIds = (churchPasses ?? []).map(pass => pass.id as number)

    if (churchPassIds.length) {
      await admin.from('pass_responsible')
        .delete()
        .eq('profile_id', targetId)
        .in('pass_id', churchPassIds)
    }

    const safePassIds = Array.from(new Set(
      responsible_pass_ids
        .map((id: unknown) => Number(id))
        .filter((id: number) => churchPassIds.includes(id))
    )) as number[]
    if (safePassIds.length) {
      const { error } = await admin.from('pass_responsible').insert(
        safePassIds.map(passId => ({ pass_id: passId, profile_id: targetId }))
      )
      if (error) return NextResponse.json({ error: `Kunde inte spara passansvar: ${error.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

/**
 * Tar bort personen ur en församling (medlemskapet och allt som hör till
 * församlingen). Var det personens sista aktiva medlemskap raderas hela
 * personen enligt GDPR (deletePersonData + auth-kontot).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const { id: targetId } = await params
  const churchId = Number(req.nextUrl.searchParams.get('church_id'))
  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Församling krävs' }, { status: 400 })
  }
  if (targetId === caller.id) return forbidden('Radera ditt eget konto via Min profil.')

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('profile_churches')
    .select('profile_id, admin_level, accepted_at')
    .eq('profile_id', targetId)
    .eq('church_id', churchId)
    .eq('active', true)
    .maybeSingle()

  // Väntande inbjudan: admin för församlingen kan dra tillbaka den (inte en
  // inbjudan med högre nivå än sin egen). Bara inbjudan stängs, inget annat rörs.
  if (membership && membership.accepted_at == null) {
    const myLevel = await churchLevel(caller, churchId)
    if (levelRank(myLevel) < 1 || !levelAllows(myLevel, membership.admin_level as AdminLevel)) {
      return forbidden('Saknar behörighet för inbjudan i församlingen')
    }
    const { error: cancelErr } = await admin.from('profile_churches')
      .update({ active: false })
      .eq('profile_id', targetId)
      .eq('church_id', churchId)
      .is('accepted_at', null)
    if (cancelErr) return NextResponse.json({ error: `Kunde inte dra tillbaka inbjudan: ${cancelErr.message}` }, { status: 500 })
    return NextResponse.json({ ok: true, deletedCompletely: false, invitationCancelled: true })
  }

  // Admin för personens församling, med samma nivåtak som övriga personändringar.
  if (!(await canAdminProfile(caller, targetId, churchId))) {
    return forbidden('Saknar behörighet för personen i församlingen')
  }
  if (!membership) return NextResponse.json({ error: 'Medlemskapet finns inte' }, { status: 404 })

  const { data: churchGroups } = await admin.from('groups').select('id').eq('church_id', churchId)
  const groupIds = (churchGroups ?? []).map(group => group.id)
  if (groupIds.length) {
    await admin.from('profile_groups').delete().eq('profile_id', targetId).in('group_id', groupIds)
  }

  const { data: churchPasses } = await admin.from('passes').select('id').eq('church_id', churchId)
  const passIds = (churchPasses ?? []).map(pass => pass.id)
  const affectedPassIds: number[] = []
  if (passIds.length) {
    await admin.from('pass_responsible').delete().eq('profile_id', targetId).in('pass_id', passIds)
    await admin.from('waitlist').delete().eq('profile_id', targetId).in('pass_id', passIds)

    const { data: bookings } = await admin
      .from('bookings')
      .select('id, pass_id')
      .eq('profile_id', targetId)
      .in('pass_id', passIds)

    if (bookings?.length) {
      await admin.from('bookings').delete().in('id', bookings.map(booking => booking.id))
      affectedPassIds.push(...new Set(bookings.map(booking => booking.pass_id as number)))
    }
  }

  await admin.from('profile_church_permissions')
    .delete()
    .eq('profile_id', targetId)
    .eq('church_id', churchId)

  const { error } = await admin.from('profile_churches')
    .update({ active: false })
    .eq('profile_id', targetId)
    .eq('church_id', churchId)
  if (error) return NextResponse.json({ error: `Kunde inte ta bort medlemskapet: ${error.message}` }, { status: 500 })

  // Sista aktiva medlemskapet borta: radera hela personen (GDPR, ingen mjuk radering).
  const { count, error: countErr } = await admin
    .from('profile_churches')
    .select('profile_id', { count: 'exact', head: true })
    .eq('profile_id', targetId)
    .eq('active', true)
  if (countErr) return NextResponse.json({ error: `Kunde inte kontrollera medlemskap: ${countErr.message}` }, { status: 500 })

  let deletedCompletely = false
  if (count === 0) {
    await deletePersonData(admin, targetId)
    await admin.auth.admin.deleteUser(targetId, false).catch(() => {})
    deletedCompletely = true
  }

  await Promise.all(affectedPassIds.map(passId => promoteFromWaitlist(passId).catch(() => {})))

  return NextResponse.json({ ok: true, deletedCompletely })
}

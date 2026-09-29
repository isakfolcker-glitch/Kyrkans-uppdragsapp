import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  canAssignRole,
  canAdminChurch,
  hasStaffPermission,
  roleIsEmployee,
  roleToAdminLevel,
} from '@/lib/membershipAuth'
import { promoteFromWaitlist } from '@/app/api/waitlist/route'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { id: targetId } = await params
  const body = await req.json()
  const churchId = Number(body.church_id)
  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Församling krävs' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: targetMembership } = await admin
    .from('profile_churches')
    .select('profile_id, church_id, role, admin_level, active')
    .eq('profile_id', targetId)
    .eq('church_id', churchId)
    .eq('active', true)
    .maybeSingle()
  if (!targetMembership) return NextResponse.json({ error: 'Medlemskapet finns inte' }, { status: 404 })

  const isAdmin = await canAdminChurch(supabase, churchId)
  const canAddPeople = await hasStaffPermission(supabase, user.id, churchId, 'kan_lagg_till_personal')
  if (!isAdmin && !canAddPeople) {
    return NextResponse.json({ error: 'Saknar behörighet i församlingen' }, { status: 403 })
  }

  const { groups, role, staff_permissions, responsible_pass_ids, name, phone } = body

  if (role !== undefined) {
    if (!isAdmin || !(await canAssignRole(supabase, user.id, churchId, role))) {
      return NextResponse.json({ error: 'Du kan inte ändra till den rollen' }, { status: 403 })
    }

    const { error } = await admin.from('profile_churches').update({
      role,
      admin_level: roleToAdminLevel(role),
      is_employee: roleIsEmployee(role),
    }).eq('profile_id', targetId).eq('church_id', churchId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (role === 'anstalld' && staff_permissions) {
      const { error: permError } = await admin.from('staff_permissions').upsert({
        profile_id: targetId,
        ...staff_permissions,
      }, { onConflict: 'profile_id' })
      if (permError) return NextResponse.json({ error: permError.message }, { status: 500 })
    } else if (role !== 'anstalld') {
      await admin.from('staff_permissions').delete().eq('profile_id', targetId)
    }
  } else if (staff_permissions !== undefined) {
    if (!isAdmin) return NextResponse.json({ error: 'Saknar behörighet att ändra rättigheter' }, { status: 403 })
    const { error: permError } = await admin.from('staff_permissions').upsert({
      profile_id: targetId,
      ...staff_permissions,
    }, { onConflict: 'profile_id' })
    if (permError) return NextResponse.json({ error: permError.message }, { status: 500 })
  }

  if ((name !== undefined || phone !== undefined) && isAdmin) {
    const profileUpdate: Record<string, string | null> = {}
    if (name !== undefined) profileUpdate.name = String(name).trim()
    if (phone !== undefined) profileUpdate.phone = String(phone).trim() || null
    const { error } = await admin.from('profiles').update(profileUpdate).eq('id', targetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(groups)) {
    const { data: churchGroups } = await admin.from('groups').select('id').eq('church_id', churchId)
    const churchGroupIds = (churchGroups ?? []).map(group => group.id)

    if (churchGroupIds.length) {
      await admin.from('profile_groups')
        .delete()
        .eq('profile_id', targetId)
        .in('group_id', churchGroupIds)
    }

    const safeGroups = groups.filter((groupId: string) => churchGroupIds.includes(groupId))
    if (safeGroups.length) {
      const { error } = await admin.from('profile_groups').insert(
        safeGroups.map((groupId: string) => ({ profile_id: targetId, group_id: groupId }))
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (Array.isArray(responsible_pass_ids)) {
    if (!isAdmin) return NextResponse.json({ error: 'Saknar behörighet att ändra passansvar' }, { status: 403 })

    const { data: churchPasses } = await admin.from('passes').select('id').eq('church_id', churchId)
    const churchPassIds = (churchPasses ?? []).map(pass => pass.id)

    if (churchPassIds.length) {
      await admin.from('pass_responsible')
        .delete()
        .eq('profile_id', targetId)
        .in('pass_id', churchPassIds)
    }

    const safePassIds = responsible_pass_ids
      .map((id: unknown) => Number(id))
      .filter((id: number) => churchPassIds.includes(id))
    if (safePassIds.length) {
      const { error } = await admin.from('pass_responsible').insert(
        safePassIds.map((passId: number) => ({ pass_id: passId, profile_id: targetId }))
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { id: targetId } = await params
  const churchId = Number(req.nextUrl.searchParams.get('church_id'))
  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Församling krävs' }, { status: 400 })
  }

  if (!(await canAdminChurch(supabase, churchId))) {
    return NextResponse.json({ error: 'Saknar behörighet i församlingen' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('profile_churches')
    .select('profile_id')
    .eq('profile_id', targetId)
    .eq('church_id', churchId)
    .eq('active', true)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Medlemskapet finns inte' }, { status: 404 })

  const { data: churchGroups } = await admin.from('groups').select('id').eq('church_id', churchId)
  const groupIds = (churchGroups ?? []).map(group => group.id)
  if (groupIds.length) {
    await admin.from('profile_groups').delete().eq('profile_id', targetId).in('group_id', groupIds)
  }

  const { data: churchPasses } = await admin.from('passes').select('id').eq('church_id', churchId)
  const passIds = (churchPasses ?? []).map(pass => pass.id)
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
      await Promise.all(
        Array.from(new Set(bookings.map(booking => booking.pass_id)))
          .map(passId => promoteFromWaitlist(passId).catch(() => {}))
      )
    }
  }

  const { error } = await admin.from('profile_churches')
    .update({ active: false })
    .eq('profile_id', targetId)
    .eq('church_id', churchId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

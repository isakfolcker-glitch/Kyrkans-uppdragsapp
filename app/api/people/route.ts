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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { name, email, phone, role = 'ideell', church_id, groups = [] } = await req.json()
  const churchId = Number(church_id)

  if (!name?.trim()) return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Ogiltigt kyrk-ID' }, { status: 400 })
  }

  const canAdmin = await canAdminChurch(supabase, churchId)
  const canAddPeople = await hasStaffPermission(supabase, user.id, churchId, 'kan_lagg_till_personal')
  if (!canAdmin && !(canAddPeople && role === 'ideell')) {
    return NextResponse.json({ error: 'Saknar behörighet i församlingen' }, { status: 403 })
  }
  if (canAdmin && !(await canAssignRole(supabase, user.id, churchId, role))) {
    return NextResponse.json({ error: 'Du kan inte tilldela den rollen' }, { status: 403 })
  }

  const admin = createAdminClient()
  const normalizedEmail = email?.trim().toLowerCase() || ''
  let uid: string
  let existingAuthUser: any = null

  if (normalizedEmail) {
    const { data: usersPage, error: usersErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 })
    existingAuthUser = usersPage?.users?.find(
      existing => existing.email?.toLowerCase() === normalizedEmail
    )
  }

  if (existingAuthUser) {
    uid = existingAuthUser.id
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
  }

  const ini = name.trim().split(' ').map((word: string) => word[0]).join('').slice(0, 2).toUpperCase()

  const { error: profileErr } = await admin.from('profiles').upsert({
    id: uid,
    name: name.trim(),
    email: normalizedEmail || null,
    phone: phone?.trim() || null,
    ini,
    available: true,
  }, { onConflict: 'id' })
  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

  const { error: membershipErr } = await admin.from('profile_churches').upsert({
    profile_id: uid,
    church_id: churchId,
    role,
    admin_level: roleToAdminLevel(role),
    is_employee: roleIsEmployee(role),
    active: true,
    invited_by: user.id,
    invited_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,church_id' })
  if (membershipErr) return NextResponse.json({ error: membershipErr.message }, { status: 500 })

  const { data: churchGroups } = await admin
    .from('groups')
    .select('id')
    .eq('church_id', churchId)
  const churchGroupIds = (churchGroups ?? []).map(group => group.id)

  if (churchGroupIds.length) {
    await admin.from('profile_groups')
      .delete()
      .eq('profile_id', uid)
      .in('group_id', churchGroupIds)
  }

  const safeGroups = Array.isArray(groups)
    ? groups.filter((groupId: string) => churchGroupIds.includes(groupId))
    : []
  if (safeGroups.length) {
    const { error } = await admin.from('profile_groups').insert(
      safeGroups.map((groupId: string) => ({ profile_id: uid, group_id: groupId }))
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    id: uid,
    ini,
    existingAccount: Boolean(existingAuthUser),
    invited: false,
  })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAdminOrStaff, unauthorized, forbidden } from '@/lib/authz'
import { saveGroupEditor } from '@/lib/groupsServer'
import type { Role } from '@/lib/appData'

export async function GET(req: NextRequest) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()
  const churchId = Number(req.nextUrl.searchParams.get('church_id'))
  if (!Number.isSafeInteger(churchId) || churchId <= 0) {
    return NextResponse.json({ error: 'Församling krävs.' }, { status: 400 })
  }
  if (!(await canAdminOrStaff(caller, 'kan_hantera_grupper', churchId))) return forbidden()

  // Grupphanterare behöver en medlemsväljare även utan kan_se_personal.
  // Läs endast namn, lokal roll och gruppkopplingar; aldrig mail/telefon.
  const admin = createAdminClient()
  const [groupResult, membershipResult] = await Promise.all([
    admin.from('groups').select('*').or(`church_id.eq.${churchId},church_id.is.null`).order('label'),
    admin.from('profile_churches')
      .select('profile_id, role, is_employee, profiles!inner(name, profile_groups(group_id))')
      .eq('church_id', churchId).eq('active', true).not('accepted_at', 'is', null).neq('role', 'kiosk'),
  ])
  if (groupResult.error || membershipResult.error) {
    return NextResponse.json({ error: 'Kunde inte läsa grupperna. Försök igen.' }, { status: 500 })
  }
  type MembershipRow = { profile_id: string; role: Role; is_employee: boolean; profiles: { name: string; profile_groups: { group_id: string }[] } | { name: string; profile_groups: { group_id: string }[] }[] }
  const memberships = (membershipResult.data ?? []) as unknown as MembershipRow[]
  const people = memberships.map(row => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return { id: row.profile_id, name: profile.name, role: row.role, isEmployee: row.is_employee, groups: profile.profile_groups.map(group => group.group_id) }
  })
  return NextResponse.json({
    groups: (groupResult.data ?? []).map(group => ({
      id: group.id, label: group.label, cls: group.cls, churchId: group.church_id,
      responsibleProfileId: group.responsible_profile_id ?? null,
      memberIds: people.filter(person => person.groups.includes(group.id)).map(person => person.id),
    })),
    people: people.map(({ id, name, role, isEmployee }) => ({ id, name, role, isEmployee })),
  })
}

export async function POST(req: NextRequest) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Ogiltig grupp.' }, { status: 400 })
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!label || label.length > 100) {
    return NextResponse.json({ error: 'Gruppnamn krävs (högst 100 tecken)' }, { status: 400 })
  }
  const cls = typeof body.cls === 'string' && body.cls.trim() ? body.cls.trim().slice(0, 50) : undefined

  // church_id: null (uttryckligen) betyder gemensam grupp. Bara superadmin.
  let churchId: number | null
  if (body.church_id === null) {
    if (!caller.isSuper) return forbidden('Bara superadmin kan skapa gemensamma grupper.')
    churchId = null
  } else {
    churchId = Number(body.church_id)
    if (!churchId || Number.isNaN(churchId)) {
      return NextResponse.json({ error: 'Gruppnamn och församling krävs' }, { status: 400 })
    }
    // Admin för församlingen eller anställd med kan_hantera_grupper i just den församlingen.
    if (!(await canAdminOrStaff(caller, 'kan_hantera_grupper', churchId))) {
      return forbidden('Saknar behörighet i församlingen')
    }
  }

  if ('responsible_profile_id' in body || 'add_member_ids' in body || 'remove_member_ids' in body) {
    if (churchId === null) return NextResponse.json({ error: 'Medlemmar och ansvarig hanteras i församlingens egna grupper.' }, { status: 400 })
    return saveGroupEditor(body)
  }

  const id = label.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/\s+/g, '_') + '_' + Date.now()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('groups')
    .insert({ id, label, church_id: churchId, ...(cls ? { cls } : {}) })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

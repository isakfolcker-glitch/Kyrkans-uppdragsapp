import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAdminProfile, filterGroupsForChurch, unauthorized, forbidden } from '@/lib/authz'
import { deletePersonData } from '@/lib/gdpr'

// Fält som får ändras via denna route. Roll, behörighetsnivå och församling
// ändras bara via sidan Behörigheter, där databasen kontrollerar reglerna.
const EDITABLE_FIELDS = ['name', 'phone', 'email', 'available', 'ini', 'av_color', 'ac_color'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const { id: targetId } = await params
  if (!(await canAdminProfile(caller, targetId))) return forbidden()

  const admin = createAdminClient()
  const body = await req.json()
  const { groups } = body

  const profileData: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) if (key in body) profileData[key] = body[key]

  if (Object.keys(profileData).length) {
    const { error } = await admin.from('profiles').update(profileData).eq('id', targetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(groups)) {
    const { data: target } = await admin.from('profiles').select('church_id').eq('id', targetId).single()
    const allowed = target?.church_id != null ? await filterGroupsForChurch(groups, target.church_id) : []
    await admin.from('profile_groups').delete().eq('profile_id', targetId)
    if (allowed.length) {
      const { error } = await admin.from('profile_groups').insert(allowed.map(g => ({ profile_id: targetId, group_id: g })))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const { id: targetId } = await params
  if (targetId === caller.id) return forbidden('Radera ditt eget konto via Min profil.')
  if (!(await canAdminProfile(caller, targetId))) return forbidden()

  const admin = createAdminClient()
  await deletePersonData(admin, targetId)

  // Hard delete, ingen soft delete
  await admin.auth.admin.deleteUser(targetId, false).catch(() => {})

  return NextResponse.json({ ok: true })
}

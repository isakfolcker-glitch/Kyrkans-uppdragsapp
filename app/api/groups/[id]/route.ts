import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAdminOrStaff, type Caller, unauthorized, forbidden } from '@/lib/authz'

/**
 * Gemensamma grupper (utan församling): bara superadmin.
 * Församlingens grupper: admin för församlingen eller anställd med
 * kan_hantera_grupper i just den församlingen.
 */
async function canManageGroup(caller: Caller, churchId: number | null) {
  if (churchId == null) return caller.isSuper
  return canAdminOrStaff(caller, 'kan_hantera_grupper', churchId)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const admin = createAdminClient()
  const { data: group } = await admin.from('groups').select('church_id').eq('id', id).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Gruppen finns inte' }, { status: 404 })
  if (!(await canManageGroup(caller, group.church_id))) return forbidden('Saknar behörighet för den här gruppen')

  // Bara namn och färg får ändras. Församlingen ändras aldrig härifrån.
  const body = await req.json()
  const update: Record<string, string> = {}
  if ('label' in body) {
    const label = typeof body.label === 'string' ? body.label.trim() : ''
    if (!label || label.length > 100) return NextResponse.json({ error: 'Gruppnamn krävs (högst 100 tecken)' }, { status: 400 })
    update.label = label
  }
  if ('cls' in body) {
    if (typeof body.cls !== 'string' || !body.cls.trim()) return NextResponse.json({ error: 'Ogiltig färg' }, { status: 400 })
    update.cls = body.cls.trim().slice(0, 50)
  }
  if (!Object.keys(update).length) return NextResponse.json({ ok: true })

  const { error } = await admin.from('groups').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const admin = createAdminClient()
  const { data: group } = await admin.from('groups').select('church_id').eq('id', id).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Gruppen finns inte' }, { status: 404 })
  if (!(await canManageGroup(caller, group.church_id))) return forbidden('Saknar behörighet för den här gruppen')

  // Service role efter kontrollen ovan: databasens RLS för groups täcker inte
  // anställda med kan_hantera_grupper eller gemensamma grupper.
  const { error } = await admin.from('groups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAdminChurch, churchLevel, levelRank, unauthorized, forbidden } from '@/lib/authz'

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const kyrkaId = Number(id)
  if (!kyrkaId || Number.isNaN(kyrkaId)) return NextResponse.json({ error: 'Ogiltig kyrka' }, { status: 400 })

  const admin = createAdminClient()
  const { data: kyrka } = await admin.from('kyrkor').select('forsamling_id').eq('id', kyrkaId).maybeSingle()
  if (!kyrka) return NextResponse.json({ error: 'Kyrkan finns inte' }, { status: 404 })

  // Admin för kyrkans församling, med pastoratsnivå som tidigare. Kyrkor utan församling: bara superadmin.
  const churchId = kyrka.forsamling_id as number | null
  const allowed = churchId == null
    ? caller.isSuper
    : (await canAdminChurch(caller, churchId)) && levelRank(await churchLevel(caller, churchId)) >= 2
  if (!allowed) return forbidden('Saknar behörighet för församlingen')

  const { error } = await admin.from('kyrkor').delete().eq('id', kyrkaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

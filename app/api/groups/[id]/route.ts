import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAdminChurch } from '@/lib/authz'

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { caller } = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const admin = createAdminClient()
  const { data: group } = await admin.from('groups').select('church_id').eq('id', id).maybeSingle()
  if (!group) return NextResponse.json({ error: 'Gruppen finns inte' }, { status: 404 })
  // Gemensamma grupper utan församling kan inte tas bort här.
  if (group.church_id == null) {
    return NextResponse.json({ error: 'Gemensamma grupper kan inte tas bort här' }, { status: 403 })
  }

  // Bara admin för gruppens församling.
  if (!(await canAdminChurch(caller, group.church_id))) {
    return NextResponse.json({ error: 'Saknar behörighet i församlingen' }, { status: 403 })
  }

  // Vanlig klient: databasen (RLS) avgör också om gruppen får tas bort.
  const { data: deleted, error } = await supabase.from('groups').delete().eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted?.length) return NextResponse.json({ error: 'Saknar behörighet för den här gruppen' }, { status: 403 })
  return NextResponse.json({ ok: true })
}

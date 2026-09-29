import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminChurch, hasStaffPermission } from '@/lib/membershipAuth'

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const admin = createAdminClient()
  const { data: group } = await admin.from('groups').select('church_id').eq('id', id).single()
  if (!group?.church_id) return NextResponse.json({ error: 'Gruppen finns inte' }, { status: 404 })

  const allowed = await canAdminChurch(supabase, group.church_id)
    || await hasStaffPermission(supabase, user.id, group.church_id, 'kan_hantera_grupper')
  if (!allowed) return NextResponse.json({ error: 'Saknar behörighet i församlingen' }, { status: 403 })

  const { error } = await admin.from('groups').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

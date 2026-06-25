import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  if (!caller || !['forsamling', 'pastorat', 'super'].includes(caller.admin_level)) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { groups, ...profileData } = await req.json()
  const { id: targetId } = await params

  if (Object.keys(profileData).length) {
    const { error } = await admin.from('profiles').update(profileData).eq('id', targetId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (Array.isArray(groups)) {
    await admin.from('profile_groups').delete().eq('profile_id', targetId)
    if (groups.length) {
      const rows = groups.map((g: string) => ({ profile_id: targetId, group_id: g }))
      const { error } = await admin.from('profile_groups').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  if (!caller || !['forsamling', 'pastorat', 'super'].includes(caller.admin_level)) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { id: targetId } = await params

  await admin.from('pass_responsible').delete().eq('profile_id', targetId)
  await admin.from('profile_groups').delete().eq('profile_id', targetId)
  await admin.from('notif_settings').delete().eq('profile_id', targetId)
  await admin.from('notifications').delete().eq('user_id', targetId)
  await admin.from('bookings').delete().eq('profile_id', targetId)
  await admin.from('profiles').delete().eq('id', targetId)

  // Hard delete — ta bort permanent, ingen soft delete
  await admin.auth.admin.deleteUser(targetId, true).catch(() => {})

  return NextResponse.json({ ok: true })
}


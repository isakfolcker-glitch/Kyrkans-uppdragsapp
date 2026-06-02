import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const admin = createAdminClient()
  const id = user.id

  // Ta bort all användardata i rätt ordning
  await admin.from('pass_responsible').delete().eq('profile_id', id)
  await admin.from('profile_groups').delete().eq('profile_id', id)
  await admin.from('notif_settings').delete().eq('profile_id', id)
  await admin.from('notifications').delete().eq('user_id', id)
  await admin.from('bookings').delete().eq('profile_id', id)
  await admin.from('profiles').delete().eq('id', id)

  // Ta bort auth-användaren sist
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

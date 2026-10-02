import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deletePersonData } from '@/lib/gdpr'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: owner, error: ownerError } = await supabase.rpc('is_system_super_admin')
  if (ownerError) return NextResponse.json({ error: 'Behörigheten kunde inte verifieras' }, { status: 503 })
  if (owner) return NextResponse.json({ error: 'Systemägarkontot kan inte raderas här' }, { status: 403 })

  const admin = createAdminClient()
  await deletePersonData(admin, user.id)

  // Ta bort inloggningen sist, permanent (ingen soft delete)
  const { error } = await admin.auth.admin.deleteUser(user.id, false)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

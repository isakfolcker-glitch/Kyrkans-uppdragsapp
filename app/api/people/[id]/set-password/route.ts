import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { passwordError } from '@/lib/passwordPolicy'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  if (!caller || !['forsamling', 'pastorat', 'super'].includes(caller.admin_level)) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const { password } = await req.json()
  const pwErr = passwordError(password ?? '')
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(id, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

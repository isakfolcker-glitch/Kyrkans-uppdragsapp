import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminChurch } from '@/lib/membershipAuth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { id } = await params
  const { password, church_id } = await req.json()
  const churchId = Number(church_id)

  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Församling krävs' }, { status: 400 })
  }
  if (!(await canAdminChurch(supabase, churchId))) {
    return NextResponse.json({ error: 'Saknar behörighet i församlingen' }, { status: 403 })
  }
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from('profile_churches')
    .select('profile_id')
    .eq('profile_id', id)
    .eq('church_id', churchId)
    .eq('active', true)
    .maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: 'Personen tillhör inte den församlingen' }, { status: 404 })
  }

  const { error } = await admin.auth.admin.updateUserById(id, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

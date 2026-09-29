import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const requestedChurchId = body.church_id ? Number(body.church_id) : null

  let query = supabase
    .from('profile_churches')
    .select('church_id')
    .eq('profile_id', user.id)
    .eq('active', true)

  if (requestedChurchId) query = query.eq('church_id', requestedChurchId)

  const { data: memberships, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!memberships?.length) {
    return NextResponse.json({ error: 'Ingen aktiv församlingsinbjudan hittades' }, { status: 403 })
  }

  const admin = createAdminClient()
  let update = admin
    .from('profile_churches')
    .update({ accepted_at: new Date().toISOString() })
    .eq('profile_id', user.id)
    .eq('active', true)

  if (requestedChurchId) update = update.eq('church_id', requestedChurchId)

  const { error: updateError } = await update
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

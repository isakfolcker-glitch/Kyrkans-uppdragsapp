import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/** Den inloggade avböjer sin EGEN väntande inbjudan till en församling. */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const churchId = Number(body?.church_id)
  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Församling krävs' }, { status: 400 })
  }

  // Service role, men bara den inloggades egna väntande rad.
  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('profile_churches')
    .update({ active: false })
    .eq('profile_id', user.id)
    .eq('church_id', churchId)
    .eq('active', true)
    .is('accepted_at', null)
    .select('church_id')
  if (error) return NextResponse.json({ error: `Kunde inte avböja: ${error.message}` }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'Ingen väntande inbjudan hittades' }, { status: 404 })

  return NextResponse.json({ ok: true })
}

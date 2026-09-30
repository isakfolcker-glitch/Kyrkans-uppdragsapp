import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Den inloggade accepterar sina EGNA väntande inbjudningar (active = true,
 * accepted_at = null). Med church_id bara den församlingen, annars alla egna
 * väntande (används efter onboarding). Aldrig någon annans medlemskap.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const requestedChurchId = body?.church_id != null ? Number(body.church_id) : null
  if (requestedChurchId !== null && (!requestedChurchId || Number.isNaN(requestedChurchId))) {
    return NextResponse.json({ error: 'Ogiltig församling' }, { status: 400 })
  }

  // Service role, men alltid avgränsat till den inloggades egna rader.
  const admin = createAdminClient()
  let query = admin
    .from('profile_churches')
    .select('church_id, accepted_at')
    .eq('profile_id', user.id)
    .eq('active', true)
  if (requestedChurchId) query = query.eq('church_id', requestedChurchId)

  const { data: memberships, error } = await query
  if (error) return NextResponse.json({ error: `Kunde inte läsa inbjudningar: ${error.message}` }, { status: 500 })
  if (!memberships?.length) {
    return NextResponse.json({ error: 'Ingen aktiv församlingsinbjudan hittades' }, { status: 403 })
  }

  const pendingIds = memberships.filter(m => m.accepted_at == null).map(m => m.church_id as number)
  if (!pendingIds.length) return NextResponse.json({ ok: true, accepted: [] })

  const { error: updateError } = await admin
    .from('profile_churches')
    .update({ accepted_at: new Date().toISOString() })
    .eq('profile_id', user.id)
    .eq('active', true)
    .is('accepted_at', null)
    .in('church_id', pendingIds)
  if (updateError) return NextResponse.json({ error: `Kunde inte acceptera: ${updateError.message}` }, { status: 500 })

  return NextResponse.json({ ok: true, accepted: pendingIds })
}

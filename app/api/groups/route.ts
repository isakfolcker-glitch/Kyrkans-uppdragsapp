import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminChurch, hasStaffPermission } from '@/lib/membershipAuth'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json()
  const churchId = Number(body.church_id)
  if (!churchId || Number.isNaN(churchId) || !body.label?.trim()) {
    return NextResponse.json({ error: 'Gruppnamn och församling krävs' }, { status: 400 })
  }

  const allowed = await canAdminChurch(supabase, churchId)
    || await hasStaffPermission(supabase, user.id, churchId, 'kan_hantera_grupper')
  if (!allowed) return NextResponse.json({ error: 'Saknar behörighet i församlingen' }, { status: 403 })

  const id = body.label.trim().toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/\s+/g, '_') + '_' + Date.now()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('groups')
    .insert({ id, label: body.label.trim(), cls: body.cls, church_id: churchId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

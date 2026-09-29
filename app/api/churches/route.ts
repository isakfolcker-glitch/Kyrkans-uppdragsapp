import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canAdminChurch, isSystemSuperAdmin } from '@/lib/membershipAuth'

async function callerPastoratId(userId: string) {
  const admin = createAdminClient()
  const { data: memberships } = await admin
    .from('profile_churches')
    .select('church_id, admin_level, churches!inner(pastorat_id)')
    .eq('profile_id', userId)
    .eq('active', true)
    .eq('admin_level', 'pastorat')

  for (const membership of memberships ?? []) {
    const church = Array.isArray((membership as any).churches)
      ? (membership as any).churches[0]
      : (membership as any).churches
    if (church?.pastorat_id) return Number(church.pastorat_id)
  }
  return null
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json()
  const admin = createAdminClient()
  const superAdmin = await isSystemSuperAdmin(supabase)
  const pastoratId = superAdmin
    ? (body.pastorat_id ? Number(body.pastorat_id) : null)
    : await callerPastoratId(user.id)

  if (!superAdmin && !pastoratId) {
    return NextResponse.json({ error: 'Saknar pastoratsbehörighet' }, { status: 403 })
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
  }

  const { data, error } = await admin
    .from('churches')
    .insert({
      name: body.name.trim(),
      admin_name: body.admin || null,
      tel: body.tel || null,
      address: body.address || null,
      pastorat_id: pastoratId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

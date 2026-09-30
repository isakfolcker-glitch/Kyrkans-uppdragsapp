import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isSystemSuperAdmin } from '@/lib/membershipAuth'

/** Pastorat där anroparen har pastoratsnivå i ett aktivt medlemskap. */
async function callerPastoratIds(userId: string): Promise<number[]> {
  const admin = createAdminClient()
  const { data: memberships } = await admin
    .from('profile_churches')
    .select('church_id, admin_level, churches!inner(pastorat_id)')
    .eq('profile_id', userId)
    .eq('active', true)
    .eq('admin_level', 'pastorat')

  const ids = new Set<number>()
  for (const membership of memberships ?? []) {
    const church = Array.isArray((membership as any).churches)
      ? (membership as any).churches[0]
      : (membership as any).churches
    if (church?.pastorat_id) ids.add(Number(church.pastorat_id))
  }
  return Array.from(ids)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json()
  const superAdmin = await isSystemSuperAdmin(supabase)

  // Superadmin väljer pastorat fritt. En pastoratsadmin skapar alltid församlingen
  // i sitt eget pastorat; servern sätter pastorat_id, aldrig klienten.
  let pastoratId: number | null
  if (superAdmin) {
    pastoratId = body.pastorat_id ? Number(body.pastorat_id) : null
    if (pastoratId !== null && Number.isNaN(pastoratId)) {
      return NextResponse.json({ error: 'Ogiltigt pastorat' }, { status: 400 })
    }
  } else {
    const own = await callerPastoratIds(user.id)
    if (!own.length) {
      return NextResponse.json({ error: 'Saknar pastoratsbehörighet. Din församling kan sakna pastorat, kontakta superadmin.' }, { status: 403 })
    }
    const requested = body.pastorat_id ? Number(body.pastorat_id) : null
    if (requested !== null) {
      if (!own.includes(requested)) {
        return NextResponse.json({ error: 'Du kan bara skapa församlingar i ditt eget pastorat' }, { status: 403 })
      }
      pastoratId = requested
    } else if (own.length === 1) {
      pastoratId = own[0]
    } else {
      return NextResponse.json({ error: 'Välj vilket av dina pastorat församlingen ska höra till' }, { status: 400 })
    }
  }

  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
  }

  const admin = createAdminClient()
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

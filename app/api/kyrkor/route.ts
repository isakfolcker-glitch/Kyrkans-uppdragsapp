import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAdminChurch, churchLevel, levelRank, unauthorized, forbidden } from '@/lib/authz'

export async function GET() {
  const { caller, supabase } = await getCaller()
  if (!caller) return unauthorized()
  const { data, error } = await supabase.from('kyrkor').select('*').order('forsamling_id').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const body = await req.json()
  const churchId = Number(body.forsamling_id)
  if (!churchId || Number.isNaN(churchId)) return NextResponse.json({ error: 'Församling krävs' }, { status: 400 })
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || name.length > 200) return NextResponse.json({ error: 'Namn krävs (högst 200 tecken)' }, { status: 400 })

  // Admin för just den församlingen, med pastoratsnivå som tidigare.
  if (!(await canAdminChurch(caller, churchId)) || levelRank(await churchLevel(caller, churchId)) < 2) {
    return forbidden('Saknar behörighet för församlingen')
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('kyrkor')
    .insert({ name, address: typeof body.address === 'string' && body.address.trim() ? body.address.trim() : null, forsamling_id: churchId })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const churchId = req.nextUrl.searchParams.get('church_id')

  let query = supabase
    .from('passes')
    .select(`*, pass_groups(group_id), pass_responsible(profile_id), bookings(*, profiles(name, ini, av_color, ac_color)), pass_history(entry, created_at)`)
    .order('created_at', { ascending: false })

  if (churchId) query = query.eq('church_id', parseInt(churchId))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json()
  const { title, church_id, date_str, time_str, plats, spots, vk, tel, description, pub_status, pub_date, kiosk_visible, groups, responsible_ids } = body

  const { data: pass, error } = await supabase.from('passes').insert({
    title, church_id, date_str, time_str, plats, spots, vk, tel, description,
    pub_status: pub_status || 'live', pub_date: pub_date || '',
    kiosk_visible: kiosk_visible || false, created_by: user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Lägg till grupper
  if (groups?.length) {
    await supabase.from('pass_groups').insert(groups.map((g: string) => ({ pass_id: pass.id, group_id: g })))
  }

  // Lägg till ansvariga
  if (responsible_ids?.length) {
    await supabase.from('pass_responsible').insert(responsible_ids.map((id: string) => ({ pass_id: pass.id, profile_id: id })))
  }

  // Logg
  await supabase.from('pass_history').insert({ pass_id: pass.id, entry: `Skapades – Idag` })

  return NextResponse.json(pass)
}

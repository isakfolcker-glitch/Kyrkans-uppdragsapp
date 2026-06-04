import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNewPassNotice } from '@/lib/email'

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

  if (!church_id || isNaN(Number(church_id))) {
    return NextResponse.json({ error: `Ogiltigt kyrk-ID: ${church_id}. Ladda om sidan och försök igen.` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: pass, error } = await admin.from('passes').insert({
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

  // Skicka mail till alla i passets grupper (om pub_status är live)
  if ((pub_status || 'live') === 'live' && groups?.length) {
    const admin = createAdminClient()
    // Hämta e-postadresser för alla i de valda grupperna, i den kyrkan
    const { data: members } = await admin
      .from('profile_groups')
      .select('profiles!inner(email, notif_settings(nyttpass))')
      .in('group_id', groups)

    const emails = (members ?? [])
      .map((m: any) => m.profiles)
      .filter((p: any) => p?.email && p?.notif_settings?.[0]?.nyttpass !== false)
      .map((p: any) => p.email)

    if (emails.length) {
      await sendNewPassNotice({
        to: emails, passTitle: title,
        date: date_str, time: time_str, plats: plats || '',
        groups: groups,
      }).catch(() => {}) // skicka asynkront, stoppa inte svaret
    }
  }

  return NextResponse.json(pass)
}

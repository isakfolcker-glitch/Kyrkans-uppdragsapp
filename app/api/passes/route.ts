import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNewPassNotice } from '@/lib/email'
import { getCaller, canAdminChurch, hasStaffPermission, filterGroupsForChurch, unauthorized, forbidden } from '@/lib/authz'

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
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const body = await req.json()
  const { title, church_id, date_str, time_str, plats, spots, vk, tel, vk_profile_id, description, pub_status, pub_date, kiosk_visible, groups, responsible_ids } = body

  if (!church_id || isNaN(Number(church_id))) {
    return NextResponse.json({ error: `Ogiltigt kyrk-ID: ${church_id}. Ladda om sidan och försök igen.` }, { status: 400 })
  }
  const churchId = Number(church_id)

  // Admin för församlingen, eller anställd med behörigheten "skapa pass" i sin egen församling
  const allowed = await canAdminChurch(caller, churchId)
    || (caller.churchId === churchId && await hasStaffPermission(caller, 'kan_skapa_pass'))
  if (!allowed) return forbidden('Du får inte skapa pass i den här församlingen.')

  const admin = createAdminClient()
  const { data: pass, error } = await admin.from('passes').insert({
    title, church_id: churchId, date_str, time_str, plats, spots, vk, tel, vk_profile_id: vk_profile_id || null, description,
    pub_status: pub_status || 'live', pub_date: pub_date || '',
    kiosk_visible: kiosk_visible || false, created_by: caller.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Bara grupper och ansvariga som hör till passets församling
  const passGroups = await filterGroupsForChurch(groups, churchId)
  if (passGroups.length) {
    await admin.from('pass_groups').insert(passGroups.map(g => ({ pass_id: pass.id, group_id: g })))
  }

  if (Array.isArray(responsible_ids) && responsible_ids.length) {
    const { data: okProfiles } = await admin.from('profiles').select('id').in('id', responsible_ids).eq('church_id', churchId)
    const ids = (okProfiles ?? []).map(p => p.id)
    if (ids.length) await admin.from('pass_responsible').insert(ids.map(id => ({ pass_id: pass.id, profile_id: id })))
  }

  await admin.from('pass_history').insert({ pass_id: pass.id, entry: `Skapades – Idag` })

  // Mail till alla i passets grupper i samma församling (om passet är publicerat)
  if ((pub_status || 'live') === 'live' && passGroups.length) {
    const { data: members } = await admin
      .from('profile_groups')
      .select('profiles!inner(email, church_id, notif_settings(nyttpass))')
      .in('group_id', passGroups)
      .eq('profiles.church_id', churchId)

    type Member = { profiles: { email: string | null; notif_settings?: { nyttpass: boolean | null }[] } | null }
    const emails = Array.from(new Set(((members ?? []) as unknown as Member[])
      .map(m => m.profiles)
      .filter(p => p?.email && p?.notif_settings?.[0]?.nyttpass !== false)
      .map(p => p!.email as string)))

    if (emails.length) {
      await sendNewPassNotice({
        to: emails, passTitle: title,
        date: date_str, time: time_str, plats: plats || '',
        groups: passGroups,
      }).catch(() => {})
    }
  }

  return NextResponse.json(pass)
}

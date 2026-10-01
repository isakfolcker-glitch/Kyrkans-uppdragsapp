import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendNewPassNotice } from '@/lib/email'
import { getCaller, canAdminChurch, hasStaffPermission, filterMembersOfChurch } from '@/lib/authz'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const churchId = req.nextUrl.searchParams.get('church_id')

  let query = supabase
    .from('passes')
    .select('*, pass_groups(group_id), pass_responsible(profile_id), bookings(*, profiles(name, ini, av_color, ac_color)), pass_history(entry, created_at)')
    .order('created_at', { ascending: false })

  if (churchId) query = query.eq('church_id', Number(churchId))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json()
  const {
    title, church_id, date_str, time_str, plats, spots, vk, tel, vk_profile_id,
    description, pub_status, pub_date, kiosk_visible, groups = [], responsible_ids = [],
  } = body
  const churchId = Number(church_id)

  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Ogiltig församling' }, { status: 400 })
  }
  if (!title?.trim() || !date_str || !time_str || !plats?.trim() || !Number(spots)) {
    return NextResponse.json({ error: 'Titel, datum, tid, plats och antal platser krävs' }, { status: 400 })
  }

  // Admin för passets församling, eller anställd med "skapa pass" i just den församlingen.
  const { caller } = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })
  const allowed = (await canAdminChurch(caller, churchId))
    || (await hasStaffPermission(caller, 'kan_skapa_pass', churchId))
  if (!allowed) {
    return NextResponse.json({ error: 'Saknar behörighet att skapa pass i församlingen' }, { status: 403 })
  }
  if (!Array.isArray(groups) || !Array.isArray(responsible_ids)) {
    return NextResponse.json({ error: 'Grupper och ansvariga måste vara listor' }, { status: 400 })
  }

  const admin = createAdminClient()

  if (groups.length) {
    const { data: validGroups } = await admin
      .from('groups')
      .select('id')
      .eq('church_id', churchId)
      .in('id', groups)
    const validIds = new Set((validGroups ?? []).map(group => group.id))
    if (groups.some((groupId: string) => !validIds.has(groupId))) {
      return NextResponse.json({ error: 'En eller flera grupper tillhör inte vald församling' }, { status: 400 })
    }
  }

  if (responsible_ids.length) {
    const validIds = await filterMembersOfChurch(responsible_ids, churchId)
    if (responsible_ids.some((profileId: string) => !validIds.has(profileId))) {
      return NextResponse.json({ error: 'En eller flera ansvariga tillhör inte vald församling' }, { status: 400 })
    }
  }

  if (vk_profile_id) {
    const validVk = await filterMembersOfChurch([vk_profile_id], churchId)
    if (!validVk.has(vk_profile_id)) {
      return NextResponse.json({ error: 'Vaktmästaren tillhör inte vald församling' }, { status: 400 })
    }
  }

  const { data: pass, error } = await admin.from('passes').insert({
    title: title.trim(),
    church_id: churchId,
    date_str,
    time_str,
    plats: plats.trim(),
    spots: Number(spots),
    vk: vk || '',
    tel: tel || '',
    vk_profile_id: vk_profile_id || null,
    description: description || '',
    pub_status: pub_status || 'live',
    pub_date: pub_date || '',
    kiosk_visible: Boolean(kiosk_visible),
    created_by: caller.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (groups.length) {
    const { error: groupError } = await admin
      .from('pass_groups')
      .insert(groups.map((groupId: string) => ({ pass_id: pass.id, group_id: groupId })))
    if (groupError) return NextResponse.json({ error: groupError.message }, { status: 500 })
  }

  if (responsible_ids.length) {
    const { error: responsibleError } = await admin
      .from('pass_responsible')
      .insert(responsible_ids.map((profileId: string) => ({ pass_id: pass.id, profile_id: profileId })))
    if (responsibleError) return NextResponse.json({ error: responsibleError.message }, { status: 500 })
  }

  await admin.from('pass_history').insert({ pass_id: pass.id, entry: 'Skapades - Idag' })

  if ((pub_status || 'live') === 'live' && groups.length) {
    const { data: memberships } = await admin
      .from('profile_churches')
      .select('profile_id, profiles!inner(email, notif_settings(nyttpass), profile_groups(group_id))')
      .eq('church_id', churchId)
      .eq('active', true)
      .not('accepted_at', 'is', null)

    const emails = Array.from(new Set(
      (memberships ?? []).flatMap((membership: any) => {
        const memberProfile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles
        const memberGroups = memberProfile?.profile_groups?.map((item: any) => item.group_id) ?? []
        const wantsNotice = memberProfile?.notif_settings?.[0]?.nyttpass !== false
        return wantsNotice && memberProfile?.email && memberGroups.some((groupId: string) => groups.includes(groupId))
          ? [memberProfile.email]
          : []
      })
    ))

    if (emails.length) {
      await sendNewPassNotice({
        to: emails,
        passTitle: title.trim(),
        date: date_str,
        time: time_str,
        plats: plats.trim(),
        groups,
      }).catch(() => {})
    }
  }

  return NextResponse.json(pass)
}

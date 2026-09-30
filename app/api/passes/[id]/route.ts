import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCancellationNotice, sendPassChangeNotice } from '@/lib/email'
import { getCaller, canAdminChurch, filterMembersOfChurch, type Caller } from '@/lib/authz'

// Bara dessa fält får ändras. church_id, created_by, filled och cancelled
// (cancelled hanteras separat nedan) ändras aldrig direkt härifrån.
const EDITABLE = [
  'title', 'date_str', 'time_str', 'plats', 'spots', 'vk', 'tel', 'vk_profile_id',
  'description', 'pub_status', 'pub_date', 'kiosk_visible',
] as const

/** Admin för passets församling eller ansvarig för passet. */
async function canEditPass(caller: Caller, churchId: number, passId: number) {
  if (await canAdminChurch(caller, churchId)) return true

  const admin = createAdminClient()
  const { data: responsible } = await admin
    .from('pass_responsible')
    .select('profile_id')
    .eq('pass_id', passId)
    .eq('profile_id', caller.id)
    .maybeSingle()
  return Boolean(responsible)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const passId = Number(id)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('passes')
    .select('*, bookings(profile_id, name, mail)')
    .eq('id', passId)
    .single()
  if (!existing) return NextResponse.json({ error: 'Hittar inte passet' }, { status: 404 })

  const { caller } = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })
  if (!(await canEditPass(caller, existing.church_id, passId))) {
    return NextResponse.json({ error: 'Saknar behörighet att ändra passet' }, { status: 403 })
  }

  const body = await req.json()
  const { cancelled, groups, responsible_ids } = body
  const rest: Record<string, any> = {}
  for (const key of EDITABLE) if (key in body) rest[key] = body[key]

  if (groups !== undefined && !Array.isArray(groups)) {
    return NextResponse.json({ error: 'Grupper måste vara en lista' }, { status: 400 })
  }
  if (responsible_ids !== undefined && !Array.isArray(responsible_ids)) {
    return NextResponse.json({ error: 'Ansvariga måste vara en lista' }, { status: 400 })
  }

  if (rest.vk_profile_id) {
    const validVk = await filterMembersOfChurch([rest.vk_profile_id], existing.church_id)
    if (!validVk.has(rest.vk_profile_id)) {
      return NextResponse.json({ error: 'Vaktmästaren tillhör inte passets församling' }, { status: 400 })
    }
  }

  if (groups !== undefined && groups.length) {
    const { data: validGroups } = await admin
      .from('groups')
      .select('id')
      .eq('church_id', existing.church_id)
      .in('id', groups)
    const validIds = new Set((validGroups ?? []).map(group => group.id))
    if (groups.some((groupId: string) => !validIds.has(groupId))) {
      return NextResponse.json({ error: 'En eller flera grupper tillhör inte passets församling' }, { status: 400 })
    }
  }

  if (responsible_ids !== undefined) {
    // Bara admin för församlingen får ändra vilka som är ansvariga.
    const canManageResponsibles = await canAdminChurch(caller, existing.church_id)
    if (!canManageResponsibles) {
      return NextResponse.json({ error: 'Saknar behörighet att ändra ansvariga' }, { status: 403 })
    }

    if (responsible_ids.length) {
      const validIds = await filterMembersOfChurch(responsible_ids, existing.church_id)
      if (responsible_ids.some((profileId: string) => !validIds.has(profileId))) {
        return NextResponse.json({ error: 'En eller flera ansvariga tillhör inte passets församling' }, { status: 400 })
      }
    }
  }

  if (Object.keys(rest).length) {
    const { error } = await admin.from('passes').update(rest).eq('id', passId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (groups !== undefined) {
    await admin.from('pass_groups').delete().eq('pass_id', passId)
    if (groups.length) {
      const { error } = await admin.from('pass_groups').insert(
        groups.map((groupId: string) => ({ pass_id: passId, group_id: groupId }))
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (responsible_ids !== undefined) {
    await admin.from('pass_responsible').delete().eq('pass_id', passId)
    if (responsible_ids.length) {
      const { error } = await admin.from('pass_responsible').insert(
        responsible_ids.map((profileId: string) => ({ pass_id: passId, profile_id: profileId }))
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  if (cancelled === true && !existing.cancelled) {
    await admin.from('passes').update({ cancelled: true }).eq('id', passId)
    await admin.from('pass_history').insert({ pass_id: passId, entry: 'Ställdes in - Idag' })
    const bookingsWithMail = existing.bookings?.filter((booking: any) => booking.mail) ?? []
    await Promise.all(bookingsWithMail.map((booking: any) =>
      sendCancellationNotice({
        to: booking.mail,
        name: booking.name,
        passTitle: existing.title,
        date: existing.date_str,
      }).catch(() => {})
    ))
  }

  const dateChanged = rest.date_str && rest.date_str !== existing.date_str
  const timeChanged = rest.time_str && rest.time_str !== existing.time_str
  const placeChanged = rest.plats && rest.plats !== existing.plats

  if ((dateChanged || timeChanged || placeChanged) && existing.bookings?.length) {
    await admin.from('pass_history').insert({ pass_id: passId, entry: 'Datum/tid/plats uppdaterades - Idag' })
    const bookingsWithMail = existing.bookings.filter((booking: any) => booking.mail)
    await Promise.all(bookingsWithMail.map((booking: any) =>
      sendPassChangeNotice({
        to: booking.mail,
        name: booking.name,
        passTitle: rest.title || existing.title,
        date: rest.date_str || existing.date_str,
        time: rest.time_str || existing.time_str,
        plats: rest.plats || existing.plats,
      }).catch(() => {})
    ))
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const passId = Number(id)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const admin = createAdminClient()
  const { data: pass } = await admin.from('passes').select('church_id').eq('id', passId).single()
  if (!pass) return NextResponse.json({ error: 'Passet finns inte' }, { status: 404 })

  // Bara admin för passets församling får ta bort pass.
  const { caller } = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })
  if (!(await canAdminChurch(caller, pass.church_id))) return NextResponse.json({ error: 'Saknar behörighet att ta bort passet' }, { status: 403 })

  const { error } = await admin.from('passes').delete().eq('id', passId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

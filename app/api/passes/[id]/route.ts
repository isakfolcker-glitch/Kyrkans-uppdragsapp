import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCancellationNotice, sendPassChangeNotice } from '@/lib/email'
import { canAdminChurch, hasStaffPermission } from '@/lib/membershipAuth'

async function canEditPass(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  churchId: number,
  passId: number,
) {
  if (await canAdminChurch(supabase, churchId)) return true
  if (await hasStaffPermission(supabase, userId, churchId, 'kan_redigera_pass')) return true

  const { data: responsible } = await supabase
    .from('pass_responsible')
    .select('profile_id')
    .eq('pass_id', passId)
    .eq('profile_id', userId)
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

  if (!(await canEditPass(supabase, user.id, existing.church_id, passId))) {
    return NextResponse.json({ error: 'Saknar behörighet att ändra passet' }, { status: 403 })
  }

  const body = await req.json()
  const { cancelled, groups, responsible_ids, church_id: ignoredChurchId, ...rest } = body

  if (groups !== undefined) {
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
    const canManageResponsibles = await canAdminChurch(supabase, existing.church_id)
      || await hasStaffPermission(supabase, user.id, existing.church_id, 'kan_redigera_pass')
    if (!canManageResponsibles) {
      return NextResponse.json({ error: 'Saknar behörighet att ändra ansvariga' }, { status: 403 })
    }

    if (responsible_ids.length) {
      const { data: validResponsibles } = await admin
        .from('profile_churches')
        .select('profile_id')
        .eq('church_id', existing.church_id)
        .eq('active', true)
        .in('profile_id', responsible_ids)
      const validIds = new Set((validResponsibles ?? []).map(row => row.profile_id))
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

  const allowed = await canAdminChurch(supabase, pass.church_id)
    || await hasStaffPermission(supabase, user.id, pass.church_id, 'kan_redigera_pass')
  if (!allowed) return NextResponse.json({ error: 'Saknar behörighet att ta bort passet' }, { status: 403 })

  const { error } = await admin.from('passes').delete().eq('id', passId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

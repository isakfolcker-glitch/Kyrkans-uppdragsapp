import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBookingConfirmation } from '@/lib/email'
import { promoteFromWaitlist } from '@/app/api/waitlist/route'
import { isLockedForSelfCancel } from '@/lib/passTiming'
import { canAccessChurch, canAdminChurch, hasStaffPermission } from '@/lib/membershipAuth'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const {
    pass_id, name, mail, tel, source, no_account, ini, av_color, ac_color, override_profile_id,
  } = await req.json()

  const admin = createAdminClient()
  const { data: pass } = await admin
    .from('passes')
    .select('id, church_id, spots, filled, title, date_str, time_str, plats, vk, tel')
    .eq('id', pass_id)
    .single()

  if (!pass) return NextResponse.json({ error: 'Passet finns inte' }, { status: 404 })
  if (!(await canAccessChurch(supabase, pass.church_id))) {
    return NextResponse.json({ error: 'Du har inte tillgång till passets församling' }, { status: 403 })
  }
  if (pass.filled >= pass.spots) return NextResponse.json({ error: 'Fullbokat' }, { status: 409 })

  const { data: responsible } = await supabase
    .from('pass_responsible')
    .select('profile_id')
    .eq('pass_id', pass_id)
    .eq('profile_id', user.id)
    .maybeSingle()

  const canManageBookings = await canAdminChurch(supabase, pass.church_id)
    || await hasStaffPermission(supabase, user.id, pass.church_id, 'kan_hantera_bokningar')
    || Boolean(responsible)

  let profileId: string | null = user.id
  if (override_profile_id) {
    if (!canManageBookings) {
      return NextResponse.json({ error: 'Saknar behörighet att tilldela andra personer' }, { status: 403 })
    }
    const { data: targetMembership } = await admin
      .from('profile_churches')
      .select('profile_id')
      .eq('profile_id', override_profile_id)
      .eq('church_id', pass.church_id)
      .eq('active', true)
      .maybeSingle()
    if (!targetMembership) {
      return NextResponse.json({ error: 'Personen tillhör inte passets församling' }, { status: 400 })
    }
    profileId = override_profile_id
  } else if (no_account) {
    if (!canManageBookings) {
      return NextResponse.json({ error: 'Saknar behörighet för bokning utan konto' }, { status: 403 })
    }
    profileId = null
  }

  if (profileId) {
    const { data: existing } = await admin
      .from('bookings')
      .select('id')
      .eq('pass_id', pass_id)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'Personen är redan bokad' }, { status: 409 })
  }

  const { data: booking, error } = await admin.from('bookings').insert({
    pass_id,
    profile_id: profileId,
    name,
    mail: mail || '',
    tel: tel || '',
    source: source || 'app',
    no_account: Boolean(no_account),
    ini: ini || '',
    av_color: av_color || '#EEEDFE',
    ac_color: ac_color || '#3C3489',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (mail) {
    await sendBookingConfirmation({
      to: mail,
      name,
      passTitle: pass.title,
      date: pass.date_str,
      time: pass.time_str,
      plats: pass.plats,
      vk: pass.vk,
      tel: pass.tel,
    }).catch(() => {})
  }

  if (profileId) {
    await admin.from('notifications').insert({
      user_id: profileId,
      type: 'signup',
      title: `Du är uppsatt: ${pass.title}`,
      body: `${pass.date_str} kl ${pass.time_str} - ${pass.plats}`,
    })
  }

  return NextResponse.json(booking)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { booking_id } = await req.json()
  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('bookings')
    .select('id, profile_id, pass_id, passes!inner(church_id, date_str, time_str)')
    .eq('id', booking_id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Bokningen finns inte' }, { status: 404 })

  const rawPass = Array.isArray((booking as any).passes)
    ? (booking as any).passes[0]
    : (booking as any).passes
  const churchId = rawPass?.church_id
  if (!churchId) return NextResponse.json({ error: 'Passets församling saknas' }, { status: 500 })

  const isOwner = booking.profile_id === user.id
  const { data: responsible } = await admin
    .from('pass_responsible')
    .select('profile_id')
    .eq('pass_id', booking.pass_id)
    .eq('profile_id', user.id)
    .maybeSingle()

  const canManage = await canAdminChurch(supabase, churchId)
    || await hasStaffPermission(supabase, user.id, churchId, 'kan_hantera_bokningar')
    || Boolean(responsible)

  if (!isOwner && !canManage) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  if (isOwner && !canManage && isLockedForSelfCancel(rawPass.date_str, rawPass.time_str)) {
    return NextResponse.json({
      error: 'Passet börjar inom 24 timmar och går inte längre att avboka själv. Kontakta ansvarig.',
    }, { status: 403 })
  }

  const { error } = await admin.from('bookings').delete().eq('id', booking_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await promoteFromWaitlist(booking.pass_id).catch(() => {})

  return NextResponse.json({ ok: true })
}

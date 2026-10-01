import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBookingConfirmation } from '@/lib/email'
import { promoteFromWaitlist } from '@/app/api/waitlist/route'
import { isLockedForSelfCancel } from '@/lib/passTiming'
import { canAccessChurch } from '@/lib/membershipAuth'
import { getCaller, canAdminChurch, canAdminOrStaff, isKioskIn } from '@/lib/authz'

const KIOSK_AV = '#FFEBE1'
const KIOSK_AC = '#7D0037'
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
const TEL_RE = /^[0-9+\-\s()]*$/

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

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
    .select('id, church_id, spots, filled, title, date_str, time_str, plats, vk, tel, pub_status, cancelled, kiosk_visible')
    .eq('id', pass_id)
    .single()

  if (!pass) return NextResponse.json({ error: 'Passet finns inte' }, { status: 404 })
  if (!(await canAccessChurch(supabase, pass.church_id))) {
    return NextResponse.json({ error: 'Du har inte tillgång till passets församling' }, { status: 403 })
  }
  if (pass.filled >= pass.spots) return NextResponse.json({ error: 'Fullbokat' }, { status: 409 })

  // Admin för passets församling, anställd med kan_hantera_bokningar i den
  // församlingen eller ansvarig för passet kan boka in andra (manuellt eller
  // utan konto). Kioskkonton får bara boka utan konto (se nedan). Övriga kan
  // bara boka sig själva, och bekräftelsen går då bara till den egna adressen.
  const { caller } = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: responsible } = await admin
    .from('pass_responsible')
    .select('profile_id')
    .eq('pass_id', pass.id)
    .eq('profile_id', user.id)
    .maybeSingle()

  const canManageBookings = (await canAdminOrStaff(caller, 'kan_hantera_bokningar', pass.church_id))
    || Boolean(responsible)

  // Kioskkonto i passets församling: bara bokning utan konto på publicerade,
  // ej inställda pass som visas i kiosken. Inget annat.
  if (!canManageBookings && isKioskIn(caller, pass.church_id)) {
    if (no_account !== true || override_profile_id) {
      return NextResponse.json({ error: 'Kioskkontot kan bara boka utan konto' }, { status: 403 })
    }
    if (pass.pub_status !== 'live' || pass.cancelled || pass.kiosk_visible !== true) {
      return NextResponse.json({ error: 'Passet går inte att boka i kiosken' }, { status: 403 })
    }

    const kioskName = typeof name === 'string' ? name.trim() : ''
    const kioskMail = typeof mail === 'string' ? mail.trim().toLowerCase() : ''
    const kioskTel = typeof tel === 'string' ? tel.trim() : ''
    if (!kioskName || kioskName.length > 100) {
      return NextResponse.json({ error: 'Ange ett namn (högst 100 tecken).' }, { status: 400 })
    }
    if (mail != null && typeof mail !== 'string') return NextResponse.json({ error: 'Ogiltig e-post' }, { status: 400 })
    if (kioskMail && (kioskMail.length > 254 || !EMAIL_RE.test(kioskMail))) {
      return NextResponse.json({ error: 'Ogiltig e-postadress.' }, { status: 400 })
    }
    if (tel != null && typeof tel !== 'string') return NextResponse.json({ error: 'Ogiltigt telefonnummer' }, { status: 400 })
    if (kioskTel.length > 30 || !TEL_RE.test(kioskTel)) {
      return NextResponse.json({ error: 'Ogiltigt telefonnummer.' }, { status: 400 })
    }

    const { data: kioskBooking, error: kioskErr } = await admin.from('bookings').insert({
      pass_id: pass.id,
      profile_id: null,
      name: kioskName,
      mail: kioskMail,
      tel: kioskTel,
      source: 'kiosk',
      no_account: true,
      ini: initials(kioskName),
      av_color: KIOSK_AV,
      ac_color: KIOSK_AC,
    }).select().single()
    if (kioskErr) return NextResponse.json({ error: `Kunde inte spara bokningen: ${kioskErr.message}` }, { status: 500 })

    if (kioskMail) {
      await sendBookingConfirmation({
        to: kioskMail,
        name: kioskName,
        passTitle: pass.title,
        date: pass.date_str,
        time: pass.time_str,
        plats: pass.plats,
        vk: pass.vk,
        tel: pass.tel,
      }).catch(() => {})
    }
    return NextResponse.json(kioskBooking)
  }

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
      .not('accepted_at', 'is', null)
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

  const bookingForOther = profileId !== user.id

  // Egen bokning: bara på publicerade pass som inte är inställda, och bara i en
  // församling där man är accepterad medlem (eller admin).
  if (!bookingForOther) {
    if (pass.pub_status !== 'live' || pass.cancelled) {
      return NextResponse.json({ error: 'Passet går inte att boka' }, { status: 403 })
    }
    const isMember = caller.memberships.some(m => m.churchId === Number(pass.church_id))
    if (!isMember && !(await canAdminChurch(caller, pass.church_id))) {
      return NextResponse.json({ error: 'Du har inte tillgång till passets församling' }, { status: 403 })
    }
  }
  // Bokar man sig själv används alltid den egna adressen och det egna namnet.
  const confirmMail = bookingForOther ? (typeof mail === 'string' ? mail.trim() : '') : (user.email ?? '')
  const bookingName = bookingForOther ? name : caller.name

  if (profileId) {
    const { data: existing } = await admin
      .from('bookings')
      .select('id')
      .eq('pass_id', pass.id)
      .eq('profile_id', profileId)
      .maybeSingle()
    if (existing) return NextResponse.json({ error: 'Personen är redan bokad' }, { status: 409 })
  }

  const { data: booking, error } = await admin.from('bookings').insert({
    pass_id: pass.id,
    profile_id: profileId,
    name: bookingName,
    mail: confirmMail,
    tel: tel || '',
    source: source || 'app',
    no_account: profileId === null,
    ini: ini || '',
    av_color: av_color || '#FFEBE1',
    ac_color: ac_color || '#7D0037',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Skicka bekräftelse om e-post finns (inte till interna platshållaradresser)
  if (confirmMail && !confirmMail.endsWith('@intern.local')) {
    await sendBookingConfirmation({
      to: confirmMail,
      name: bookingName,
      passTitle: pass.title,
      date: pass.date_str,
      time: pass.time_str,
      plats: pass.plats,
      vk: pass.vk,
      tel: pass.tel,
    }).catch(() => {}) // Tyst fel om mail misslyckas
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

  const { caller } = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })
  const canManage = (await canAdminOrStaff(caller, 'kan_hantera_bokningar', churchId))
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

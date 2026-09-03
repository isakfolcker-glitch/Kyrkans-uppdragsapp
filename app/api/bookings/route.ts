import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBookingConfirmation } from '@/lib/email'
import { promoteFromWaitlist } from '@/app/api/waitlist/route'
import { isLockedForSelfCancel } from '@/lib/passTiming'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { pass_id, name, mail, tel, source, no_account, ini, av_color, ac_color, override_profile_id } = await req.json()

  // Kolla att passet har plats
  const { data: pass } = await supabase.from('passes').select('spots, filled, title, date_str, time_str, plats, vk, tel').eq('id', pass_id).single()
  if (!pass) return NextResponse.json({ error: 'Passet finns inte' }, { status: 404 })
  if (pass.filled >= pass.spots) return NextResponse.json({ error: 'Fullbokat' }, { status: 409 })

  // Admin kan ange valfri profile_id (t.ex. vid manuell tilldelning)
  const { data: profile } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  const isAdmin = ['forsamling','pastorat','super'].includes(profile?.admin_level ?? '')
  const profileId = (isAdmin && override_profile_id) ? override_profile_id : (no_account ? null : user.id)

  const { data: booking, error } = await supabase.from('bookings').insert({
    pass_id, profile_id: profileId,
    name, mail: mail || '', tel: tel || '',
    source: source || 'app', no_account: no_account || false,
    ini: ini || '', av_color: av_color || '#EEEDFE', ac_color: ac_color || '#3C3489',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Skicka bekräftelse om e-post finns
  if (mail) {
    await sendBookingConfirmation({
      to: mail, name, passTitle: pass.title,
      date: pass.date_str, time: pass.time_str,
      plats: pass.plats, vk: pass.vk, tel: pass.tel,
    }).catch(() => {}) // Tyst fel om mail misslyckas
  }

  // Notis i appen till den som är uppsatt
  if (profileId) {
    const admin = createAdminClient()
    await admin.from('notifications').insert({
      user_id: profileId, type: 'signup',
      title: `Du är uppsatt: ${pass.title}`,
      body: `${pass.date_str} kl ${pass.time_str} – ${pass.plats}`,
    })
  }

  return NextResponse.json(booking)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { booking_id } = await req.json()

  // Verifiera att bokningen tillhör användaren (eller att de är admin/ansvarig — RLS hanterar det)
  const { data: booking } = await supabase.from('bookings').select('id, profile_id, pass_id').eq('id', booking_id).single()
  if (!booking) return NextResponse.json({ error: 'Bokningen finns inte' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  const isAdmin = ['forsamling','pastorat','super'].includes(profile?.admin_level ?? '')
  const isOwner = booking.profile_id === user.id
  const { data: responsible } = await supabase.from('pass_responsible').select('profile_id').eq('pass_id', booking.pass_id).eq('profile_id', user.id).maybeSingle()

  if (!isOwner && !isAdmin && !responsible) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  // Ideella kan inte avboka sig själva mindre än 24 timmar innan passet.
  // Admin och ansvarig får fortfarande hantera bokningar hela vägen fram.
  if (isOwner && !isAdmin && !responsible) {
    const { data: pass } = await supabase.from('passes').select('date_str, time_str').eq('id', booking.pass_id).single()
    if (pass && isLockedForSelfCancel(pass.date_str, pass.time_str)) {
      return NextResponse.json({ error: 'Passet börjar inom 24 timmar och går inte längre att avboka själv. Kontakta ansvarig.' }, { status: 403 })
    }
  }

  const { error } = await supabase.from('bookings').delete().eq('id', booking_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Promote first person in waitlist if spot opened
  await promoteFromWaitlist(booking.pass_id).catch(() => {})

  return NextResponse.json({ ok: true })
}

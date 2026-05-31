import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendBookingConfirmation } from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { pass_id, name, mail, tel, source, no_account, ini, av_color, ac_color } = await req.json()

  // Kolla att passet har plats
  const { data: pass } = await supabase.from('passes').select('spots, filled, title, date_str, time_str, plats, vk, tel').eq('id', pass_id).single()
  if (!pass) return NextResponse.json({ error: 'Passet finns inte' }, { status: 404 })
  if (pass.filled >= pass.spots) return NextResponse.json({ error: 'Fullbokat' }, { status: 409 })

  const { data: booking, error } = await supabase.from('bookings').insert({
    pass_id, profile_id: no_account ? null : user.id,
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

  return NextResponse.json(booking)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { booking_id } = await req.json()
  const { error } = await supabase.from('bookings').delete().eq('id', booking_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

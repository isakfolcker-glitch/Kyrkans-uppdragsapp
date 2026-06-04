import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWaitlistPromotion } from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { pass_id } = await req.json()

  const { data: pass } = await supabase.from('passes').select('id, spots, filled, title').eq('id', pass_id).single()
  if (!pass) return NextResponse.json({ error: 'Passet finns inte' }, { status: 404 })
  if (pass.filled < pass.spots) return NextResponse.json({ error: 'Passet har lediga platser' }, { status: 400 })

  const { data: profile } = await supabase.from('profiles').select('name, email').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profil saknas' }, { status: 400 })

  const { error } = await supabase.from('waitlist').insert({
    pass_id, profile_id: user.id, name: profile.name, mail: profile.email,
  })
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Redan i kön' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { pass_id } = await req.json()
  const { error } = await supabase.from('waitlist').delete().eq('pass_id', pass_id).eq('profile_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// Called internally after a booking is removed — promotes first in queue
export async function promoteFromWaitlist(passId: number) {
  const admin = createAdminClient()

  // Check if spot opened
  const { data: pass } = await admin.from('passes').select('id, spots, filled, title, date_str, time_str, plats, vk, tel').eq('id', passId).single()
  if (!pass || pass.filled >= pass.spots) return

  // Get first in line
  const { data: entry } = await admin.from('waitlist').select('*').eq('pass_id', passId).order('created_at').limit(1).single()
  if (!entry) return

  // Book them
  const { error: bookErr } = await admin.from('bookings').insert({
    pass_id: passId, profile_id: entry.profile_id,
    name: entry.name, mail: entry.mail, tel: '',
    source: 'app', no_account: false,
    ini: entry.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase(),
    av_color: '#EEEDFE', ac_color: '#3C3489',
  })
  if (bookErr) return

  // Remove from waitlist
  await admin.from('waitlist').delete().eq('id', entry.id)

  // Send email
  if (entry.mail) {
    await sendWaitlistPromotion({
      to: entry.mail, name: entry.name, passTitle: pass.title,
      date: pass.date_str, time: pass.time_str, plats: pass.plats,
      vk: pass.vk, tel: pass.tel,
    }).catch(() => {})
  }
}

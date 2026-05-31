import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendCancellationNotice, sendPassChangeNotice } from '@/lib/email'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json()
  const passId = parseInt(id)

  // Hämta befintligt pass
  const { data: existing } = await supabase.from('passes').select('*, bookings(profile_id, name, mail)').eq('id', passId).single()
  if (!existing) return NextResponse.json({ error: 'Hittar inte passet' }, { status: 404 })

  const { cancelled, groups, responsible_ids, ...rest } = body

  // Uppdatera passet
  const { error } = await supabase.from('passes').update(rest).eq('id', passId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Uppdatera grupper om de skickats med
  if (groups !== undefined) {
    await supabase.from('pass_groups').delete().eq('pass_id', passId)
    if (groups.length) await supabase.from('pass_groups').insert(groups.map((g: string) => ({ pass_id: passId, group_id: g })))
  }

  // Uppdatera ansvariga
  if (responsible_ids !== undefined) {
    await supabase.from('pass_responsible').delete().eq('pass_id', passId)
    if (responsible_ids.length) await supabase.from('pass_responsible').insert(responsible_ids.map((pid: string) => ({ pass_id: passId, profile_id: pid })))
  }

  // Skicka e-post vid inställning
  if (cancelled === true && !existing.cancelled) {
    await supabase.from('passes').update({ cancelled: true }).eq('id', passId)
    await supabase.from('pass_history').insert({ pass_id: passId, entry: 'Ställdes in – Idag' })
    const bookingsWithMail = existing.bookings?.filter((b: any) => b.mail) ?? []
    await Promise.all(bookingsWithMail.map((b: any) => sendCancellationNotice({ to: b.mail, name: b.name, passTitle: existing.title, date: existing.date_str })))
  }

  // Skicka e-post om datum/tid/plats ändrats
  const dateChanged = rest.date_str && rest.date_str !== existing.date_str
  const timeChanged = rest.time_str && rest.time_str !== existing.time_str
  const platsChanged = rest.plats && rest.plats !== existing.plats
  if ((dateChanged || timeChanged || platsChanged) && existing.bookings?.length) {
    await supabase.from('pass_history').insert({ pass_id: passId, entry: 'Datum/tid/plats uppdaterades – Idag' })
    const bookingsWithMail = existing.bookings?.filter((b: any) => b.mail) ?? []
    await Promise.all(bookingsWithMail.map((b: any) => sendPassChangeNotice({
      to: b.mail, name: b.name, passTitle: rest.title || existing.title,
      date: rest.date_str || existing.date_str,
      time: rest.time_str || existing.time_str,
      plats: rest.plats || existing.plats,
    })))
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  if (!['forsamling','pastorat','super'].includes(profile?.admin_level ?? '')) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const { error } = await supabase.from('passes').delete().eq('id', parseInt(id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPassReminder } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  if (!['forsamling', 'pastorat', 'super'].includes(profile?.admin_level ?? '')) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const admin = createAdminClient()
  const passId = parseInt(id)

  const { data: pass } = await admin
    .from('passes')
    .select('id, title, date_str, time_str, plats, vk, tel, bookings(profile_id, profiles(name, email))')
    .eq('id', passId)
    .single()

  if (!pass) return NextResponse.json({ error: 'Hittar inte passet' }, { status: 404 })

  const bookings = (pass.bookings ?? []) as any[]
  const recipients = bookings.filter((b: any) => b.profiles?.email)

  if (!recipients.length) return NextResponse.json({ sent: 0 })

  try {
    await Promise.all(recipients.map((b: any) => sendPassReminder({
      to: b.profiles.email,
      name: b.profiles.name,
      passTitle: pass.title,
      date: pass.date_str,
      time: pass.time_str,
      plats: pass.plats,
      vk: pass.vk ?? '',
      tel: pass.tel ?? '',
    })))
  } catch (e: any) {
    return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
  }

  return NextResponse.json({ sent: recipients.length })
}

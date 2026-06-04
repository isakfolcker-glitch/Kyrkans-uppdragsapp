import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const id = user.id

  const [profile, bookings, groups, notifications] = await Promise.all([
    supabase.from('profiles').select('name, email, phone, birth_year, emergency_contact_name, emergency_contact_phone, role, created_at').eq('id', id).single(),
    supabase.from('bookings').select('pass_id, name, source, created_at').eq('profile_id', id),
    supabase.from('profile_groups').select('group_id').eq('profile_id', id),
    supabase.from('notifications').select('type, title, body, read, created_at').eq('user_id', id),
  ])

  const exportData = {
    exportDate: new Date().toISOString(),
    gdprInfo: 'Exporterad enligt GDPR artikel 20 – Rätt till dataportabilitet',
    personuppgifter: profile.data,
    bokningar: bookings.data ?? [],
    uppdragsgrupper: groups.data?.map(g => g.group_id) ?? [],
    notiser: notifications.data ?? [],
  }

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="mina-uppgifter-${new Date().toISOString().slice(0,10)}.json"`,
    },
  })
}

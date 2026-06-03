import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data } = await supabase
    .from('profiles')
    .select('*, profile_groups(group_id), notif_settings(*)')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ ...data, email: user.email })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json()
  const { notif_settings, ...rawProfileData } = body

  // Förhindra privilege escalation — användaren får inte ändra dessa fält på sig själv
  const { admin_level, role, church_id, is_employee, ...profileData } = rawProfileData

  if (Object.keys(profileData).length) {
    await supabase.from('profiles').update(profileData).eq('id', user.id)
  }

  if (notif_settings) {
    await supabase.from('notif_settings').upsert({ profile_id: user.id, ...notif_settings })
  }

  return NextResponse.json({ ok: true })
}

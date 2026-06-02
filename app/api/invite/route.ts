import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitation } from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  if (!profile || !['forsamling','pastorat','super'].includes(profile.admin_level)) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const { email, name, role, church_id } = await req.json()
  if (!email || !name || !role) return NextResponse.json({ error: 'Saknar fält' }, { status: 400 })

  const admin = createAdminClient()

  const adminLevel = role === 'fadmin' ? 'forsamling' : role === 'padmin' ? 'pastorat' : role === 'superadmin' ? 'super' : 'none'
  const isEmployee = role !== 'ideell'

  // Skapa användare med inbjudningslänk – redirectTo måste vara en tillåten URL i Supabase Dashboard
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { name, role, church_id, admin_level: adminLevel, is_employee: isEmployee },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Uppdatera profilen med church_id och roll direkt (trigger kan ha skapat den redan)
  if (data.user) {
    await admin.from('profiles').upsert({
      id: data.user.id,
      email,
      name,
      church_id,
      role,
      admin_level: adminLevel,
      is_employee: isEmployee,
    }, { onConflict: 'id' })
  }

  // Hämta inbjudarens namn
  const { data: inviterProfile } = await supabase.from('profiles').select('name').eq('id', user.id).single()

  // Skicka välkomstmail via Resend
  await sendInvitation({
    to: email, name, inviterName: inviterProfile?.name ?? 'Administratören',
    inviteUrl: `${process.env.NEXT_PUBLIC_APP_URL}/`,
    role,
  })

  return NextResponse.json({ ok: true })
}

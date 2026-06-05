import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitation } from '@/lib/email'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('admin_level, name').eq('id', user.id).single()
  if (!caller || !['forsamling', 'pastorat', 'super'].includes(caller.admin_level)) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const { profileId } = await req.json()
  if (!profileId) return NextResponse.json({ error: 'Saknar profileId' }, { status: 400 })

  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles').select('email, name, role').eq('id', profileId).single()
  if (!profile?.email) return NextResponse.json({ error: 'Ingen e-post registrerad på personen' }, { status: 400 })

  // Generera en ny inloggningslänk (recovery = lösenordsåterställning fungerar som ny inbjudan)
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: profile.email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm` },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await sendInvitation({
    to: profile.email,
    name: profile.name,
    inviterName: caller.name ?? 'Administratören',
    inviterEmail: user.email,
    inviteUrl: linkData.properties.action_link,
    role: profile.role ?? 'ideell',
  })

  return NextResponse.json({ ok: true })
}

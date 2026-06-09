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
  if (!church_id || isNaN(Number(church_id))) return NextResponse.json({ error: `Ogiltigt kyrk-ID: ${church_id}. Ladda om sidan och försök igen.` }, { status: 400 })

  const admin = createAdminClient()

  const adminLevel = role === 'fadmin' ? 'forsamling' : role === 'padmin' ? 'pastorat' : role === 'superadmin' ? 'super' : 'none'
  const isEmployee = role !== 'ideell'

  // Kolla om e-posten redan finns (t.ex. borttagen och återskapad)
  const { data: existingUsers } = await admin.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find((u: any) => u.email === email)
  if (existingUser) {
    // Användaren finns redan — generera ny inloggningslänk istället för att skapa ny
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm` },
    })
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 })

    // Uppdatera profilen
    await admin.from('profiles').upsert({
      id: existingUser.id, email, name, church_id, role, admin_level: adminLevel, is_employee: isEmployee,
    }, { onConflict: 'id' })

    const { data: inviterProfile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
    const { data: inviterAuthUser } = await supabase.auth.getUser()
    try {
      await sendInvitation({
        to: email, name, inviterName: inviterProfile?.name ?? 'Administratören',
        inviterEmail: inviterAuthUser.user?.email,
        inviteUrl: linkData.properties.action_link,
        role,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // Skapa ny användare utan att Supabase skickar eget mail
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { name, role, church_id, admin_level: adminLevel, is_employee: isEmployee },
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

    // Generera riktig inbjudningslänk för vårt eget mail
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm` },
    })

    const { data: inviterProfile } = await supabase.from('profiles').select('name').eq('id', user.id).single()
    const { data: inviterAuthUser } = await supabase.auth.getUser()
    try {
      await sendInvitation({
        to: email, name, inviterName: inviterProfile?.name ?? 'Administratören',
        inviterEmail: inviterAuthUser.user?.email,
        inviteUrl: linkData?.properties?.action_link ?? `${process.env.NEXT_PUBLIC_APP_URL}/`,
        role,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

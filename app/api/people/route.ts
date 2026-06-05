import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  if (!caller || !['forsamling', 'pastorat', 'super'].includes(caller.admin_level)) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const { name, email, phone, role, church_id, groups } = await req.json()
  if (!name) return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
  if (!church_id || isNaN(Number(church_id))) return NextResponse.json({ error: `Ogiltigt kyrk-ID` }, { status: 400 })

  const admin = createAdminClient()
  const adminLevel = role === 'fadmin' ? 'forsamling' : role === 'padmin' ? 'pastorat' : 'none'
  const isEmployee = role === 'anstalld' || role === 'fadmin' || role === 'padmin'

  // Create auth user without email (anonymous-ish) or with email but no invite
  // We use a random UUID-based fake email if none provided so profiles table works
  const fakeEmail = email || `noemail+${crypto.randomUUID()}@intern.local`

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: fakeEmail,
    email_confirm: true,
    user_metadata: { name, role, church_id, admin_level: adminLevel, is_employee: isEmployee },
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const uid = authUser.user.id

  const ini = name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const { error: profileErr } = await admin.from('profiles').upsert({
    id: uid,
    name,
    email: email || null,
    phone: phone || null,
    ini,
    church_id,
    role,
    admin_level: adminLevel,
    is_employee: isEmployee,
    available: true,
  }, { onConflict: 'id' })

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

  if (groups?.length) {
    await admin.from('profile_groups').insert(groups.map((g: string) => ({ profile_id: uid, group_id: g })))
  }

  return NextResponse.json({ id: uid, ini })
}

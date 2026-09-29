import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, isAdmin, canAdminChurch, canAssignLevel, roleToLevel, filterGroupsForChurch, VALID_ROLES, unauthorized, forbidden } from '@/lib/authz'

export async function POST(req: NextRequest) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()

  const { name, email, phone, role, church_id, groups } = await req.json()
  if (!name) return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
  if (!church_id || isNaN(Number(church_id))) return NextResponse.json({ error: `Ogiltigt kyrk-ID` }, { status: 400 })

  const churchId = Number(church_id)
  const safeRole = VALID_ROLES.includes(role) ? role : 'ideell'
  const adminLevel = roleToLevel(safeRole)
  if (!(await canAdminChurch(caller, churchId))) return forbidden('Du kan bara lägga till personer i din egen församling.')
  if (!canAssignLevel(caller, adminLevel)) return forbidden('Du kan inte ge någon högre behörighet än du själv har.')

  const admin = createAdminClient()
  const isEmployee = safeRole === 'anstalld' || safeRole === 'fadmin' || safeRole === 'padmin'

  // Personer utan e-post får en intern platshållaradress så att profiltabellen fungerar
  const fakeEmail = email || `noemail+${crypto.randomUUID()}@intern.local`

  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: fakeEmail,
    email_confirm: true,
    user_metadata: { name },
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const uid = authUser.user.id

  const ini = String(name).split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  const { error: profileErr } = await admin.from('profiles').upsert({
    id: uid,
    name,
    email: email || null,
    phone: phone || null,
    ini,
    church_id: churchId,
    role: safeRole,
    admin_level: adminLevel,
    is_employee: isEmployee,
    available: true,
  }, { onConflict: 'id' })

  if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 500 })

  const allowedGroups = await filterGroupsForChurch(groups, churchId)
  if (allowedGroups.length) {
    await admin.from('profile_groups').insert(allowedGroups.map(g => ({ profile_id: uid, group_id: g })))
  }

  return NextResponse.json({ id: uid, ini })
}

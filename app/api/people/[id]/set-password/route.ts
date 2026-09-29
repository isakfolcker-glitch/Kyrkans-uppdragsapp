import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAdminProfile, levelRank, unauthorized, forbidden } from '@/lib/authz'

// Admin sätter lösenord åt en person. Tillåts bara för personer med LÄGRE
// behörighet än admin själv i en församling admin ansvarar för, så att ingen
// kan ta över ett konto med samma eller högre behörighet.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const { id: targetId } = await params
  if (targetId === caller.id) return forbidden('Byt ditt eget lösenord via Min profil.')
  if (!(await canAdminProfile(caller, targetId))) return forbidden()

  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('admin_level').eq('id', targetId).single()
  if (!target || levelRank(target.admin_level) >= levelRank(caller.adminLevel)) {
    return forbidden('Du kan bara sätta lösenord åt personer med lägre behörighet än du själv.')
  }

  const { password } = await req.json()
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken.' }, { status: 400 })
  }

  const { error } = await admin.auth.admin.updateUserById(targetId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAdminAllMemberships, unauthorized, forbidden } from '@/lib/authz'

// Admin sätter lösenord åt en person. Tillåts bara om admin ansvarar för ALLA
// personens accepterade medlemskap och personen har LÄGRE behörighet (högsta
// nivå i alla församlingar), så att ingen kan ta över ett konto.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const { id: targetId } = await params
  const { password, church_id } = await req.json()
  const churchId = Number(church_id)

  if (!churchId || Number.isNaN(churchId)) {
    return NextResponse.json({ error: 'Församling krävs' }, { status: 400 })
  }
  if (targetId === caller.id) return forbidden('Byt ditt eget lösenord via Min profil.')

  // Kräver accepterat medlemskap i församlingen, och att ALLA personens accepterade
  // medlemskap ligger i församlingar som anroparen administrerar, med strikt lägre
  // nivå än anroparen i var och en. Annars kunde en admin i en annan församling
  // ta över kontot.
  if (!(await canAdminAllMemberships(caller, targetId, { churchId, strictlyLower: true }))) {
    return forbidden('Du kan bara sätta lösenord åt personer med lägre behörighet än du själv i församlingen.')
  }

  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(targetId, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

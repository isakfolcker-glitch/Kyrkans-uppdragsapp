import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAdminOrStaff, unauthorized, forbidden } from '@/lib/authz'

type Row = {
  profile_id: string
  church_id: number
  role: string
  invited_at: string
  churches: { name: string } | { name: string }[] | null
  profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
}
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

/**
 * Utan church_id: den inloggades egna väntande inbjudningar (församlingens namn).
 * Med church_id: väntande inbjudningar i församlingen, bara namn, e-post, roll och
 * datum, för admin eller anställd med kan_lagg_till_personal där. Inget mer om personen.
 */
export async function GET(req: NextRequest) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const admin = createAdminClient()
  const churchParam = req.nextUrl.searchParams.get('church_id')

  if (churchParam === null) {
    const { data, error } = await admin
      .from('profile_churches')
      .select('church_id, role, invited_at, churches(name)')
      .eq('profile_id', caller.id)
      .eq('active', true)
      .is('accepted_at', null)
    if (error) return NextResponse.json({ error: `Kunde inte läsa inbjudningar: ${error.message}` }, { status: 500 })
    return NextResponse.json(((data ?? []) as unknown as Omit<Row, 'profile_id' | 'profiles'>[]).map(r => ({
      churchId: r.church_id,
      churchName: one(r.churches)?.name ?? 'Okänd församling',
      role: r.role,
      invitedAt: r.invited_at,
    })))
  }

  const churchId = Number(churchParam)
  if (!churchId || Number.isNaN(churchId)) return NextResponse.json({ error: 'Ogiltig församling' }, { status: 400 })
  if (!(await canAdminOrStaff(caller, 'kan_lagg_till_personal', churchId))) return forbidden()

  const { data, error } = await admin
    .from('profile_churches')
    .select('profile_id, church_id, role, invited_at, profiles!inner(name, email)')
    .eq('church_id', churchId)
    .eq('active', true)
    .is('accepted_at', null)
  if (error) return NextResponse.json({ error: `Kunde inte läsa inbjudningar: ${error.message}` }, { status: 500 })
  return NextResponse.json(((data ?? []) as unknown as Row[]).map(r => ({
    profileId: r.profile_id,
    name: one(r.profiles)?.name ?? '',
    email: one(r.profiles)?.email ?? '',
    role: r.role,
    invitedAt: r.invited_at,
  })))
}

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCaller, canAdminOrStaff, unauthorized, forbidden } from '@/lib/authz'

export async function POST(req: NextRequest) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()

  const body = await req.json()
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!label || label.length > 100) {
    return NextResponse.json({ error: 'Gruppnamn krävs (högst 100 tecken)' }, { status: 400 })
  }
  const cls = typeof body.cls === 'string' && body.cls.trim() ? body.cls.trim().slice(0, 50) : undefined

  // church_id: null (uttryckligen) betyder gemensam grupp. Bara superadmin.
  let churchId: number | null
  if (body.church_id === null) {
    if (!caller.isSuper) return forbidden('Bara superadmin kan skapa gemensamma grupper.')
    churchId = null
  } else {
    churchId = Number(body.church_id)
    if (!churchId || Number.isNaN(churchId)) {
      return NextResponse.json({ error: 'Gruppnamn och församling krävs' }, { status: 400 })
    }
    // Admin för församlingen eller anställd med kan_hantera_grupper i just den församlingen.
    if (!(await canAdminOrStaff(caller, 'kan_hantera_grupper', churchId))) {
      return forbidden('Saknar behörighet i församlingen')
    }
  }

  const id = label.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/\s+/g, '_') + '_' + Date.now()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('groups')
    .insert({ id, label, church_id: churchId, ...(cls ? { cls } : {}) })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageChurchSettings } from '@/lib/serverChurchAuth'
import { isSystemSuperAdmin } from '@/lib/membershipAuth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const churchId = Number(id)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  if (!(await canManageChurchSettings(supabase, churchId))) {
    return NextResponse.json({ error: 'Saknar behörighet för församlingen' }, { status: 403 })
  }

  const body = await req.json()
  const admin = createAdminClient()
  const update: Record<string, string | number | null> = {}
  if (typeof body.name === 'string') {
    if (!body.name.trim()) return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    update.name = body.name.trim()
  }
  if ('admin' in body) update.admin_name = typeof body.admin === 'string' ? body.admin : null
  if ('tel' in body) update.tel = typeof body.tel === 'string' ? body.tel : null
  if ('address' in body) update.address = typeof body.address === 'string' ? body.address : null

  // Enbart systemets superadmin kan flytta en församling mellan pastorat.
  if ('pastorat_id' in body) {
    if (!(await isSystemSuperAdmin(supabase))) {
      return NextResponse.json({ error: 'Bara superadmin får ändra tillhörande pastorat' }, { status: 403 })
    }
    const target = body.pastorat_id === null || body.pastorat_id === '' ? null : Number(body.pastorat_id)
    if (target !== null && (!Number.isSafeInteger(target) || target <= 0)) {
      return NextResponse.json({ error: 'Ogiltigt pastorat' }, { status: 400 })
    }
    if (target !== null) {
      const { data: exists, error: lookupError } = await admin.from('pastorat').select('id').eq('id', target).maybeSingle()
      if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
      if (!exists) return NextResponse.json({ error: 'Pastoratet finns inte' }, { status: 404 })
    }
    update.pastorat_id = target
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: 'Inga ändringar' }, { status: 400 })
  const { error } = await admin.from('churches').update(update).eq('id', churchId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const churchId = Number(id)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  if (!(await canManageChurchSettings(supabase, churchId))) {
    return NextResponse.json({ error: 'Saknar behörighet för församlingen' }, { status: 403 })
  }

  const admin = createAdminClient()
  // Församlingar med aktiva eller väntande medlemskap tas inte bort.
  const { count, error: countErr } = await admin
    .from('profile_churches')
    .select('profile_id', { count: 'exact', head: true })
    .eq('church_id', churchId)
    .eq('active', true)
  if (countErr) return NextResponse.json({ error: `Kunde inte kontrollera medlemmar: ${countErr.message}` }, { status: 500 })
  if ((count ?? 0) > 0) {
    return NextResponse.json({
      error: `Församlingen har ${count} medlemmar eller väntande inbjudningar. Flytta eller ta bort personerna först.`,
    }, { status: 409 })
  }

  const { error } = await admin.from('churches').delete().eq('id', churchId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

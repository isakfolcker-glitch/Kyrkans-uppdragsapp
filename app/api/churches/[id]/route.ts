import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageChurchSettings } from '@/lib/serverChurchAuth'

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
  const { error } = await admin
    .from('churches')
    .update({
      name: body.name?.trim(),
      admin_name: body.admin || null,
      tel: body.tel || null,
      address: body.address || null,
    })
    .eq('id', churchId)

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
  const { error } = await admin.from('churches').delete().eq('id', churchId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

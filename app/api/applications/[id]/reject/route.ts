import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendApplicationRejected } from '@/lib/email'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: caller } = await supabase.from('profiles').select('admin_level, church_id').eq('id', user.id).single()
  if (!caller || !['forsamling', 'pastorat', 'super'].includes(caller.admin_level)) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: application } = await admin.from('applications').select('*').eq('id', id).single()
  if (!application) return NextResponse.json({ error: 'Ansökan hittades inte' }, { status: 404 })
  if (application.status !== 'pending') return NextResponse.json({ error: 'Ansökan är redan hanterad' }, { status: 409 })
  if (caller.admin_level === 'forsamling' && application.church_id !== caller.church_id) {
    return NextResponse.json({ error: 'Ansökan gäller en annan församling' }, { status: 403 })
  }

  const { reason } = await req.json().catch(() => ({ reason: '' }))

  const { error } = await admin.from('applications').update({
    status: 'rejected', reviewed_by: user.id, reviewed_at: new Date().toISOString(),
    rejection_reason: reason || null,
  }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await sendApplicationRejected({ to: application.email, name: application.name, reason }).catch(() => {})

  return NextResponse.json({ ok: true })
}

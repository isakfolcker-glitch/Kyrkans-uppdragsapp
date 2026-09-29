import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('admin_level, church_id').eq('id', user.id).single()
  if (!['pastorat','super'].includes(profile?.admin_level ?? '')) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  // En pastoratsadmin skapar alltid församlingen i sitt eget pastorat
  let pastoratId: number | null = null
  if (profile?.admin_level === 'pastorat') {
    const { data: own } = await supabase.from('churches').select('pastorat_id').eq('id', profile.church_id ?? -1).maybeSingle()
    if (!own?.pastorat_id) return NextResponse.json({ error: 'Din församling saknar pastorat. Kontakta superadmin.' }, { status: 403 })
    pastoratId = own.pastorat_id
  }

  const body = await req.json()
  const { data, error } = await supabase
    .from('churches')
    .insert({ name: body.name, admin_name: body.admin, tel: body.tel, address: body.address, ...(pastoratId ? { pastorat_id: pastoratId } : {}) })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

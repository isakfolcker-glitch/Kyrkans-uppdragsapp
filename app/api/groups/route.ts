import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const body = await req.json()
  const id = body.label.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/\s+/g, '_') + '_' + Date.now()
  const { data, error } = await supabase
    .from('groups')
    .insert({ id, label: body.label, cls: body.cls, church_id: body.church_id || null })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

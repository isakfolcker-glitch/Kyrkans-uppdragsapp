import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveSystemOwner } from '@/lib/systemOwnerServer'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })
  try {
    return NextResponse.json({ isOwner: await resolveSystemOwner(supabase, user) })
  } catch {
    return NextResponse.json({ error: 'Systemägarens behörighet kunde inte verifieras' }, { status: 503 })
  }
}

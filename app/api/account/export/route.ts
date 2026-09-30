import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { collectPersonData } from '@/lib/gdpr'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const exportData = await collectPersonData(supabase, user.id)

  return new NextResponse(JSON.stringify({ ...exportData, inloggning: { email: user.email, skapad: user.created_at } }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="mina-uppgifter-${new Date().toISOString().slice(0,10)}.json"`,
    },
  })
}

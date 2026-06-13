import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data, error } = await supabase
    .from('pass_messages')
    .select('*')
    .eq('pass_id', id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { body, is_staff_reply } = await req.json()
  if (!body?.trim()) return NextResponse.json({ error: 'Tomt meddelande' }, { status: 400 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const { data, error } = await supabase
    .from('pass_messages')
    .insert({
      pass_id: parseInt(id),
      author_id: user.id,
      author_name: profile?.name ?? 'Okänd',
      body: body.trim(),
      is_staff_reply: is_staff_reply ?? false,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Skicka notis till ansvariga (alla utom den som skriver)
  const admin = createAdminClient()
  const { data: pass } = await admin
    .from('passes')
    .select('title, pass_responsible(profile_id)')
    .eq('id', parseInt(id))
    .single()

  if (pass?.pass_responsible?.length) {
    const recipients = (pass.pass_responsible as any[])
      .map((r: any) => r.profile_id as string)
      .filter((rid: string) => rid !== user.id)

    if (recipients.length) {
      const isQuestion = !(is_staff_reply ?? false)
      const notifTitle = isQuestion
        ? `Ny fråga på "${pass.title}"`
        : `Nytt svar på "${pass.title}"`
      const preview = body.trim().slice(0, 120) + (body.trim().length > 120 ? '…' : '')

      await admin.from('notifications').insert(
        recipients.map((uid: string) => ({
          user_id: uid,
          type: 'message',
          title: notifTitle,
          body: `${profile?.name ?? 'Okänd'}: ${preview}`,
        }))
      )
    }
  }

  return NextResponse.json(data)
}

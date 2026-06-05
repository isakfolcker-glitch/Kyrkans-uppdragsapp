import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { deviceId, subscription, remindInTime, remindOutTime, workDays } = body

  if (!deviceId || !subscription?.endpoint) {
    return NextResponse.json({ error: 'Saknade fält' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('stampla_push_subscriptions').upsert(
    {
      device_id: deviceId,
      subscription,
      remind_in_time: remindInTime ?? '07:45',
      remind_out_time: remindOutTime ?? '16:30',
      work_days: workDays ?? [1, 2, 3, 4, 5],
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'device_id' },
  )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { deviceId } = await req.json()
  if (!deviceId) return NextResponse.json({ error: 'Saknad deviceId' }, { status: 400 })

  const admin = createAdminClient()
  await admin
    .from('stampla_push_subscriptions')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('device_id', deviceId)

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { createAdminClient } from '@/lib/supabase/admin'

const MEDVIND_URL =
  'https://login.medvind.visma.com/MedvindSSO/Login/?wtrealm=https%3a%2f%2fsvenskakyrkan.medvind.visma.com%2fMvWeb%2f&tenantId=SVENSKAKYRKAN2'

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_SUBJECT}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

function stockholmHHMM(date: Date): { hhmm: string; dayNum: number } {
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'long',
    hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const hour   = parts.find(p => p.type === 'hour')?.value ?? '00'
  const minute = parts.find(p => p.type === 'minute')?.value ?? '00'
  const wd     = parts.find(p => p.type === 'weekday')?.value ?? ''
  const MAP: Record<string, number> = {
    måndag: 1, tisdag: 2, onsdag: 3, torsdag: 4, fredag: 5, lördag: 6, söndag: 7,
  }
  return { hhmm: `${hour}:${minute}`, dayNum: MAP[wd.toLowerCase()] ?? 0 }
}

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const { hhmm: currentTime, dayNum } = stockholmHHMM(now)

  const admin = createAdminClient()
  const { data: subs } = await admin
    .from('stampla_push_subscriptions')
    .select('*')
    .eq('active', true)

  if (!subs?.length) return NextResponse.json({ sent: 0, time: currentTime })

  let sent = 0

  for (const sub of subs) {
    if (!(sub.work_days as number[]).includes(dayNum)) continue

    const wantIn  = sub.remind_in_time  === currentTime
    const wantOut = sub.remind_out_time === currentTime
    if (!wantIn && !wantOut) continue

    // Cooldown — avoid double-send within 4 hours
    if (wantIn && sub.last_sent_in) {
      if (now.getTime() - new Date(sub.last_sent_in).getTime() < FOUR_HOURS_MS) continue
    }
    if (wantOut && sub.last_sent_out) {
      if (now.getTime() - new Date(sub.last_sent_out).getTime() < FOUR_HOURS_MS) continue
    }

    const type = wantIn ? 'in' : 'out'
    const payload = JSON.stringify({
      title: type === 'in' ? 'Dags att stämpla in! ⏰' : 'Dags att stämpla ut! 🏃',
      body:  type === 'in'
        ? 'Tryck för att öppna Medvind och stämpla in.'
        : 'Tryck för att öppna Medvind och stämpla ut.',
      url: MEDVIND_URL,
      tag: `stampla-${type}`,
    })

    try {
      await webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload)
      await admin
        .from('stampla_push_subscriptions')
        .update({
          [type === 'in' ? 'last_sent_in' : 'last_sent_out']: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', sub.id)
      sent++
    } catch (err: unknown) {
      // 410 Gone = subscription expired
      const status = (err as { statusCode?: number }).statusCode
      if (status === 410 || status === 404) {
        await admin
          .from('stampla_push_subscriptions')
          .update({ active: false })
          .eq('id', sub.id)
      }
    }
  }

  return NextResponse.json({ sent, time: currentTime, day: dayNum })
}

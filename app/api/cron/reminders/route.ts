import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPassReminder } from '@/lib/email'

// Anropas av Vercel Cron varje dag kl 18:00
// Konfigurera i vercel.json: { "crons": [{ "path": "/api/cron/reminders", "schedule": "0 18 * * *" }] }
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10)

  // Hämta alla pass imorgon som inte är inställda
  const { data: passes } = await admin
    .from('passes')
    .select('id, title, date_str, time_str, plats, vk, tel, bookings(profile_id, profiles(name, email, notif_settings(pamin)))')
    .eq('date_str', tomorrowStr)
    .eq('cancelled', false)

  if (!passes?.length) return NextResponse.json({ sent: 0 })

  let sent = 0
  for (const pass of passes) {
    for (const booking of (pass.bookings ?? []) as any[]) {
      const profile = booking.profiles
      if (!profile?.email) continue
      if (profile.notif_settings?.[0]?.pamin === false) continue

      await sendPassReminder({
        to: profile.email,
        name: profile.name,
        passTitle: pass.title,
        date: pass.date_str,
        time: pass.time_str,
        plats: pass.plats,
        vk: pass.vk ?? '',
        tel: pass.tel ?? '',
      }).catch(() => {})
      sent++
    }
  }

  return NextResponse.json({ sent, date: tomorrowStr })
}

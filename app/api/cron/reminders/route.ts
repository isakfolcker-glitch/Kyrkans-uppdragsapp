import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPassReminder, sendStaffDeltagarlista } from '@/lib/email'

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
    .select('id, title, date_str, time_str, plats, vk, tel, vk_profile_id, pass_responsible(profile_id), bookings(profile_id, name, mail, tel, profiles(name, email, notif_settings(pamin)))')
    .eq('date_str', tomorrowStr)
    .eq('cancelled', false)

  if (!passes?.length) return NextResponse.json({ sent: 0, staffSent: 0 })

  let sent = 0
  let staffSent = 0

  for (const pass of passes) {
    // Ansvarig-profil (första i listan, om någon)
    const responsibleIds = ((pass.pass_responsible ?? []) as any[]).map(r => r.profile_id).filter(Boolean)
    const staffIds = Array.from(new Set([...(pass.vk_profile_id ? [pass.vk_profile_id] : []), ...responsibleIds]))

    let staffProfiles: { id: string; name: string; email: string | null; phone: string | null }[] = []
    if (staffIds.length) {
      const { data } = await admin.from('profiles').select('id, name, email, phone').in('id', staffIds)
      staffProfiles = data ?? []
    }
    const ansvarigProfile = staffProfiles.find(p => responsibleIds.includes(p.id))

    // Skicka påminnelse till bokade ideella
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
        ansvarig: ansvarigProfile ? { name: ansvarigProfile.name, tel: ansvarigProfile.phone ?? undefined, mail: ansvarigProfile.email ?? undefined } : undefined,
      }).catch(() => {})

      if (booking.profile_id) {
        await admin.from('notifications').insert({
          user_id: booking.profile_id, type: 'reminder',
          title: `Påminnelse imorgon: ${pass.title}`,
          body: `${pass.date_str} kl ${pass.time_str} – ${pass.plats}`,
        })
      }
      sent++
    }

    // Skicka deltagarlista till vaktmästare och ansvariga
    if (staffProfiles.length) {
      const deltagare = ((pass.bookings ?? []) as any[]).map(b => ({ name: b.name, mail: b.mail, tel: b.tel }))
      for (const staff of staffProfiles) {
        if (!staff.email) continue
        await sendStaffDeltagarlista({
          to: staff.email, name: staff.name, passTitle: pass.title,
          date: pass.date_str, time: pass.time_str, plats: pass.plats,
          deltagare,
        }).catch(() => {})
        staffSent++
      }
    }
  }

  return NextResponse.json({ sent, staffSent, date: tomorrowStr })
}

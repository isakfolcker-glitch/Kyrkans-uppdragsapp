import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Återställer testdata till ett känt utgångsläge: tar bort alla pass (vilket
// via cascade också tar bort bokningar, väntelista, frågor och historik för
// dem), notiser, utskicksloggar och ansökningar, och skapar sedan om en fast
// uppsättning testpass. Rör INTE kyrkor, grupper eller testkontona, de ska
// bestå mellan återställningar. Fungerar bara i testmiljön (TEST_MODE=true)
// och bara för inloggad admin.
export async function POST() {
  if (process.env.TEST_MODE !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Ej inloggad' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('admin_level').eq('id', user.id).single()
  if (!['forsamling', 'pastorat', 'super'].includes(profile?.admin_level ?? '')) {
    return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: churches } = await admin.from('churches').select('id, name').in('name', ['Test Församling A', 'Test Församling B'])
  const churchA = churches?.find(c => c.name === 'Test Församling A')
  const churchB = churches?.find(c => c.name === 'Test Församling B')
  if (!churchA || !churchB) {
    return NextResponse.json({ error: 'Testkyrkorna saknas, kör seed-skriptet först.' }, { status: 400 })
  }

  // Nollställ testdata (passes tar bookings/waitlist/pass_messages/pass_history/
  // pass_groups/pass_responsible med sig via ON DELETE CASCADE)
  await admin.from('passes').delete().in('church_id', [churchA.id, churchB.id])
  await admin.from('notifications').delete().neq('id', 0)
  await admin.from('message_logs').delete().neq('id', 0)
  await admin.from('applications').delete().neq('id', 0)

  const fmtDate = (d: Date) => d.toISOString().slice(0, 10)
  const in_ = (days: number, hours = 0) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(d.getHours() + hours); return d }

  const soon = in_(0, 3) // om 3 timmar — inom 24-timmarsgränsen
  const soonEnd = in_(0, 5)

  const makePasses = (churchId: number, label: string) => [
    { church_id: churchId, title: `${label}: Ledigt pass`, date_str: fmtDate(in_(10)), time_str: '10:00–12:00', plats: 'Kyrkorummet', spots: 4, vk: 'Vaktmästare Test', tel: '070-111 11 11', description: 'Öppet pass med gott om plats, för att testa vanlig anmälan.' },
    { church_id: churchId, title: `${label}: Snart fullt (1 plats kvar)`, date_str: fmtDate(in_(8)), time_str: '14:00–16:00', plats: 'Kapellet', spots: 2, vk: 'Vaktmästare Test', tel: '070-111 11 11', description: 'En plats ledig, för att testa gränsen mot fullbokat.', _manualBookings: 1 },
    { church_id: churchId, title: `${label}: Fullbokat (testa väntelista här)`, date_str: fmtDate(in_(6)), time_str: '18:00–20:00', plats: 'Kyrkorummet', spots: 2, vk: 'Vaktmästare Test', tel: '070-111 11 11', description: 'Redan fullbokat, ställ dig i kö här för att testa väntelistan.', _manualBookings: 2 },
    { church_id: churchId, title: `${label}: Inom 24 timmar (testa låsning)`, date_str: fmtDate(soon), time_str: `${soon.getHours().toString().padStart(2,'0')}:00–${soonEnd.getHours().toString().padStart(2,'0')}:00`, plats: 'Kyrkorummet', spots: 3, vk: 'Vaktmästare Test', tel: '070-111 11 11', description: 'Börjar inom 24 timmar. Boka dig och testa att du inte kan avboka dig själv.' },
    { church_id: churchId, title: `${label}: Inställt pass`, date_str: fmtDate(in_(4)), time_str: '09:00–11:00', plats: 'Kapellet', spots: 2, vk: 'Vaktmästare Test', tel: '070-111 11 11', description: 'Ett inställt pass, för att testa hur det visas.', cancelled: true },
  ]

  const allPasses = [...makePasses(churchA.id, 'A'), ...makePasses(churchB.id, 'B')]
  let created = 0
  for (const p of allPasses) {
    const { _manualBookings, ...passFields } = p as any
    const { data: pass, error } = await admin.from('passes').insert(passFields).select().single()
    if (error || !pass) continue
    created++
    if (_manualBookings) {
      const rows = Array.from({ length: _manualBookings }, (_, i) => ({
        pass_id: pass.id, name: `Testperson ${i + 1}`, source: 'manual', no_account: true,
        ini: `T${i + 1}`, av_color: '#F1EFE8', ac_color: '#5F5E5A',
      }))
      await admin.from('bookings').insert(rows)
    }
  }

  return NextResponse.json({ ok: true, passesCreated: created })
}

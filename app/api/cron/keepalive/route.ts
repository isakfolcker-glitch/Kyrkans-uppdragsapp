import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Anropas av Vercel Cron en gång per dygn för att hindra att Supabase pausar
// projekten på grund av inaktivitet (gratisprojekt pausas efter 7 dagars
// inaktivitet). Gör en minimal läsning mot produktionsdatabasen, och mot
// testdatabasen om dess miljövariabler är satta (de finns bara i Vercels
// Production-miljö, eftersom Vercel Cron bara körs där).
// Konfigurera i vercel.json: { "crons": [{ "path": "/api/cron/keepalive", "schedule": "0 6 * * *" }] }
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const prod = await pingDatabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    'produktionsdatabasen'
  )

  const testUrl = process.env.KEEPALIVE_TEST_SUPABASE_URL
  const testKey = process.env.KEEPALIVE_TEST_SUPABASE_ANON_KEY
  const test = testUrl && testKey
    ? await pingDatabase(testUrl, testKey, 'testdatabasen')
    : 'skipped'

  const ok = prod === 'ok' && test !== 'error'

  // Svaret innehåller aldrig faktisk data från databaserna, bara status per databas.
  return NextResponse.json({ ok, prod, test })
}

// Gör en minimal läsfråga för att hålla databasen "aktiv". Returnerar bara
// 'ok' eller 'error' – aldrig data, nycklar eller felmeddelanden utåt.
// Fel loggas internt (utan käns­liga detaljer) så en felande databas inte
// hindrar att den andra kontrolleras.
async function pingDatabase(
  url: string | undefined,
  anonKey: string | undefined,
  label: string
): Promise<'ok' | 'error'> {
  if (!url || !anonKey) {
    console.error(`[keepalive] saknar miljövariabler för ${label}`)
    return 'error'
  }
  try {
    const supabase = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await supabase.from('churches').select('id').limit(1)
    if (error) {
      console.error(`[keepalive] läsfråga mot ${label} misslyckades`)
      return 'error'
    }
    return 'ok'
  } catch {
    console.error(`[keepalive] oväntat fel mot ${label}`)
    return 'error'
  }
}

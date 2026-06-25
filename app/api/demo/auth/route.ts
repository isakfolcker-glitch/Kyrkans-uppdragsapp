import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const correct = process.env.DEMO_PASSWORD

  if (!correct) return NextResponse.json({ error: 'Demo ej konfigurerat' }, { status: 500 })
  if (password !== correct) return NextResponse.json({ error: 'Fel lösenord' }, { status: 401 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set('demo_auth', correct, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 dagar
    path: '/',
  })
  return res
}

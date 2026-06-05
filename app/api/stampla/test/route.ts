import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'

const MEDVIND_URL =
  'https://login.medvind.visma.com/MedvindSSO/Login/?wtrealm=https%3a%2f%2fsvenskakyrkan.medvind.visma.com%2fMvWeb%2f&tenantId=SVENSKAKYRKAN2'

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_SUBJECT}`,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
)

export async function POST(req: NextRequest) {
  const { subscription } = await req.json()
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Ogiltig prenumeration' }, { status: 400 })
  }

  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: 'Test — Stämpla',
        body: 'Notisen fungerar! Tryck för att öppna Medvind.',
        url: MEDVIND_URL,
        tag: 'stampla-test',
      }),
    )
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

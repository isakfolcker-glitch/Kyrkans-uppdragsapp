import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitation } from '@/lib/email'

// Engångsendpoint för testmiljön: skapar den allra första superadmin-kontot
// så att man kan logga in och bjuda in resten av testkontona via appens
// vanliga inbjudningsflöde. Fungerar bara i testmiljön (TEST_MODE=true) och
// bara innan något superadmin-konto finns, så den kan inte missbrukas i skarpt läge.
export async function POST() {
  if (process.env.TEST_MODE !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const admin = createAdminClient()

  const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('admin_level', 'super')
  if (count && count > 0) {
    return NextResponse.json({ error: 'Testmiljön är redan bootstrappad, ett superadmin-konto finns.' }, { status: 403 })
  }

  const email = process.env.TEST_SUPERADMIN_EMAIL
  if (!email) return NextResponse.json({ error: 'TEST_SUPERADMIN_EMAIL saknas' }, { status: 500 })

  const { data: church } = await admin.from('churches').select('id').order('id').limit(1).single()

  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { name: 'Test Superadmin', role: 'superadmin', church_id: church?.id ?? null, admin_level: 'super', is_employee: true },
  })
  if (createError || !createData.user) {
    return NextResponse.json({ error: createError?.message ?? 'Kunde inte skapa kontot' }, { status: 400 })
  }

  await admin.from('profiles').upsert({
    id: createData.user.id, email, name: 'Test Superadmin',
    church_id: church?.id ?? null, role: 'superadmin', admin_level: 'super', is_employee: true,
  }, { onConflict: 'id' })

  const { data: linkData } = await admin.auth.admin.generateLink({
    type: 'invite', email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm` },
  })

  await sendInvitation({
    to: email, name: 'Test Superadmin', inviterName: 'Testmiljön',
    inviteUrl: linkData?.properties?.action_link ?? `${process.env.NEXT_PUBLIC_APP_URL}/`,
    role: 'superadmin',
  }).catch(() => {})

  return NextResponse.json({ ok: true, email })
}

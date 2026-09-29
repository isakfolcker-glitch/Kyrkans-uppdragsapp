import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendInvitation } from '@/lib/email'
import { getCaller, isAdmin, canAdminChurch, canAssignLevel, canAdminProfile, roleToLevel, VALID_ROLES, unauthorized, forbidden } from '@/lib/authz'

export async function POST(req: NextRequest) {
  const { caller } = await getCaller()
  if (!caller) return unauthorized()
  if (!isAdmin(caller)) return forbidden()

  const { email, name, role, church_id } = await req.json()
  if (!email || !name || !role) return NextResponse.json({ error: 'Saknar fält' }, { status: 400 })
  if (!VALID_ROLES.includes(role)) return NextResponse.json({ error: 'Ogiltig roll' }, { status: 400 })
  if (!church_id || isNaN(Number(church_id))) return NextResponse.json({ error: `Ogiltigt kyrk-ID: ${church_id}. Ladda om sidan och försök igen.` }, { status: 400 })

  const churchId = Number(church_id)
  const adminLevel = roleToLevel(role)
  if (!(await canAdminChurch(caller, churchId))) return forbidden('Du kan bara bjuda in till din egen församling.')
  if (!canAssignLevel(caller, adminLevel)) return forbidden('Du kan inte ge någon högre behörighet än du själv har.')
  if (String(email).toLowerCase() === caller.email?.toLowerCase()) return forbidden('Du kan inte bjuda in dig själv.')

  const admin = createAdminClient()
  const isEmployee = role !== 'ideell'
  const inviterName = caller.name
  const inviterEmail = caller.email ?? undefined

  // Försök skapa ny användare
  const { data: createData, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: false,
    user_metadata: { name },
  })

  // Användaren finns redan — hitta dem och skicka ny länk
  if (createError) {
    const alreadyExists = createError.message.toLowerCase().includes('already been registered')
      || createError.message.toLowerCase().includes('already exists')
    if (!alreadyExists) {
      return NextResponse.json({ error: createError.message }, { status: 400 })
    }

    // Hitta befintlig användare via listUsers
    const { data: usersPage, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

    const existingUser = usersPage?.users?.find(
      (u: { email?: string }) => u.email?.toLowerCase() === String(email).toLowerCase()
    )
    if (!existingUser) {
      return NextResponse.json({ error: 'Kunde inte hitta befintlig användare. Kontakta support.' }, { status: 400 })
    }

    // Befintlig person: får bara röras om admin redan ansvarar för personen
    // (annars kunde man ta över konton i andra församlingar eller med högre behörighet).
    const { data: existingProfile } = await admin.from('profiles').select('id').eq('id', existingUser.id).maybeSingle()
    if (existingProfile && !(await canAdminProfile(caller, existingUser.id))) {
      return forbidden('Personen finns redan i en annan församling eller har högre behörighet. Kontakta en pastoratsadmin.')
    }

    await admin.from('profiles').upsert({
      id: existingUser.id, email, name, church_id: churchId, role, admin_level: adminLevel, is_employee: isEmployee,
    }, { onConflict: 'id' })

    // Har de satt lösenord eller bekräftat e-post? → recovery, annars invite
    const hasPassword = !!(existingUser as any).encrypted_password
    const isConfirmed = !!(existingUser as any).email_confirmed_at
    const useRecovery = hasPassword || isConfirmed
    const linkType = useRecovery ? 'recovery' : 'invite'
    const redirectTo = useRecovery
      ? `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset`
      : `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: linkType, email, options: { redirectTo },
    })
    if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 400 })

    try {
      await sendInvitation({
        to: email, name, inviterName, inviterEmail,
        inviteUrl: linkData.properties.action_link, role,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  // Ny användare skapad — spara profil och skicka inbjudningslänk
  if (createData.user) {
    await admin.from('profiles').upsert({
      id: createData.user.id, email, name, church_id: churchId, role, admin_level: adminLevel, is_employee: isEmployee,
    }, { onConflict: 'id' })

    const { data: linkData } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm` },
    })

    try {
      await sendInvitation({
        to: email, name, inviterName, inviterEmail,
        inviteUrl: linkData?.properties?.action_link ?? `${process.env.NEXT_PUBLIC_APP_URL}/`,
        role,
      })
    } catch (e: any) {
      return NextResponse.json({ error: `Mailet kunde inte skickas: ${e.message}` }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

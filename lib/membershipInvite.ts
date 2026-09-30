// Gemensam logik för inbjudan till en församling. Medlemskapet sparas som
// VÄNTANDE (accepted_at = null) och blir giltigt först när personen själv
// accepterar via /api/memberships/accept. Personens profil rörs aldrig här.
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendInvitation } from '@/lib/email'
import { roleIsEmployee, roleToAdminLevel } from '@/lib/membershipAuth'

/** Skapar eller återaktiverar ett väntande medlemskap. Returnerar fel eller null. */
export async function savePendingMembership(
  admin: SupabaseClient,
  args: { profileId: string; churchId: number; role: string; invitedBy: string },
) {
  const { error } = await admin.from('profile_churches').upsert({
    profile_id: args.profileId,
    church_id: args.churchId,
    role: args.role,
    admin_level: roleToAdminLevel(args.role),
    is_employee: roleIsEmployee(args.role),
    active: true,
    accepted_at: null,
    invited_by: args.invitedBy,
    invited_at: new Date().toISOString(),
  }, { onConflict: 'profile_id,church_id' })
  return error
}

/**
 * Skickar inbjudningsmail med en länk till personens EGEN adress (via lib/email.ts).
 * Bekräftade konton får en inloggningslänk till appen, där de accepterar eller
 * avböjer; obekräftade får en inbjudningslänk till onboarding.
 */
export async function sendMembershipInvitation(
  admin: SupabaseClient,
  args: {
    email: string
    name: string
    confirmed: boolean
    churchId: number
    churchName?: string
    role: string
    inviterName: string
    inviterEmail?: string
  },
): Promise<{ error: string | null }> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const linkType = args.confirmed ? 'magiclink' : 'invite'
  const redirectTo = args.confirmed
    ? `${appUrl}/dashboard?church=${args.churchId}`
    : `${appUrl}/auth/confirm?church=${args.churchId}`

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: linkType,
    email: args.email,
    options: { redirectTo },
  })
  if (linkErr) return { error: `Kunde inte skapa inbjudningslänk: ${linkErr.message}` }

  try {
    await sendInvitation({
      to: args.email,
      name: args.name,
      inviterName: args.inviterName,
      inviterEmail: args.inviterEmail,
      inviteUrl: linkData.properties.action_link,
      role: args.role,
      churchName: args.churchName,
      existingAccount: args.confirmed,
    })
  } catch (e) {
    return { error: `Mailet kunde inte skickas: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { error: null }
}

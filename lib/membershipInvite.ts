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
 * Skickar inbjudningsmail till personens EGEN adress (via lib/email.ts).
 * - Nya, obekräftade konton får en inbjudningslänk (typ invite) till onboarding.
 * - Befintliga, bekräftade konton får ALDRIG en inloggningslänk, bara en vanlig
 *   länk till appen. Där loggar de in som vanligt och godkänner eller avböjer
 *   inbjudan i PendingInvitations.
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
  let inviteUrl: string
  if (args.confirmed) {
    inviteUrl = `${appUrl}/dashboard?church=${args.churchId}`
  } else {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email: args.email,
      options: { redirectTo: `${appUrl}/auth/confirm?church=${args.churchId}` },
    })
    if (linkErr) return { error: `Kunde inte skapa inbjudningslänk: ${linkErr.message}` }
    inviteUrl = linkData.properties.action_link
  }

  try {
    await sendInvitation({
      to: args.email,
      name: args.name,
      inviterName: args.inviterName,
      inviterEmail: args.inviterEmail,
      inviteUrl,
      role: args.role,
      churchName: args.churchName,
      existingAccount: args.confirmed,
    })
  } catch (e) {
    return { error: `Mailet kunde inte skickas: ${e instanceof Error ? e.message : String(e)}` }
  }
  return { error: null }
}

import type { SupabaseClient, User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

/** Only a verified login matching server configuration may bind the singleton.
 * Once bound, identity is the immutable profile ID, never a mutable email/role.
 */
export async function resolveSystemOwner(supabase: SupabaseClient, user: User): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_system_super_admin')
  if (error) throw new Error('Systemägarens databasmigration saknas eller kunde inte läsas')
  if (data === true) return true
  const configured = process.env.SYSTEM_OWNER_EMAIL?.trim().toLowerCase()
  if (!configured || !user.email_confirmed_at || user.email?.trim().toLowerCase() !== configured) return false
  const { data: claimed, error: claimError } = await createAdminClient().rpc('claim_system_owner', { p_profile_id: user.id })
  if (claimError) throw new Error('Systemägaren kunde inte registreras. Kontrollera migration och befintlig ägare.')
  return claimed === true
}

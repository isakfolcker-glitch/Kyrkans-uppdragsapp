import type { SupabaseClient } from '@supabase/supabase-js'

export async function canManageChurchSettings(
  supabase: SupabaseClient,
  churchId: number,
): Promise<boolean> {
  const { data } = await supabase.rpc('can_manage_church_settings', {
    target_church_id: churchId,
  })
  return data === true
}

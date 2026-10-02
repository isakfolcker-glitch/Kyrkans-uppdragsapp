import type { SupabaseClient } from '@supabase/supabase-js'

export type MembershipRole = 'ideell' | 'anstalld' | 'fadmin' | 'padmin' | 'superadmin' | 'kiosk'
export type MembershipAdminLevel = 'none' | 'forsamling' | 'pastorat' | 'super'

export interface ChurchMembership {
  profile_id: string
  church_id: number
  role: MembershipRole
  admin_level: MembershipAdminLevel
  is_employee: boolean
  active: boolean
  invited_by?: string | null
  invited_at?: string
  accepted_at?: string | null
  churches?: {
    id: number
    name: string
    pastorat_id?: number | null
  } | null
}

export type StaffPermissionKey =
  | 'kan_skapa_pass'
  | 'kan_redigera_pass'
  | 'kan_se_bokningar'
  | 'kan_hantera_bokningar'
  | 'kan_se_personal'
  | 'kan_lagg_till_personal'
  | 'kan_hantera_grupper'
  | 'kan_skicka_utskick'

export function roleToAdminLevel(role: string): MembershipAdminLevel {
  if (role === 'superadmin') return 'super'
  if (role === 'padmin') return 'pastorat'
  if (role === 'fadmin') return 'forsamling'
  return 'none'
}

export function roleIsEmployee(role: string): boolean {
  return role !== 'ideell' && role !== 'kiosk'
}

/** Aktiva OCH accepterade medlemskap. Väntande inbjudningar räknas inte. */
export async function getActiveMemberships(
  supabase: SupabaseClient,
  profileId: string,
): Promise<ChurchMembership[]> {
  const { data, error } = await supabase
    .from('profile_churches')
    .select('profile_id, church_id, role, admin_level, is_employee, active, invited_by, invited_at, accepted_at, churches(id, name, pastorat_id)')
    .eq('profile_id', profileId)
    .eq('active', true)
    .not('accepted_at', 'is', null)
    .order('invited_at', { ascending: true })

  if (error) return []
  return (data ?? []) as unknown as ChurchMembership[]
}

export async function getDirectMembership(
  supabase: SupabaseClient,
  profileId: string,
  churchId: number,
): Promise<ChurchMembership | null> {
  const { data } = await supabase
    .from('profile_churches')
    .select('profile_id, church_id, role, admin_level, is_employee, active, invited_by, invited_at, accepted_at')
    .eq('profile_id', profileId)
    .eq('church_id', churchId)
    .eq('active', true)
    .not('accepted_at', 'is', null)
    .maybeSingle()

  return (data as ChurchMembership | null) ?? null
}

export async function isSystemSuperAdmin(
  supabase: SupabaseClient,
): Promise<boolean> {
  const { data } = await supabase.rpc('is_system_super_admin')
  return data === true
}

export async function canAccessChurch(
  supabase: SupabaseClient,
  churchId: number,
): Promise<boolean> {
  const { data } = await supabase.rpc('can_access_church', { target_church_id: churchId })
  return data === true
}

export async function canAdminChurch(
  supabase: SupabaseClient,
  churchId: number,
): Promise<boolean> {
  const { data } = await supabase.rpc('can_admin_church', { target_church: churchId })
  return data === true
}

export async function getEffectiveAdminLevel(
  supabase: SupabaseClient,
  profileId: string,
  churchId: number,
): Promise<MembershipAdminLevel> {
  if (await isSystemSuperAdmin(supabase)) return 'super'

  // Direkt nivå i församlingen och pastoratsnivå räknas båda; högsta vinner.
  // Ett direkt medlemskap med nivån 'none' får inte blockera pastoratsnivån.
  const membership = await getDirectMembership(supabase, profileId, churchId)
  const direct: MembershipAdminLevel = membership?.admin_level ?? 'none'
  if (direct === 'super') return 'pastorat'
  if (direct === 'pastorat') return 'pastorat'

  const { data: pastoratAccess } = await supabase.rpc('has_pastorat_admin_access', {
    target_church_id: churchId,
  })
  if (pastoratAccess === true) return 'pastorat'
  return direct
}

export async function hasStaffPermission(
  supabase: SupabaseClient,
  profileId: string,
  churchId: number,
  permission: StaffPermissionKey,
): Promise<boolean> {
  const level = await getEffectiveAdminLevel(supabase, profileId, churchId)
  if (level !== 'none') return true

  const membership = await getDirectMembership(supabase, profileId, churchId)
  if (!membership || membership.role !== 'anstalld') return false

  const { data } = await supabase
    .from('profile_church_permissions')
    .select(permission)
    .eq('profile_id', profileId)
    .eq('church_id', churchId)
    .maybeSingle()

  if (!data) return false
  return Boolean((data as Record<StaffPermissionKey, boolean>)[permission])
}

export async function canAssignRole(
  supabase: SupabaseClient,
  profileId: string,
  churchId: number,
  targetRole: string,
): Promise<boolean> {
  if (targetRole === 'superadmin') return false
  const callerLevel = await getEffectiveAdminLevel(supabase, profileId, churchId)
  const targetLevel = roleToAdminLevel(targetRole)

  if (callerLevel === 'super') return true
  if (callerLevel === 'pastorat') return targetLevel !== 'super'
  if (callerLevel === 'forsamling') return targetLevel === 'none' || targetLevel === 'forsamling'
  return false
}

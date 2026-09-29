// Gemensamma behörighetskontroller för API-routes som använder service role.
// Service role går förbi databasens RLS, så samma regler måste kontrolleras här.
// Reglerna speglar databasfunktionerna i supabase/migrations/016_behorighetsharding.sql.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AdminLevel = 'none' | 'forsamling' | 'pastorat' | 'super'

export type Caller = {
  id: string
  email: string | null
  name: string
  adminLevel: AdminLevel
  churchId: number | null
  pastoratId: number | null
}

const RANK: Record<AdminLevel, number> = { none: 0, forsamling: 1, pastorat: 2, super: 3 }

export function levelRank(level: string | null | undefined): number {
  return RANK[(level ?? 'none') as AdminLevel] ?? 0
}

export function roleToLevel(role: string | null | undefined): AdminLevel {
  switch (role) {
    case 'superadmin': return 'super'
    case 'padmin': return 'pastorat'
    case 'fadmin': return 'forsamling'
    default: return 'none'
  }
}

export const VALID_ROLES = ['ideell', 'anstalld', 'fadmin', 'padmin', 'superadmin', 'kiosk'] as const

export function isAdmin(caller: Caller | null): caller is Caller {
  return !!caller && levelRank(caller.adminLevel) >= 1
}

/** Samma regel som can_set_admin_level i databasen. */
export function canAssignLevel(caller: Caller, level: string): boolean {
  if (caller.adminLevel === 'super') return true
  if (caller.adminLevel === 'pastorat') return ['none', 'forsamling', 'pastorat'].includes(level)
  if (caller.adminLevel === 'forsamling') return ['none', 'forsamling'].includes(level)
  return false
}

/** Hämtar inloggad användare med nivå, församling och pastorat. null om ej inloggad. */
export async function getCaller(): Promise<{ caller: Caller | null; supabase: SupabaseClient }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { caller: null, supabase }

  const admin = createAdminClient()
  const { data: p } = await admin
    .from('profiles')
    .select('name, admin_level, church_id, churches(pastorat_id)')
    .eq('id', user.id)
    .single()

  const church = (p as { churches?: { pastorat_id: number | null } | null } | null)?.churches
  return {
    supabase,
    caller: {
      id: user.id,
      email: user.email ?? null,
      name: p?.name ?? 'Administratören',
      adminLevel: (p?.admin_level ?? 'none') as AdminLevel,
      churchId: p?.church_id ?? null,
      pastoratId: church?.pastorat_id ?? null,
    },
  }
}

/** Samma regel som can_admin_church i databasen. */
export async function canAdminChurch(caller: Caller, churchId: number | null | undefined): Promise<boolean> {
  if (caller.adminLevel === 'super') return true
  if (caller.adminLevel === 'forsamling') return churchId != null && Number(churchId) === caller.churchId
  if (caller.adminLevel === 'pastorat') {
    if (churchId == null) return true
    const admin = createAdminClient()
    const { data } = await admin.from('churches').select('pastorat_id').eq('id', Number(churchId)).single()
    return !!data && data.pastorat_id === caller.pastoratId
  }
  return false
}

/** Samma regel som can_admin_profile: rätt församling och inte högre nivå än anroparen. */
export async function canAdminProfile(caller: Caller, targetId: string): Promise<boolean> {
  if (!isAdmin(caller)) return false
  const admin = createAdminClient()
  const { data: target } = await admin.from('profiles').select('admin_level, church_id').eq('id', targetId).single()
  if (!target) return false
  if (levelRank(target.admin_level) > levelRank(caller.adminLevel)) return false
  return canAdminChurch(caller, target.church_id)
}

export async function canAdminPass(caller: Caller, passId: number): Promise<boolean> {
  if (!isAdmin(caller)) return false
  const admin = createAdminClient()
  const { data } = await admin.from('passes').select('church_id').eq('id', passId).single()
  return !!data && canAdminChurch(caller, data.church_id)
}

/** Anställd med viss personalbehörighet i staff_permissions. */
export async function hasStaffPermission(caller: Caller, perm: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin.from('staff_permissions').select(perm).eq('profile_id', caller.id).maybeSingle()
  return !!(data as Record<string, unknown> | null)?.[perm]
}

/** Grupper som får användas i en viss församling: församlingens egna och gemensamma. */
export async function filterGroupsForChurch(groupIds: unknown, churchId: number): Promise<string[]> {
  if (!Array.isArray(groupIds) || !groupIds.length) return []
  const ids = groupIds.filter((g): g is string => typeof g === 'string')
  const admin = createAdminClient()
  const { data } = await admin.from('groups').select('id, church_id').in('id', ids)
  return (data ?? []).filter(g => g.church_id == null || g.church_id === churchId).map(g => g.id)
}

export const unauthorized = () => Response.json({ error: 'Ej inloggad' }, { status: 401 })
export const forbidden = (msg = 'Saknar behörighet') => Response.json({ error: msg }, { status: 403 })

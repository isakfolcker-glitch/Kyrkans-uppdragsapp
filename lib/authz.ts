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

// ---------- Kommentarer på pass (migration 018) ----------

/**
 * Har anroparen åtkomst till passets kommentarer? Frågar databasen
 * (can_access_pass_thread) med anroparens egen klient, så att regeln bara finns
 * på ett ställe: bokad, ansvarig, vaktmästare eller admin för passets församling.
 * Aldrig kiosk.
 */
export async function canAccessPassThread(caller: Caller, passId: number, supabase?: SupabaseClient): Promise<boolean> {
  if (!Number.isInteger(passId) || passId <= 0) return false
  const client = supabase ?? await createClient()
  const { data, error } = await client.rpc('can_access_pass_thread', { pass_id_arg: passId, uid: caller.id })
  return !error && data === true
}

/**
 * Samma regel som can_admin_church_for i databasen, som ren funktion:
 * täcker en admin med viss nivå och församling målförsamlingen?
 * adminChurchId null betyder att admin saknar församling (då räknas pastoratsnivån inte).
 */
export function levelCoversChurch(
  admin: { adminLevel: string | null | undefined; churchId: number | null; pastoratId: number | null },
  target: { churchId: number; pastoratId: number | null },
): boolean {
  switch (admin.adminLevel) {
    case 'super': return true
    case 'pastorat': return admin.churchId != null && admin.pastoratId === target.pastoratId
    case 'forsamling': return admin.churchId != null && admin.churchId === target.churchId
    default: return false
  }
}

export type ThreadMember = { profileId: string; name: string; isStaff: boolean }

export type PassThreadAudience = {
  passId: number
  title: string
  churchId: number
  vkId: string | null
  responsibleIds: string[]
  bookedIds: string[]
  churchAdminIds: string[]
  /** Alla med åtkomst till passets kommentarer (utom kiosk), med namn. */
  members: Map<string, ThreadMember>
}

type ChurchJoin = { pastorat_id: number | null } | { pastorat_id: number | null }[] | null | undefined
const pastoratOf = (c: ChurchJoin): number | null =>
  (Array.isArray(c) ? c[0]?.pastorat_id : c?.pastorat_id) ?? null

/**
 * Hämtar alla som har åtkomst till passets kommentarer, med service role.
 * Speglar pass_thread_access_for i databasen. Anroparen MÅSTE först ha
 * kontrollerat att den inloggade själv har åtkomst (canAccessPassThread).
 * Returnerar null om passet inte finns.
 */
export async function loadPassThreadAudience(passId: number): Promise<PassThreadAudience | null> {
  const admin = createAdminClient()
  const { data: pass } = await admin
    .from('passes')
    .select('id, title, church_id, vk_profile_id, churches(pastorat_id)')
    .eq('id', passId)
    .maybeSingle()
  if (!pass) return null

  const target = { churchId: pass.church_id as number, pastoratId: pastoratOf(pass.churches as ChurchJoin) }

  const [{ data: resp }, { data: books }, { data: admins }] = await Promise.all([
    admin.from('pass_responsible').select('profile_id').eq('pass_id', passId),
    admin.from('bookings').select('profile_id').eq('pass_id', passId).not('profile_id', 'is', null),
    admin.from('profiles').select('id, admin_level, church_id, churches(pastorat_id)').neq('admin_level', 'none'),
  ])

  const responsibleIds = Array.from(new Set((resp ?? []).map(r => r.profile_id as string).filter(Boolean)))
  const bookedIds = Array.from(new Set((books ?? []).map(b => b.profile_id as string).filter(Boolean)))
  const churchAdminIds = (admins ?? [])
    .filter(a => levelCoversChurch(
      { adminLevel: a.admin_level, churchId: a.church_id, pastoratId: pastoratOf(a.churches as ChurchJoin) },
      target,
    ))
    .map(a => a.id as string)
  const vkId = (pass.vk_profile_id as string | null) ?? null

  const allIds = Array.from(new Set([...responsibleIds, ...bookedIds, ...churchAdminIds, ...(vkId ? [vkId] : [])]))
  const { data: profiles } = allIds.length
    ? await admin.from('profiles').select('id, name, role, is_employee').in('id', allIds)
    : { data: [] as { id: string; name: string; role: string; is_employee: boolean }[] }

  const staffIds = new Set([...responsibleIds, ...churchAdminIds, ...(vkId ? [vkId] : [])])
  const members = new Map<string, ThreadMember>()
  for (const p of profiles ?? []) {
    if (p.role === 'kiosk') continue
    members.set(p.id, { profileId: p.id, name: p.name, isStaff: staffIds.has(p.id) || p.is_employee === true })
  }

  const keep = (ids: string[]) => ids.filter(id => members.has(id))
  return {
    passId,
    title: pass.title as string,
    churchId: target.churchId,
    vkId: vkId && members.has(vkId) ? vkId : null,
    responsibleIds: keep(responsibleIds),
    bookedIds: keep(bookedIds),
    churchAdminIds: keep(churchAdminIds),
    members,
  }
}

export const unauthorized = () => Response.json({ error: 'Ej inloggad' }, { status: 401 })
export const forbidden = (msg = 'Saknar behörighet') => Response.json({ error: msg }, { status: 403 })

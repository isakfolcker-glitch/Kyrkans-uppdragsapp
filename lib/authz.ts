// Gemensamma behörighetskontroller för API-routes som använder service role.
// Service role går förbi databasens RLS, så samma regler måste kontrolleras här.
//
// Medlemskapsmodellen: en person kan tillhöra flera församlingar via
// profile_churches, med egen roll och adminnivå i varje församling.
// Reglerna speglar databasfunktionerna is_system_super_admin, has_pastorat_admin_access
// och can_admin_church (supabase/migrations/016_multi_church_memberships.sql),
// med ett undantag som gör koden striktare: pastoratsbehörighet kräver att båda
// församlingarna har samma pastorat_id som INTE är tomt.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type AdminLevel = 'none' | 'forsamling' | 'pastorat' | 'super'

export type CallerMembership = {
  churchId: number
  pastoratId: number | null
  role: string
  adminLevel: AdminLevel
}

export type Caller = {
  id: string
  email: string | null
  name: string
  /** Systemsuperadmin: super i något aktivt medlemskap eller äldre profiles.admin_level = super. */
  isSuper: boolean
  /** Högsta nivå i något aktivt medlemskap. Används bara som förkontroll, aldrig som ensam behörighet. */
  adminLevel: AdminLevel
  memberships: CallerMembership[]
}

const RANK: Record<AdminLevel, number> = { none: 0, forsamling: 1, pastorat: 2, super: 3 }
const LEVELS: AdminLevel[] = ['none', 'forsamling', 'pastorat', 'super']

export function levelRank(level: string | null | undefined): number {
  return RANK[(level ?? 'none') as AdminLevel] ?? 0
}

function maxLevel(...levels: (string | null | undefined)[]): AdminLevel {
  const r = Math.max(0, ...levels.map(levelRank))
  return LEVELS[r]
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

export function isValidRole(role: unknown): role is (typeof VALID_ROLES)[number] {
  return typeof role === 'string' && (VALID_ROLES as readonly string[]).includes(role)
}

/** Förkontroll: är personen admin någonstans alls? Ersätter aldrig kontrollen för en viss församling. */
export function isAdmin(caller: Caller | null): caller is Caller {
  return !!caller && (caller.isSuper || levelRank(caller.adminLevel) >= 1)
}

/**
 * Samma regel som can_set_admin_level i databasen, men för anroparens nivå
 * i den församling det gäller (inte högsta nivå någonstans).
 */
export function canAssignLevel(callerLevelInChurch: AdminLevel, level: string): boolean {
  if (callerLevelInChurch === 'super') return true
  if (callerLevelInChurch === 'pastorat') return ['none', 'forsamling', 'pastorat'].includes(level)
  if (callerLevelInChurch === 'forsamling') return ['none', 'forsamling'].includes(level)
  return false
}

/**
 * Anroparens nivå i en viss församling. Ren funktion så att den kan enhetstestas.
 * - superadmin: super överallt
 * - direkt medlemskap i församlingen: den nivån
 * - pastorat- eller supernivå i en församling med samma (icke tomma) pastorat: pastorat
 */
export function levelInChurch(caller: Caller, churchId: number, churchPastoratId: number | null): AdminLevel {
  if (caller.isSuper) return 'super'
  const direct = caller.memberships.find(m => m.churchId === churchId)?.adminLevel ?? 'none'
  const pastoratAccess = churchPastoratId != null && caller.memberships.some(m =>
    levelRank(m.adminLevel) >= RANK.pastorat && m.pastoratId != null && m.pastoratId === churchPastoratId)
  return maxLevel(direct, pastoratAccess ? 'pastorat' : 'none')
}

/** Hämtar inloggad användare med alla aktiva medlemskap. caller är null om ej inloggad. */
export async function getCaller(): Promise<{ caller: Caller | null; supabase: SupabaseClient }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { caller: null, supabase }

  const admin = createAdminClient()
  const [{ data: p }, { data: rows }] = await Promise.all([
    admin.from('profiles').select('name, admin_level').eq('id', user.id).maybeSingle(),
    admin.from('profile_churches')
      .select('church_id, role, admin_level, churches(pastorat_id)')
      .eq('profile_id', user.id)
      .eq('active', true),
  ])

  type Row = { church_id: number; role: string; admin_level: string; churches: { pastorat_id: number | null } | { pastorat_id: number | null }[] | null }
  const memberships: CallerMembership[] = ((rows ?? []) as unknown as Row[]).map(r => {
    const church = Array.isArray(r.churches) ? r.churches[0] : r.churches
    return {
      churchId: Number(r.church_id),
      pastoratId: church?.pastorat_id ?? null,
      role: r.role,
      adminLevel: (LEVELS as string[]).includes(r.admin_level) ? (r.admin_level as AdminLevel) : 'none',
    }
  })
  const isSuper = p?.admin_level === 'super' || memberships.some(m => m.adminLevel === 'super')

  return {
    supabase,
    caller: {
      id: user.id,
      email: user.email ?? null,
      name: p?.name ?? 'Administratören',
      isSuper,
      adminLevel: isSuper ? 'super' : maxLevel(...memberships.map(m => m.adminLevel)),
      memberships,
    },
  }
}

/** Anroparens nivå i församlingen. Finns inte församlingen blir nivån none. */
export async function churchLevel(caller: Caller, churchId: number | null | undefined): Promise<AdminLevel> {
  if (churchId == null || Number.isNaN(Number(churchId))) return 'none'
  const admin = createAdminClient()
  const { data } = await admin.from('churches').select('id, pastorat_id').eq('id', Number(churchId)).maybeSingle()
  if (!data) return 'none'
  return levelInChurch(caller, Number(churchId), data.pastorat_id ?? null)
}

/** Samma regel som can_admin_church i databasen. Utan församling: bara superadmin. */
export async function canAdminChurch(caller: Caller, churchId: number | null | undefined): Promise<boolean> {
  if (churchId == null) return caller.isSuper
  return levelRank(await churchLevel(caller, churchId)) >= RANK.forsamling
}

/** Högsta nivå en person har någonstans (alla aktiva medlemskap och äldre profiles.admin_level). null om personen inte finns. */
export async function profileMaxLevel(targetId: string): Promise<{ level: AdminLevel; churchIds: number[] } | null> {
  const admin = createAdminClient()
  const [{ data: profile }, { data: rows }] = await Promise.all([
    admin.from('profiles').select('id, admin_level').eq('id', targetId).maybeSingle(),
    admin.from('profile_churches').select('church_id, admin_level').eq('profile_id', targetId).eq('active', true),
  ])
  if (!profile) return null
  return {
    level: maxLevel(profile.admin_level, ...(rows ?? []).map(r => r.admin_level)),
    churchIds: (rows ?? []).map(r => Number(r.church_id)),
  }
}

/**
 * Samma idé som can_admin_profile: anroparen är admin i en församling där personen
 * har aktivt medlemskap, och personens högsta nivå (i alla församlingar) är inte
 * högre än anroparens nivå i den församlingen.
 * - churchId: kontrollera bara den församlingen (personen måste vara medlem där).
 * - strictlyLower: personens nivå måste vara lägre, inte lika (t.ex. sätta lösenord).
 * Personer utan medlemskap kan bara administreras av superadmin.
 */
export async function canAdminProfile(
  caller: Caller,
  targetId: string,
  churchId?: number | null,
  opts: { strictlyLower?: boolean } = {},
): Promise<boolean> {
  if (!isAdmin(caller)) return false
  const target = await profileMaxLevel(targetId)
  if (!target) return false

  const candidates = churchId != null
    ? target.churchIds.filter(c => c === Number(churchId))
    : target.churchIds

  const allowedAt = (lvl: AdminLevel) => levelRank(lvl) >= RANK.forsamling && (opts.strictlyLower
    ? levelRank(target.level) < levelRank(lvl)
    : levelRank(target.level) <= levelRank(lvl))

  if (!candidates.length) {
    // Ingen församling att pröva mot. Bara superadmin, och bara om ingen församling angavs.
    return churchId == null && caller.isSuper && allowedAt('super')
  }
  for (const c of candidates) {
    if (allowedAt(await churchLevel(caller, c))) return true
  }
  return false
}

export async function canAdminPass(caller: Caller, passId: number): Promise<boolean> {
  if (!isAdmin(caller) || !Number.isFinite(passId)) return false
  const admin = createAdminClient()
  const { data } = await admin.from('passes').select('church_id').eq('id', passId).maybeSingle()
  return !!data && canAdminChurch(caller, data.church_id)
}

export type StaffPermission =
  | 'kan_skapa_pass' | 'kan_redigera_pass' | 'kan_se_bokningar' | 'kan_hantera_bokningar'
  | 'kan_se_personal' | 'kan_lagg_till_personal' | 'kan_hantera_grupper' | 'kan_skicka_utskick'

export const STAFF_PERMISSIONS: readonly StaffPermission[] = [
  'kan_skapa_pass', 'kan_redigera_pass', 'kan_se_bokningar', 'kan_hantera_bokningar',
  'kan_se_personal', 'kan_lagg_till_personal', 'kan_hantera_grupper', 'kan_skicka_utskick',
]

/**
 * Anställd (direkt aktivt medlemskap med rollen anstalld i just den församlingen)
 * som en admin uttryckligen gett behörigheten i profile_church_permissions för
 * just den församlingen. Gäller aldrig andra församlingar.
 */
export async function hasStaffPermission(caller: Caller, perm: StaffPermission, churchId: number | null | undefined): Promise<boolean> {
  if (churchId == null || Number.isNaN(Number(churchId))) return false
  if (!(STAFF_PERMISSIONS as readonly string[]).includes(perm)) return false
  const m = caller.memberships.find(x => x.churchId === Number(churchId))
  if (!m || m.role !== 'anstalld') return false
  const admin = createAdminClient()
  const { data } = await admin.from('profile_church_permissions')
    .select(perm).eq('profile_id', caller.id).eq('church_id', Number(churchId)).maybeSingle()
  return (data as Record<string, unknown> | null)?.[perm] === true
}

/** Admin för församlingen, eller anställd med den givna behörigheten i just den församlingen. */
export async function canAdminOrStaff(caller: Caller, perm: StaffPermission, churchId: number | null | undefined): Promise<boolean> {
  if (await canAdminChurch(caller, churchId)) return true
  return hasStaffPermission(caller, perm, churchId)
}

/** Kioskkonto: aktivt medlemskap med rollen kiosk i just den församlingen. */
export function isKioskIn(caller: Caller, churchId: number | null | undefined): boolean {
  if (churchId == null) return false
  return caller.memberships.some(m => m.churchId === Number(churchId) && m.role === 'kiosk')
}

/** Grupper som hör till en viss församling (inte gemensamma grupper utan församling). */
export async function filterGroupsForChurch(groupIds: unknown, churchId: number): Promise<string[]> {
  if (!Array.isArray(groupIds) || !groupIds.length) return []
  const ids = groupIds.filter((g): g is string => typeof g === 'string')
  if (!ids.length) return []
  const admin = createAdminClient()
  const { data } = await admin.from('groups').select('id, church_id').in('id', ids).eq('church_id', churchId)
  return (data ?? []).map(g => g.id)
}

/** Profil-id:n bland ids som har aktivt medlemskap i församlingen. */
export async function filterMembersOfChurch(profileIds: unknown, churchId: number): Promise<Set<string>> {
  if (!Array.isArray(profileIds) || !profileIds.length) return new Set()
  const ids = profileIds.filter((p): p is string => typeof p === 'string')
  if (!ids.length) return new Set()
  const admin = createAdminClient()
  const { data } = await admin.from('profile_churches')
    .select('profile_id').eq('church_id', churchId).eq('active', true).in('profile_id', ids)
  return new Set((data ?? []).map(r => r.profile_id as string))
}

export const unauthorized = () => Response.json({ error: 'Ej inloggad' }, { status: 401 })
export const forbidden = (msg = 'Saknar behörighet') => Response.json({ error: msg }, { status: 403 })

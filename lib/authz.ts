// Gemensamma behörighetskontroller för API-routes som använder service role.
// Service role går förbi databasens RLS, så samma regler måste kontrolleras här.
//
// Medlemskapsmodellen: en person kan tillhöra flera församlingar via
// profile_churches, med egen roll och adminnivå i varje församling.
// Ett medlemskap räknas bara när det är aktivt OCH accepterat
// (active = true AND accepted_at IS NOT NULL). Väntande inbjudningar ger
// ingen behörighet och ingen synlighet.
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
  /** Endast den låsta systemägaren, verifierad genom databasen. */
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
  if (level === 'super') return false
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
  const directLevel = caller.memberships.find(m => m.churchId === churchId)?.adminLevel ?? 'none'
  const direct = directLevel === 'super' ? 'pastorat' : directLevel
  const pastoratAccess = churchPastoratId != null && caller.memberships.some(m =>
    levelRank(m.adminLevel) >= RANK.pastorat && m.pastoratId != null && m.pastoratId === churchPastoratId)
  return maxLevel(direct, pastoratAccess ? 'pastorat' : 'none')
}

/** Hämtar inloggad användare med alla aktiva och accepterade medlemskap. caller är null om ej inloggad. */
export async function getCaller(): Promise<{ caller: Caller | null; supabase: SupabaseClient }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { caller: null, supabase }

  const { data: owner, error: ownerError } = await supabase.rpc('is_system_super_admin')
  const isSuper = !ownerError && owner === true
  const admin = createAdminClient()
  const [{ data: p }, { data: rows }] = await Promise.all([
    admin.from('profiles').select('name, admin_level').eq('id', user.id).maybeSingle(),
    admin.from('profile_churches')
      .select('church_id, role, admin_level, churches(pastorat_id)')
      .eq('profile_id', user.id)
      .eq('active', true)
      .not('accepted_at', 'is', null),
  ])

  type Row = { church_id: number; role: string; admin_level: string; churches: { pastorat_id: number | null } | { pastorat_id: number | null }[] | null }
  const memberships: CallerMembership[] = ((rows ?? []) as unknown as Row[]).map(r => {
    const church = Array.isArray(r.churches) ? r.churches[0] : r.churches
    return {
      churchId: Number(r.church_id),
      pastoratId: church?.pastorat_id ?? null,
      role: !isSuper && r.role === 'superadmin' ? 'padmin' : r.role,
      adminLevel: r.admin_level === 'super' && !isSuper ? 'pastorat' : (LEVELS as string[]).includes(r.admin_level) ? (r.admin_level as AdminLevel) : 'none',
    }
  })

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

export type ProfileMemberships = {
  /** Högsta nivå: accepterade OCH väntande medlemskap samt äldre profiles.admin_level (striktast möjliga). */
  level: AdminLevel
  /** Församlingar där personen har aktivt, accepterat medlemskap. */
  churchIds: number[]
  /** Församlingar där personen har en väntande inbjudan. */
  pendingChurchIds: number[]
}

/** Personens medlemskap och högsta nivå. null om personen inte finns. */
export async function profileMaxLevel(targetId: string): Promise<ProfileMemberships | null> {
  const admin = createAdminClient()
  const [{ data: owner, error: ownerError }, { data: profile }, { data: rows }] = await Promise.all([
    admin.from('system_owner').select('profile_id').eq('profile_id', targetId).maybeSingle(),
    admin.from('profiles').select('id, admin_level').eq('id', targetId).maybeSingle(),
    admin.from('profile_churches').select('church_id, admin_level, accepted_at').eq('profile_id', targetId).eq('active', true),
  ])
  if (ownerError) throw new Error('Systemägarens behörighet kunde inte verifieras')
  if (!profile) return null
  const all = (rows ?? []) as { church_id: number; admin_level: string; accepted_at: string | null }[]
  return {
    level: owner ? 'super' : maxLevel(profile.admin_level, ...all.map(r => r.admin_level)),
    churchIds: all.filter(r => r.accepted_at != null).map(r => Number(r.church_id)),
    pendingChurchIds: all.filter(r => r.accepted_at == null).map(r => Number(r.church_id)),
  }
}

/** Ren regel: tillåter anroparens nivå åtgärden mot en person med viss nivå? */
export function levelAllows(callerLevel: AdminLevel, targetLevel: AdminLevel, strictlyLower = false): boolean {
  if (levelRank(callerLevel) < RANK.forsamling) return false
  return strictlyLower
    ? levelRank(targetLevel) < levelRank(callerLevel)
    : levelRank(targetLevel) <= levelRank(callerLevel)
}

/**
 * Samma idé som can_admin_profile: anroparen är admin i en församling där personen
 * har aktivt och accepterat medlemskap, och personens högsta nivå (i alla
 * församlingar) är inte högre än anroparens nivå i den församlingen.
 * - churchId: kontrollera bara den församlingen (personen måste vara accepterad medlem där).
 * - strictlyLower: personens nivå måste vara lägre, inte lika.
 * Personer utan accepterat medlemskap kan bara administreras av superadmin.
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

  if (!candidates.length) {
    // Ingen församling att pröva mot. Bara superadmin, och bara om ingen församling angavs.
    return churchId == null && caller.isSuper && levelAllows('super', target.level, opts.strictlyLower)
  }
  for (const c of candidates) {
    if (levelAllows(await churchLevel(caller, c), target.level, opts.strictlyLower)) return true
  }
  return false
}

/** Ren regel för canAdminAllMemberships, så att den kan enhetstestas. */
export function coversAllMemberships(
  callerLevels: Record<number, AdminLevel>,
  target: Pick<ProfileMemberships, 'level' | 'churchIds'>,
  opts: { churchId?: number | null; strictlyLower?: boolean } = {},
): boolean {
  if (!target.churchIds.length) return false
  if (opts.churchId != null && !target.churchIds.includes(Number(opts.churchId))) return false
  return target.churchIds.every(c => levelAllows(callerLevels[c] ?? 'none', target.level, opts.strictlyLower))
}

/**
 * Striktare än canAdminProfile, för sådant som påverkar hela kontot (lösenord,
 * namn, telefon): ALLA personens accepterade medlemskap ligger i församlingar
 * som anroparen administrerar, med nivåtak i var och en. Personen måste ha minst
 * ett accepterat medlemskap (och i churchId om den anges).
 */
export async function canAdminAllMemberships(
  caller: Caller,
  targetId: string,
  opts: { churchId?: number | null; strictlyLower?: boolean } = {},
): Promise<boolean> {
  if (!isAdmin(caller)) return false
  const target = await profileMaxLevel(targetId)
  if (!target) return false
  const levels: Record<number, AdminLevel> = {}
  for (const c of target.churchIds) levels[c] = await churchLevel(caller, c)
  return coversAllMemberships(levels, target, opts)
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

/** Profil-id:n bland ids som har aktivt och accepterat medlemskap i församlingen. */
export async function filterMembersOfChurch(profileIds: unknown, churchId: number): Promise<Set<string>> {
  if (!Array.isArray(profileIds) || !profileIds.length) return new Set()
  const ids = profileIds.filter((p): p is string => typeof p === 'string')
  if (!ids.length) return new Set()
  const admin = createAdminClient()
  const { data } = await admin.from('profile_churches')
    .select('profile_id').eq('church_id', churchId).eq('active', true).not('accepted_at', 'is', null)
    .in('profile_id', ids)
  return new Set((data ?? []).map(r => r.profile_id as string))
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
    case 'pastorat': return admin.churchId != null && admin.pastoratId != null && admin.pastoratId === target.pastoratId
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

  // Lokal adminåtkomst och den enda systemägaren räknas separat.
  const [{ data: resp }, { data: books }, { data: memberships }, { data: systemOwners }, { data: kioskRows }] = await Promise.all([
    admin.from('pass_responsible').select('profile_id').eq('pass_id', passId),
    admin.from('bookings').select('profile_id').eq('pass_id', passId).not('profile_id', 'is', null),
    admin.from('profile_churches').select('profile_id, admin_level, church_id, churches(pastorat_id)')
      .eq('active', true).not('accepted_at', 'is', null).neq('admin_level', 'none'),
    admin.from('system_owner').select('profile_id'),
    // Kioskkonton i passets församling räknas aldrig in, som i databasen.
    admin.from('profile_churches').select('profile_id')
      .eq('church_id', pass.church_id).eq('role', 'kiosk').eq('active', true),
  ])
  const kioskIds = new Set((kioskRows ?? []).map(k => k.profile_id as string))

  const responsibleIds = Array.from(new Set((resp ?? []).map(r => r.profile_id as string).filter(Boolean)))
  const bookedIds = Array.from(new Set((books ?? []).map(b => b.profile_id as string).filter(Boolean)))
  const churchAdminIds = Array.from(new Set([
    ...(memberships ?? [])
      .filter(m => levelCoversChurch(
        { adminLevel: m.admin_level === 'super' ? 'pastorat' : m.admin_level, churchId: m.church_id, pastoratId: pastoratOf(m.churches as ChurchJoin) },
        target,
      ))
      .map(m => m.profile_id as string),
    ...(systemOwners ?? []).map(p => p.profile_id as string),
  ]))
  const vkId = (pass.vk_profile_id as string | null) ?? null

  const allIds = Array.from(new Set([...responsibleIds, ...bookedIds, ...churchAdminIds, ...(vkId ? [vkId] : [])]))
  const { data: profiles } = allIds.length
    ? await admin.from('profiles').select('id, name, role, is_employee').in('id', allIds)
    : { data: [] as { id: string; name: string; role: string; is_employee: boolean }[] }

  const staffIds = new Set([...responsibleIds, ...churchAdminIds, ...(vkId ? [vkId] : [])])
  const members = new Map<string, ThreadMember>()
  for (const p of profiles ?? []) {
    if (p.role === 'kiosk' || kioskIds.has(p.id)) continue
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

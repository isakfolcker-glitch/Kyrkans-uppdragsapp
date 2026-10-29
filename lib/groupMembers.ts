// Gruppmedlemskap (profile_groups) för API-routes med service role.
// Ändrar bara det som faktiskt ändras, så att medlemmens joined_at och
// is_leader (gruppansvarig, används av gruppchatten) bevaras när en person sparas.
import type { SupabaseClient } from '@supabase/supabase-js'

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/** Ren regel: vad som ska tas bort, läggas till och ändras för att nå önskat läge. */
export function planGroupSync(
  existing: { group_id: string; is_leader: boolean }[],
  desiredGroupIds: string[],
  leaderGroupIds: string[] | undefined,
) {
  const have = new Map(existing.map(e => [e.group_id, e.is_leader]))
  const desired = new Set(desiredGroupIds)
  const leaders = leaderGroupIds ? new Set(leaderGroupIds) : null
  const remove = Array.from(have.keys()).filter(g => !desired.has(g))
  const add = Array.from(desired).filter(g => !have.has(g)).map(g => ({ group_id: g, is_leader: leaders?.has(g) ?? false }))
  // Befintliga medlemmar ändras bara om ansvarslistan skickats med
  const setLeader: string[] = []
  const unsetLeader: string[] = []
  if (leaders) {
    for (const g of desired) {
      if (!have.has(g)) continue
      const now = have.get(g) === true
      if (leaders.has(g) && !now) setLeader.push(g)
      if (!leaders.has(g) && now) unsetLeader.push(g)
    }
  }
  return { remove, add, setLeader, unsetLeader }
}

/**
 * Synkar en persons medlemskap i församlingens grupper (churchGroupIds).
 * - groups: önskade grupper. Utelämnad = medlemskapen lämnas som de är.
 * - leaderGroups: grupper där personen är gruppansvarig. Utelämnad = oförändrat.
 * Grupper utanför churchGroupIds rörs aldrig. Returnerar felmeddelande eller null.
 */
export async function syncProfileGroups(
  admin: SupabaseClient,
  profileId: string,
  churchGroupIds: string[],
  opts: { groups?: unknown; leaderGroups?: unknown },
): Promise<string | null> {
  if (!churchGroupIds.length) return null
  const { data, error } = await admin.from('profile_groups').select('group_id, is_leader')
    .eq('profile_id', profileId).in('group_id', churchGroupIds)
  if (error) return error.message
  const existing = (data ?? []) as { group_id: string; is_leader: boolean }[]

  const allowed = new Set(churchGroupIds)
  const desired = opts.groups === undefined
    ? existing.map(e => e.group_id)
    : Array.from(new Set(strings(opts.groups).filter(g => allowed.has(g))))
  const leaders = opts.leaderGroups === undefined ? undefined : strings(opts.leaderGroups).filter(g => allowed.has(g))

  const plan = planGroupSync(existing, desired, leaders)
  if (plan.remove.length) {
    const { error: e } = await admin.from('profile_groups').delete().eq('profile_id', profileId).in('group_id', plan.remove)
    if (e) return e.message
  }
  if (plan.add.length) {
    const { error: e } = await admin.from('profile_groups').insert(plan.add.map(a => ({ profile_id: profileId, ...a })))
    if (e) return e.message
  }
  if (plan.setLeader.length) {
    const { error: e } = await admin.from('profile_groups').update({ is_leader: true }).eq('profile_id', profileId).in('group_id', plan.setLeader)
    if (e) return e.message
  }
  if (plan.unsetLeader.length) {
    const { error: e } = await admin.from('profile_groups').update({ is_leader: false }).eq('profile_id', profileId).in('group_id', plan.unsetLeader)
    if (e) return e.message
  }
  return null
}

/**
 * Sätter exakt vilka som är gruppansvariga i en grupp. Bara nuvarande medlemmar
 * kan vara ansvariga. Returnerar { error } vid fel eller { unknown } med id:n som inte är medlemmar.
 */
export async function setGroupLeaders(
  admin: SupabaseClient,
  groupId: string,
  leaderIds: string[],
): Promise<{ error?: string; unknown?: string[] }> {
  const { data, error } = await admin.from('profile_groups').select('profile_id, is_leader').eq('group_id', groupId)
  if (error) return { error: error.message }
  const members = new Map((data ?? []).map(m => [m.profile_id as string, m.is_leader === true]))
  const wanted = Array.from(new Set(leaderIds))
  const unknown = wanted.filter(id => !members.has(id))
  if (unknown.length) return { unknown }

  const wantedSet = new Set(wanted)
  const toSet = wanted.filter(id => members.get(id) !== true)
  const toUnset = Array.from(members.entries()).filter(([id, isLeader]) => isLeader && !wantedSet.has(id)).map(([id]) => id)
  if (toSet.length) {
    const { error: e } = await admin.from('profile_groups').update({ is_leader: true }).eq('group_id', groupId).in('profile_id', toSet)
    if (e) return { error: e.message }
  }
  if (toUnset.length) {
    const { error: e } = await admin.from('profile_groups').update({ is_leader: false }).eq('group_id', groupId).in('profile_id', toUnset)
    if (e) return { error: e.message }
  }
  return {}
}

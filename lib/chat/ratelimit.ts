// Spamskydd: högst 10 meddelanden per minut och 30 per 10 minuter per användare,
// över alla chattar. Räknas i databasen (chat_messages), så att det fungerar
// på flera serverinstanser. Borttagna meddelanden räknas med.
import type { SupabaseClient } from '@supabase/supabase-js'

export const RATE_LIMITS = [
  { windowMs: 60_000, max: 10 },
  { windowMs: 10 * 60_000, max: 30 },
] as const

/** Längsta fönstret, i millisekunder. */
const LONGEST_WINDOW_MS = Math.max(...RATE_LIMITS.map(l => l.windowMs))
/** Så många rader behövs för att avgöra alla gränser. */
const MAX_ROWS = Math.max(...RATE_LIMITS.map(l => l.max))

export type RateDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/**
 * Ren regel. createdAts är personens senaste meddelandetider (ISO-strängar eller Date),
 * i valfri ordning. Är en gräns nådd väntar man tills det äldsta av de meddelanden som
 * räknas faller ur fönstret. Vid flera nådda gränser gäller den längsta väntan.
 */
export function evaluateRateLimit(createdAts: (string | Date)[], now: number = Date.now()): RateDecision {
  const times = createdAts.map(t => new Date(t).getTime()).filter(t => Number.isFinite(t)).sort((a, b) => b - a)
  let wait = 0
  for (const { windowMs, max } of RATE_LIMITS) {
    const inWindow = times.filter(t => now - t < windowMs)
    if (inWindow.length >= max) {
      // Det max:te senaste meddelandet måste falla ur fönstret innan ett nytt får skickas
      const blocking = inWindow[max - 1]
      wait = Math.max(wait, Math.ceil((blocking + windowMs - now) / 1000))
    }
  }
  return wait > 0 ? { allowed: false, retryAfterSeconds: wait } : { allowed: true }
}

/** Hämtar personens senaste meddelanden (service role) och avgör om ett nytt får skickas. */
export async function checkRateLimit(admin: SupabaseClient, userId: string, now: number = Date.now()): Promise<RateDecision> {
  const since = new Date(now - LONGEST_WINDOW_MS).toISOString()
  const { data, error } = await admin
    .from('chat_messages')
    .select('created_at')
    .eq('author_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)
  // Går det inte att räkna släpper vi inte igenom obegränsat; försök igen strax.
  if (error) return { allowed: false, retryAfterSeconds: 5 }
  return evaluateRateLimit((data ?? []).map(r => r.created_at as string), now)
}

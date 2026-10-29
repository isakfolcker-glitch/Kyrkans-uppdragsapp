// Indatavalidering för chatt-API:t. Rena funktioner utan databas, så att de kan enhetstestas.

export const MAX_BODY_LENGTH = 4000
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
export const MAX_GROUP_ID_LENGTH = 200

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Gruppens id är fri text (groups.id). Bara en rimlig sträng släpps igenom till databasen. */
export function isValidGroupId(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_GROUP_ID_LENGTH
}

export function isUuid(raw: unknown): raw is string {
  return typeof raw === 'string' && UUID_RE.test(raw)
}

/** Positivt heltal från URL eller JSON. null om det inte är ett. */
export function parsePositiveInt(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isSafeInteger(raw) && raw > 0 ? raw : null
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** Antal tecken som databasen räknar (char_length räknar kodpunkter). */
export function charLength(text: string): number {
  return Array.from(text).length
}

export type BodyResult = { ok: true; body: string } | { ok: false; error: string }

/** Trimmar och kontrollerar meddelandetexten. */
export function validateBody(raw: unknown): BodyResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Meddelandet måste vara text' }
  // NUL-tecken kan databasen inte lagra
  if (raw.includes('\u0000')) return { ok: false, error: 'Meddelandet innehåller ogiltiga tecken' }
  const body = raw.trim()
  if (!body) return { ok: false, error: 'Meddelandet får inte vara tomt' }
  if (charLength(body) > MAX_BODY_LENGTH) {
    return { ok: false, error: `Meddelandet är för långt (högst ${MAX_BODY_LENGTH} tecken)` }
  }
  return { ok: true, body }
}

export type SendInput = { body: string; clientId: string; replyToId: number | null }
export type SendInputResult = { ok: true; input: SendInput } | { ok: false; error: string }

/** Kontrollerar body till POST /messages. */
export function validateSendInput(json: unknown): SendInputResult {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return { ok: false, error: 'Ogiltig begäran' }
  const { body, clientId, replyToId } = json as Record<string, unknown>
  const b = validateBody(body)
  if (!b.ok) return b
  if (!isUuid(clientId)) return { ok: false, error: 'clientId måste vara ett UUID' }
  let reply: number | null = null
  if (replyToId !== undefined && replyToId !== null) {
    reply = parsePositiveInt(replyToId)
    if (reply === null) return { ok: false, error: 'Ogiltigt replyToId' }
  }
  return { ok: true, input: { body: b.body, clientId: clientId.toLowerCase(), replyToId: reply } }
}

export type PageQuery =
  | { ok: true; before: number | null; after: number | null; limit: number }
  | { ok: false; error: string }

/** Tolkar ?before=, ?after= och ?limit= för meddelandelistan. */
export function parsePageQuery(params: URLSearchParams): PageQuery {
  const beforeRaw = params.get('before')
  const afterRaw = params.get('after')
  const limitRaw = params.get('limit')
  if (beforeRaw !== null && afterRaw !== null) return { ok: false, error: 'Använd antingen before eller after' }

  let before: number | null = null
  let after: number | null = null
  if (beforeRaw !== null) {
    before = parsePositiveInt(beforeRaw)
    if (before === null) return { ok: false, error: 'Ogiltigt värde för before' }
  }
  if (afterRaw !== null) {
    // after=0 betyder "från början"
    after = afterRaw === '0' ? 0 : parsePositiveInt(afterRaw)
    if (after === null) return { ok: false, error: 'Ogiltigt värde för after' }
  }
  let limit = DEFAULT_PAGE_SIZE
  if (limitRaw !== null) {
    const n = parsePositiveInt(limitRaw)
    if (n === null) return { ok: false, error: 'Ogiltigt värde för limit' }
    limit = Math.min(n, MAX_PAGE_SIZE)
  }
  return { ok: true, before, after, limit }
}

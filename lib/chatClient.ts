// Gruppchattens klientlogik: rena hjälpfunktioner (testas i tests/unit/chatClient.test.ts)
// och kopplingen till API:t. Kontraktet står i lib/chat/types.ts och docs/gruppchatt.md.
// Demoläget använder en egen ChatTransport (lib/demoStore.tsx) och når aldrig API:t.
import type {
  ChatApiError, ChatMessage, ChatMessageRow, ChatOverview, ChatSummary,
  MarkReadResult, MessagePage, SendMessageInput, SendMessageResult,
} from '@/lib/chat/types'

export const PAGE_SIZE = 50
export const MAX_BODY_LENGTH = 4000

/** Ett meddelande i listan. Lokala (ännu inte sparade) meddelanden har negativt id. */
export interface ChatItem extends ChatMessage {
  pending?: boolean
  failed?: ChatFailure
}

export interface ChatFailure {
  message: string
  /** Sekunder tills nästa försök (bara vid 429). */
  retryAfter?: number
  /** Om försök igen inte kan hjälpa (t.ex. arkiverad chatt). */
  permanent?: boolean
}

export const isLocal = (m: { id: number }) => m.id <= 0

// ─── Lista: sammanslagning, dubbletter och ändringar ─────

/**
 * Slår ihop inkommande meddelanden med listan. Dubbletter tas bort på id och
 * på clientId (ett lokalt meddelande ersätts av det sparade). Sparade meddelanden
 * sorteras på id, lokala som ännu inte sparats ligger sist.
 */
export function mergeMessages(list: ChatItem[], incoming: ChatMessage[]): ChatItem[] {
  const real = new Map<number, ChatItem>()
  for (const m of list) if (!isLocal(m)) real.set(m.id, m)
  for (const m of incoming) real.set(m.id, m)
  const savedClientIds = new Set(Array.from(real.values()).map(m => m.clientId))
  const local = list.filter(m => isLocal(m) && !savedClientIds.has(m.clientId))
  return [...Array.from(real.values()).sort((a, b) => a.id - b.id), ...local]
}

/** Senaste sparade meddelandets id, eller null om inget är sparat. */
export function lastRealId(list: ChatItem[]): number | null {
  let last: number | null = null
  for (const m of list) if (!isLocal(m) && (last === null || m.id > last)) last = m.id
  return last
}

/** Äldsta sparade meddelandets id (för "Visa äldre"). */
export function firstRealId(list: ChatItem[]): number | null {
  let first: number | null = null
  for (const m of list) if (!isLocal(m) && (first === null || m.id < first)) first = m.id
  return first
}

/** Lägger in en redigering eller borttagning från Realtime. Samma lista tillbaka om inget ändras. */
export function applyRowUpdate(list: ChatItem[], row: ChatMessageRow): ChatItem[] {
  const i = list.findIndex(m => m.id === row.id)
  if (i < 0) return list
  const cur = list[i]
  if (cur.body === row.body && cur.editedAt === row.edited_at && cur.deletedAt === row.deleted_at) return list
  const next = list.slice()
  next[i] = { ...cur, body: row.body, editedAt: row.edited_at, deletedAt: row.deleted_at }
  return next
}

export function hasMessage(list: ChatItem[], row: Pick<ChatMessageRow, 'id' | 'client_id'>): boolean {
  return list.some(m => m.id === row.id || m.clientId === row.client_id)
}

// ─── Översikt ────────────────────────────────────────────

/** Senaste aktivitet först. Tomma chattar sist, sedan på namn. */
export function sortChats(chats: ChatSummary[]): ChatSummary[] {
  return chats.slice().sort((a, b) => {
    const ta = a.lastActivityAt ? Date.parse(a.lastActivityAt) : -Infinity
    const tb = b.lastActivityAt ? Date.parse(b.lastActivityAt) : -Infinity
    if (ta !== tb) return tb - ta
    return a.label.localeCompare(b.label, 'sv')
  })
}

/** Sök på gruppnamn (utan hänsyn till versaler) och filtret "Olästa". */
export function filterChats(chats: ChatSummary[], query: string, onlyUnread: boolean): ChatSummary[] {
  const q = query.trim().toLocaleLowerCase('sv')
  return chats.filter(c =>
    (!onlyUnread || c.unreadCount > 0) && (!q || c.label.toLocaleLowerCase('sv').includes(q)),
  )
}

export function totalUnread(chats: ChatSummary[]): number {
  return chats.reduce((sum, c) => sum + c.unreadCount, 0)
}

/** "7", "99+" (API:t räknar högst 100 per chatt). */
export function formatUnread(n: number): string {
  return n > 99 ? '99+' : String(Math.max(0, n))
}

/** Raden under gruppnamnet: "Du: Hej", "Anna: Hej" eller "Meddelandet togs bort". */
export function previewLine(chat: ChatSummary, meId: string): string {
  const last = chat.lastMessage
  if (!last) return 'Inga meddelanden än'
  if (last.deleted) return 'Meddelandet togs bort'
  const who = last.authorId && last.authorId === meId ? 'Du' : last.authorName.split(' ')[0]
  return `${who}: ${last.preview}`
}

// ─── Tid ─────────────────────────────────────────────────

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const DAY = 86_400_000

/** Klockslag, t.ex. "14:05". */
export function formatClock(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
}

/** Tid i chattlistan: klockslag idag, "igår", veckodag senaste veckan, annars "12 sep". */
export function formatListTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY)
  if (days <= 0) return formatClock(iso)
  if (days === 1) return 'igår'
  if (days < 7) return d.toLocaleDateString('sv-SE', { weekday: 'short' }).replace('.', '')
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '')
}

/** Dagsrubrik i konversationen: "Idag", "Igår" eller "12 september". */
export function formatDayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const days = Math.round((startOfDay(now) - startOfDay(d)) / DAY)
  if (days === 0) return 'Idag'
  if (days === 1) return 'Igår'
  return d.toLocaleDateString('sv-SE', d.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'long' }
    : { day: 'numeric', month: 'long', year: 'numeric' })
}

export const sameDay = (a: string, b: string) => {
  const da = new Date(a), db = new Date(b)
  return startOfDay(da) === startOfDay(db)
}

const GROUP_GAP_MS = 5 * 60_000

/** Visa avsändare och avatar? Inte om samma person skrev precis innan. */
export function shouldShowAuthor(prev: ChatMessage | undefined, cur: ChatMessage): boolean {
  if (!prev) return true
  if (prev.deletedAt || cur.deletedAt) return true
  const samePerson = prev.authorId !== null && prev.authorId === cur.authorId
  if (!samePerson) return true
  if (!sameDay(prev.createdAt, cur.createdAt)) return true
  return Date.parse(cur.createdAt) - Date.parse(prev.createdAt) > GROUP_GAP_MS
}

/** Är man (nästan) längst ned i rullningsytan? */
export function isNearBottom(m: { scrollHeight: number; scrollTop: number; clientHeight: number }, threshold = 80): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= threshold
}

// ─── Fel ─────────────────────────────────────────────────

export class ChatApiFailure extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: ChatApiError['code'],
    public retryAfter?: number,
  ) { super(message) }
  get network() { return this.status === 0 }
}

/** Sekunder att vänta enligt Retry-After eller svaret, minst 1 och högst 600. */
export function parseRetryAfter(header: string | null, bodyValue?: number): number {
  const fromHeader = header && /^\d+$/.test(header.trim()) ? Number(header.trim()) : NaN
  const n = Number.isFinite(fromHeader) ? fromHeader : bodyValue
  return Math.min(600, Math.max(1, Math.round(typeof n === 'number' && Number.isFinite(n) ? n : 30)))
}

/** Gör ett API-fel till text på enkel svenska och säger om man kan försöka igen. */
export function describeSendFailure(e: unknown): ChatFailure {
  if (!(e instanceof ChatApiFailure)) return { message: 'Något gick fel. Försök igen.' }
  if (e.network) return { message: 'Meddelandet skickades inte. Kontrollera nätverket och försök igen.' }
  if (e.status === 429) {
    const s = e.retryAfter ?? 30
    return { message: `Du skickar för många meddelanden. Försök igen om ${s} sekunder.`, retryAfter: s }
  }
  if (e.status === 403 && e.code === 'archived') return { message: 'Chatten är arkiverad. Du kan läsa men inte skriva.', permanent: true }
  if (e.status === 403 || e.status === 401) return { message: 'Du har inte längre tillgång till den här chatten.', permanent: true }
  if (e.status === 400) return { message: e.message, permanent: true }
  return { message: 'Meddelandet skickades inte. Försök igen.' }
}

// ─── Transport ───────────────────────────────────────────

/** Allt gränssnittet behöver av servern. Skarpt läge: apiTransport. Demoläge: lokalt i demoStore. */
export interface ChatTransport {
  overview(): Promise<ChatOverview>
  page(groupId: string, q: { before?: number; after?: number }): Promise<MessagePage>
  send(groupId: string, input: SendMessageInput): Promise<SendMessageResult>
  edit(groupId: string, id: number, body: string): Promise<ChatMessage>
  remove(groupId: string, id: number): Promise<ChatMessage>
  markRead(groupId: string, lastReadId: number): Promise<MarkReadResult>
}

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ChatApiFailure('Nätverksfel', 0)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (data ?? {}) as Partial<ChatApiError>
    throw new ChatApiFailure(
      typeof err.error === 'string' ? err.error : 'Något gick fel',
      res.status,
      err.code,
      res.status === 429 ? parseRetryAfter(res.headers.get('Retry-After'), err.retryAfter) : undefined,
    )
  }
  return data as T
}

const base = (groupId: string) => `/api/chat/${encodeURIComponent(groupId)}`

export const apiTransport: ChatTransport = {
  overview: () => call<ChatOverview>('/api/chat', 'GET'),
  page: (groupId, q) => {
    const params = new URLSearchParams()
    if (q.before) params.set('before', String(q.before))
    if (q.after) params.set('after', String(q.after))
    params.set('limit', String(PAGE_SIZE))
    return call<MessagePage>(`${base(groupId)}/messages?${params}`, 'GET')
  },
  send: (groupId, input) => call<SendMessageResult>(`${base(groupId)}/messages`, 'POST', input),
  edit: async (groupId, id, body) => (await call<{ message: ChatMessage }>(`${base(groupId)}/messages/${id}`, 'PATCH', { body })).message,
  remove: async (groupId, id) => (await call<{ message: ChatMessage }>(`${base(groupId)}/messages/${id}`, 'DELETE')).message,
  markRead: (groupId, lastReadId) => call<MarkReadResult>(`${base(groupId)}/read`, 'POST', { lastReadId }),
}

/** Nytt UUID för ett meddelande. Samma id används vid återförsök. */
export function newClientId(): string {
  return crypto.randomUUID()
}

// ─── Gruppansvariga ──────────────────────────────────────

/** Ny lista med gruppansvariga (exakt lista till PATCH groups/[id]). */
export function withLeader(current: string[], profileId: string, on: boolean): string[] {
  const rest = current.filter(id => id !== profileId)
  return on ? [...rest, profileId] : rest
}

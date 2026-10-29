// Gruppchatten i demoläget. Allt ligger i minnet och försvinner när sidan laddas om.
// Här finns inga anrop till API:t och ingen Realtime, bara påhittad data (lib/demoData.ts).
import type { ChatMessage, ChatOverview, ChatSummary, MessagePage } from '@/lib/chat/types'
import { ChatApiFailure, MAX_BODY_LENGTH, PAGE_SIZE, type ChatTransport } from '@/lib/chatClient'
import { DEMO_CHAT_SEED, DEMO_GROUPS, DEMO_CHURCHES, DEMO_PEOPLE } from '@/lib/demoData'

/** Den demoanvändare som chattar. id är person-id som text, som profilens uuid i skarpt läge. */
export interface DemoChatUser {
  id: string
  name: string
  ini: string
  av: string
  ac: string
  groups: string[]
}

export interface DemoChatStore {
  transportFor: (user: DemoChatUser) => ChatTransport
}

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function seed(now: number): ChatMessage[] {
  const rows: { group: string; person: number; at: number; text: string }[] = []
  for (const [group, list] of Object.entries(DEMO_CHAT_SEED)) {
    for (const [person, minutesAgo, text] of list) rows.push({ group, person, at: now - minutesAgo * 60_000, text })
  }
  rows.sort((a, b) => a.at - b.at)
  return rows.map((r, i) => {
    const p = DEMO_PEOPLE.find(x => x.id === r.person)
    return {
      id: i + 1, groupId: r.group, authorId: String(r.person),
      authorName: p?.name ?? 'Okänd', authorIni: p?.ini ?? '??', authorAvColor: p?.av ?? null, authorAcColor: p?.ac ?? null,
      authorIsLeader: p?.leaderGroups?.includes(r.group) ?? false,
      body: r.text, replyToId: null, clientId: uuid(i + 1),
      createdAt: new Date(r.at).toISOString(), editedAt: null, deletedAt: null, pinnedAt: null,
    }
  })
}

export function createDemoChat(now: number = Date.now()): DemoChatStore {
  let messages = seed(now)
  let nextId = messages.length + 1
  // Läsmarkeringar per användare och grupp. Utan markering är de två senaste meddelandena olästa.
  const reads = new Map<string, number>()
  const readKey = (userId: string, groupId: string) => `${userId}|${groupId}`

  const inGroup = (groupId: string) => messages.filter(m => m.groupId === groupId)
  const lastRead = (userId: string, groupId: string) => {
    const saved = reads.get(readKey(userId, groupId))
    if (saved !== undefined) return saved
    const list = inGroup(groupId)
    return list.length > 2 ? list[list.length - 3].id : 0
  }

  const summary = (user: DemoChatUser, groupId: string): ChatSummary | null => {
    const g = DEMO_GROUPS.find(x => x.id === groupId)
    if (!g) return null
    const list = inGroup(groupId)
    const last = list[list.length - 1]
    const readUpTo = lastRead(user.id, groupId)
    const church = DEMO_CHURCHES.find(c => c.id === g.churchId)
    const me = DEMO_PEOPLE.find(p => String(p.id) === user.id)
    return {
      groupId, label: g.label, cls: g.cls, churchId: g.churchId ?? null, churchName: church?.name ?? null,
      isLeader: me?.leaderGroups?.includes(groupId) ?? false,
      archived: false,
      unreadCount: list.filter(m => m.id > readUpTo && m.authorId !== user.id && !m.deletedAt).length,
      lastMessage: last
        ? {
            id: last.id, authorId: last.authorId, authorName: last.authorName,
            preview: last.deletedAt ? '' : last.body.slice(0, 200), deleted: !!last.deletedAt, createdAt: last.createdAt,
          }
        : null,
      lastActivityAt: last?.createdAt ?? null,
    }
  }

  const requireMember = (user: DemoChatUser, groupId: string) => {
    if (!user.groups.includes(groupId)) throw new ChatApiFailure('Du är inte med i den här chatten', 403)
  }

  const transportFor = (user: DemoChatUser): ChatTransport => ({
    async overview(): Promise<ChatOverview> {
      const chats = user.groups.map(g => summary(user, g)).filter((c): c is ChatSummary => c !== null)
      return { chats }
    },

    async page(groupId, q): Promise<MessagePage> {
      requireMember(user, groupId)
      const list = inGroup(groupId)
      if (q.after) {
        const newer = list.filter(m => m.id > q.after!)
        const slice = newer.slice(0, PAGE_SIZE)
        const hasMore = newer.length > slice.length
        return { messages: slice, hasMore, nextCursor: hasMore ? slice[slice.length - 1].id : null }
      }
      const older = q.before ? list.filter(m => m.id < q.before!) : list
      const slice = older.slice(-PAGE_SIZE)
      const hasMore = older.length > slice.length
      return { messages: slice, hasMore, nextCursor: hasMore ? slice[0].id : null }
    },

    async send(groupId, input) {
      requireMember(user, groupId)
      const body = input.body.trim()
      if (!body || Array.from(body).length > MAX_BODY_LENGTH) throw new ChatApiFailure('Meddelandet har fel längd', 400)
      const again = messages.find(m => m.clientId === input.clientId && m.authorId === user.id)
      if (again) return { message: again, duplicate: true }
      const me = DEMO_PEOPLE.find(p => String(p.id) === user.id)
      const message: ChatMessage = {
        id: nextId++, groupId, authorId: user.id, authorName: user.name, authorIni: user.ini,
        authorAvColor: user.av, authorAcColor: user.ac, authorIsLeader: me?.leaderGroups?.includes(groupId) ?? false,
        body, replyToId: null, clientId: input.clientId,
        createdAt: new Date().toISOString(), editedAt: null, deletedAt: null, pinnedAt: null,
      }
      messages = [...messages, message]
      return { message, duplicate: false }
    },

    async edit(groupId, id, body) {
      requireMember(user, groupId)
      const cur = messages.find(m => m.id === id && m.groupId === groupId)
      if (!cur) throw new ChatApiFailure('Meddelandet finns inte', 404)
      if (cur.authorId !== user.id) throw new ChatApiFailure('Du kan bara ändra dina egna meddelanden', 403)
      if (cur.deletedAt) throw new ChatApiFailure('Meddelandet är borttaget', 409)
      const text = body.trim()
      if (!text || Array.from(text).length > MAX_BODY_LENGTH) throw new ChatApiFailure('Meddelandet har fel längd', 400)
      const next = text === cur.body ? cur : { ...cur, body: text, editedAt: new Date().toISOString() }
      messages = messages.map(m => (m.id === id ? next : m))
      return next
    },

    async remove(groupId, id) {
      requireMember(user, groupId)
      const cur = messages.find(m => m.id === id && m.groupId === groupId)
      if (!cur) throw new ChatApiFailure('Meddelandet finns inte', 404)
      if (cur.authorId !== user.id) throw new ChatApiFailure('Du kan bara ändra dina egna meddelanden', 403)
      const next = cur.deletedAt ? cur : { ...cur, body: '', deletedAt: new Date().toISOString() }
      messages = messages.map(m => (m.id === id ? next : m))
      return next
    },

    async markRead(groupId, lastReadId) {
      requireMember(user, groupId)
      const list = inGroup(groupId)
      const last = list.length ? list[list.length - 1].id : 0
      const value = Math.max(Math.min(lastReadId, last), lastRead(user.id, groupId))
      reads.set(readKey(user.id, groupId), value)
      return { lastReadId: value }
    },
  })

  return { transportFor }
}

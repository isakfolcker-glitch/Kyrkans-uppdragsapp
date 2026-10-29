// Kontraktet för gruppchatten (migration 020). Frontend bygger mot dessa typer.
// Alla tider är ISO 8601-strängar. Inga känsliga fält: aldrig mail eller telefon,
// bara namn och de avatarfärger/initialer som profilen redan visar.

/** Det senaste meddelandet i en chatt, för översikten. */
export interface ChatLastMessage {
  id: number
  authorId: string | null
  authorName: string
  /** Högst 200 tecken. Tom om meddelandet är borttaget. */
  preview: string
  deleted: boolean
  createdAt: string
}

/** En rad i chattöversikten (GET /api/chat). */
export interface ChatSummary {
  groupId: string
  /** Gruppens namn. */
  label: string
  /** Gruppens färgklass (groups.cls), samma som övriga grupptaggar. */
  cls: string
  /** null för gemensamma grupper. */
  churchId: number | null
  churchName: string | null
  /** Den inloggade är gruppansvarig i gruppen. */
  isLeader: boolean
  /** Arkiverad chatt kan läsas men inte skrivas i. */
  archived: boolean
  /** Olästa meddelanden, högst 100 (visa "99+"). Egna och borttagna räknas inte. */
  unreadCount: number
  lastMessage: ChatLastMessage | null
  /** Tid för senaste meddelandet, null om chatten är tom. Listan är sorterad på detta. */
  lastActivityAt: string | null
}

export interface ChatOverview {
  chats: ChatSummary[]
}

/** Ett meddelande i API-form. Ett borttaget meddelande har body '' och deletedAt satt. */
export interface ChatMessage {
  id: number
  groupId: string
  /** null om författarens konto har raderats. */
  authorId: string | null
  /** 'Borttagen användare' om kontot har raderats. */
  authorName: string
  authorIni: string
  authorAvColor: string | null
  authorAcColor: string | null
  authorIsLeader: boolean
  body: string
  /** Finns i databasen och API:t från PR 1, gränssnittet kommer i PR 2. */
  replyToId: number | null
  /** Klientens eget id. Används för att koppla ihop ett optimistiskt meddelande med det sparade. */
  clientId: string
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
  /** Alltid null i PR 1 (fästa meddelanden kommer i PR 4). */
  pinnedAt: string | null
}

/**
 * En sida meddelanden, alltid i stigande ordning (äldst först).
 * - ?before=<id>: de `limit` meddelanden som kommer närmast före id (äldre historik).
 *   Utan before: de senaste. nextCursor är id att skicka som `before` för nästa sida.
 * - ?after=<id>: meddelanden efter id (luckor efter tappad uppkoppling).
 *   nextCursor är id att skicka som `after` för nästa sida.
 * nextCursor är null när hasMore är false.
 */
export interface MessagePage {
  messages: ChatMessage[]
  hasMore: boolean
  nextCursor: number | null
}

/** Rad i chat_messages som den kommer i en Realtime-händelse (payload.new). Saknar författarens namn. */
export interface ChatMessageRow {
  id: number
  group_id: string
  author_id: string | null
  body: string
  reply_to_id: number | null
  client_id: string
  created_at: string
  edited_at: string | null
  deleted_at: string | null
  deleted_by: string | null
  pinned_at: string | null
  pinned_by: string | null
}

/** Body till POST /api/chat/[groupId]/messages. */
export interface SendMessageInput {
  /** 1 till 4000 tecken efter trimning. */
  body: string
  /** UUID skapad av klienten. Samma clientId två gånger ger samma meddelande, aldrig en dubblett. */
  clientId: string
  /** Valfritt. Måste vara ett meddelande i samma chatt. */
  replyToId?: number | null
}

export interface SendMessageResult {
  message: ChatMessage
  /** true om clientId redan var sparat (återförsök). Svaret har då status 200 i stället för 201. */
  duplicate: boolean
}

/** Body till PATCH /api/chat/[groupId]/messages/[id]. */
export interface EditMessageInput {
  body: string
}

/** Body till POST /api/chat/[groupId]/read. */
export interface MarkReadInput {
  lastReadId: number
}

export interface MarkReadResult {
  /** Det värde som sparades (kan vara lägre än begärt, eller oförändrat om det redan var högre). */
  lastReadId: number
}

/** Alla felsvar har denna form. */
export interface ChatApiError {
  error: string
  /** Maskinläsbar orsak när klienten behöver skilja på fall. */
  code?: 'archived' | 'rate_limited' | 'client_id_conflict'
  /** Sekunder tills nästa försök (bara vid rate_limited, även i Retry-After-headern). */
  retryAfter?: number
}

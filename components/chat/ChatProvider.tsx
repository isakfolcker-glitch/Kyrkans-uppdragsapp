'use client'
// Gruppchattens tillstånd: översikt, meddelanden per chatt, sändning och Realtime.
// - Skarpt läge går via /api/chat (lib/chatClient.ts). Skyddet ligger i API och RLS.
// - Demoläget använder lokal data (lib/demoChat.ts) och varken API eller Realtime.
// - Bara EN Realtime-kanal för alla chattar (postgres_changes på chat_messages, RLS
//   skickar bara medlemmars händelser). Den städas bort vid utloggning.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useApp } from '@/lib/appStore'
import { useDemoChatTransport } from '@/lib/demoStore'
import type { ChatMessage, ChatMessageRow, ChatSummary } from '@/lib/chat/types'
import {
  apiTransport, applyRowUpdate, describeSendFailure, ChatApiFailure, hasMessage, lastRealId, mergeMessages,
  newClientId, sortChats, totalUnread, firstRealId, MAX_BODY_LENGTH,
  type ChatItem, type ChatTransport,
} from '@/lib/chatClient'

export interface ThreadState {
  messages: ChatItem[]
  loaded: boolean
  loading: boolean
  loadingOlder: boolean
  hasMore: boolean
  /** Fel vid hämtning (inte vid sändning), på svenska. */
  error: string | null
}

const EMPTY_THREAD: ThreadState = { messages: [], loaded: false, loading: false, loadingOlder: false, hasMore: false, error: null }

export type OverviewStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ChatApi {
  /** Chatten är påslagen för den här användaren (inte kiosk, inte utloggad). */
  enabled: boolean
  meId: string
  chats: ChatSummary[]
  overviewStatus: OverviewStatus
  unreadTotal: number
  activeGroupId: string | null
  openChat: (groupId: string) => void
  closeChat: () => void
  reloadOverview: () => void
  thread: (groupId: string) => ThreadState
  reloadThread: (groupId: string) => void
  loadOlder: (groupId: string) => void
  send: (groupId: string, body: string) => Promise<void>
  retry: (groupId: string, clientId: string) => void
  discard: (groupId: string, clientId: string) => void
  edit: (groupId: string, id: number, body: string) => Promise<string | null>
  remove: (groupId: string, id: number) => Promise<string | null>
  /** Chatten visas för användaren och är längst ned, så nya meddelanden räknas som lästa. */
  reportViewing: (groupId: string | null) => void
  markRead: (groupId: string) => void
}

const OFF: ChatApi = {
  enabled: false, meId: '', chats: [], overviewStatus: 'idle', unreadTotal: 0, activeGroupId: null,
  openChat: () => {}, closeChat: () => {}, reloadOverview: () => {}, thread: () => EMPTY_THREAD, reloadThread: () => {},
  loadOlder: () => {}, send: async () => {}, retry: () => {}, discard: () => {},
  edit: async () => null, remove: async () => null, reportViewing: () => {}, markRead: () => {},
}

const ChatCtx = createContext<ChatApi>(OFF)
export const useChat = () => useContext(ChatCtx)

/** Antal olästa meddelanden för menyn (0 om chatten är avstängd). */
export const useChatUnread = () => useContext(ChatCtx).unreadTotal

const OVERVIEW_DEBOUNCE_MS = 700

export function ChatProvider({ children }: { children: ReactNode }) {
  const { currentUser, profile, isKiosk, u } = useApp()
  const demoTransport = useDemoChatTransport()
  const usr = u()

  const kiosk = isKiosk()
  const realUserId: string | null = currentUser && profile ? (profile.id ?? currentUser.id) : null
  const mode: 'real' | 'demo' | 'off' = kiosk ? 'off' : demoTransport ? 'demo' : realUserId ? 'real' : 'off'
  const meId = mode === 'demo' ? String(usr.id) : (realUserId ?? '')
  const transport: ChatTransport | null = mode === 'demo' ? demoTransport : mode === 'real' ? apiTransport : null

  // Ritningen av den inloggade, för meddelanden som visas innan de är sparade.
  const meRef = useRef({ name: '', ini: '', av: '', ac: '' })
  const transportRef = useRef(transport)
  useEffect(() => {
    meRef.current = { name: profile?.name || usr.name, ini: usr.ini, av: usr.av, ac: usr.ac }
    transportRef.current = transport
  })

  const [chats, setChatsState] = useState<ChatSummary[]>([])
  const chatsRef = useRef<ChatSummary[]>([])
  const [overviewStatus, setOverviewStatus] = useState<OverviewStatus>('idle')
  const [threads, setThreadsState] = useState<Record<string, ThreadState>>({})
  const threadsRef = useRef<Record<string, ThreadState>>({})
  const [activeGroupId, setActive] = useState<string | null>(null)
  const activeRef = useRef<string | null>(null)
  const viewingRef = useRef<string | null>(null)
  const staleRef = useRef(new Set<string>())
  const readSentRef = useRef(new Map<string, number>())
  const catchingUp = useRef(new Map<string, 'running' | 'again'>())
  const overviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localSeq = useRef(0)
  const generation = useRef(0)

  const setChats = useCallback((fn: (prev: ChatSummary[]) => ChatSummary[]) => {
    chatsRef.current = fn(chatsRef.current)
    setChatsState(chatsRef.current)
  }, [])

  const updateThread = useCallback((groupId: string, fn: (t: ThreadState) => ThreadState) => {
    threadsRef.current = { ...threadsRef.current, [groupId]: fn(threadsRef.current[groupId] ?? EMPTY_THREAD) }
    setThreadsState(threadsRef.current)
  }, [])

  // ─── Översikt ─────────────────────────────────────────
  const loadOverview = useCallback(async (quiet: boolean) => {
    const t = transportRef.current
    if (!t) return
    const gen = generation.current
    if (!quiet) setOverviewStatus('loading')
    try {
      const { chats: next } = await t.overview()
      if (gen !== generation.current) return
      // Chatten som visas och är längst ned räknas som läst direkt, så att märket inte blinkar.
      const viewing = viewingRef.current
      setChats(() => sortChats(next.map(c => (c.groupId === viewing ? { ...c, unreadCount: 0 } : c))))
      setOverviewStatus('ready')
    } catch {
      if (gen === generation.current && !quiet) setOverviewStatus('error')
    }
  }, [setChats])

  const refreshOverviewSoon = useCallback(() => {
    if (overviewTimer.current) clearTimeout(overviewTimer.current)
    overviewTimer.current = setTimeout(() => { void loadOverview(true) }, OVERVIEW_DEBOUNCE_MS)
  }, [loadOverview])

  // ─── Meddelanden ──────────────────────────────────────
  const loadLatest = useCallback(async (groupId: string) => {
    const t = transportRef.current
    if (!t) return
    const gen = generation.current
    updateThread(groupId, th => ({ ...th, loading: true, error: null }))
    try {
      const page = await t.page(groupId, {})
      if (gen !== generation.current) return
      staleRef.current.delete(groupId)
      updateThread(groupId, th => ({
        ...th, loading: false, loaded: true, hasMore: page.hasMore, messages: mergeMessages(th.messages, page.messages),
      }))
    } catch (e) {
      if (gen !== generation.current) return
      updateThread(groupId, th => ({
        ...th, loading: false,
        error: e instanceof ChatApiFailure && e.status === 403
          ? 'Du är inte med i den här chatten.'
          : 'Kunde inte hämta meddelanden. Kontrollera nätverket och försök igen.',
      }))
    }
  }, [updateThread])

  /** Hämtar det som hänt sedan senast sedda meddelande (luckor, nya meddelanden, namn på författare). */
  const catchUp = useCallback(async (groupId: string) => {
    const t = transportRef.current
    if (!t) return
    const state = catchingUp.current.get(groupId)
    if (state) { catchingUp.current.set(groupId, 'again'); return }
    catchingUp.current.set(groupId, 'running')
    const gen = generation.current
    try {
      do {
        catchingUp.current.set(groupId, 'running')
        const th = threadsRef.current[groupId]
        const after = th ? lastRealId(th.messages) : null
        if (after === null) { await loadLatest(groupId); continue }
        let cursor: number | null = after
        // Högst fem sidor åt gången, resten hämtas nästa gång
        for (let i = 0; i < 5 && cursor !== null; i++) {
          const page = await t.page(groupId, { after: cursor })
          if (gen !== generation.current) return
          updateThread(groupId, cur => ({ ...cur, messages: mergeMessages(cur.messages, page.messages) }))
          cursor = page.hasMore ? page.nextCursor : null
        }
        staleRef.current.delete(groupId)
      } while (catchingUp.current.get(groupId) === 'again')
    } catch {
      // Tyst: nästa händelse eller återanslutning försöker igen
      staleRef.current.add(groupId)
    } finally {
      catchingUp.current.delete(groupId)
    }
  }, [loadLatest, updateThread])

  const openChat = useCallback((groupId: string) => {
    activeRef.current = groupId
    setActive(groupId)
    const th = threadsRef.current[groupId]
    if (!th?.loaded) { if (!th?.loading) void loadLatest(groupId) }
    else if (staleRef.current.has(groupId)) void catchUp(groupId)
  }, [loadLatest, catchUp])

  const closeChat = useCallback(() => {
    activeRef.current = null
    viewingRef.current = null
    setActive(null)
  }, [])

  const reloadThread = useCallback((groupId: string) => {
    const th = threadsRef.current[groupId]
    if (th?.loaded) void catchUp(groupId)
    else void loadLatest(groupId)
  }, [catchUp, loadLatest])

  const loadOlder = useCallback(async (groupId: string) => {
    const t = transportRef.current
    const th = threadsRef.current[groupId]
    if (!t || !th || !th.hasMore || th.loadingOlder) return
    const before = firstRealId(th.messages)
    if (before === null) return
    const gen = generation.current
    updateThread(groupId, cur => ({ ...cur, loadingOlder: true, error: null }))
    try {
      const page = await t.page(groupId, { before })
      if (gen !== generation.current) return
      updateThread(groupId, cur => ({
        ...cur, loadingOlder: false, hasMore: page.hasMore, messages: mergeMessages(cur.messages, page.messages),
      }))
    } catch {
      if (gen !== generation.current) return
      updateThread(groupId, cur => ({ ...cur, loadingOlder: false, error: 'Kunde inte hämta äldre meddelanden. Försök igen.' }))
    }
  }, [updateThread])

  // ─── Sändning ─────────────────────────────────────────
  const patchLocal = useCallback((groupId: string, clientId: string, fn: (m: ChatItem) => ChatItem) => {
    updateThread(groupId, th => ({ ...th, messages: th.messages.map(m => (m.clientId === clientId && m.id <= 0 ? fn(m) : m)) }))
  }, [updateThread])

  const deliver = useCallback(async (groupId: string, body: string, clientId: string, retried409 = false): Promise<void> => {
    const t = transportRef.current
    if (!t) return
    const gen = generation.current
    try {
      const { message } = await t.send(groupId, { body, clientId })
      if (gen !== generation.current) return
      updateThread(groupId, th => ({ ...th, messages: mergeMessages(th.messages, [message]) }))
      refreshOverviewSoon()
    } catch (e) {
      if (gen !== generation.current) return
      // 409: clientId används i en annan chatt. Ett nytt id löser det, en gång.
      if (e instanceof ChatApiFailure && e.status === 409 && e.code === 'client_id_conflict' && !retried409) {
        const fresh = newClientId()
        patchLocal(groupId, clientId, m => ({ ...m, clientId: fresh }))
        return deliver(groupId, body, fresh, true)
      }
      const failure = describeSendFailure(e)
      patchLocal(groupId, clientId, m => ({ ...m, pending: false, failed: failure }))
      if (e instanceof ChatApiFailure && e.status === 403) {
        if (e.code === 'archived') setChats(prev => prev.map(c => (c.groupId === groupId ? { ...c, archived: true } : c)))
        else void loadOverview(true)
      }
    }
  }, [updateThread, patchLocal, refreshOverviewSoon, setChats, loadOverview])

  const send = useCallback(async (groupId: string, rawBody: string) => {
    const body = rawBody.trim()
    if (!body || Array.from(body).length > MAX_BODY_LENGTH) return
    const clientId = newClientId()
    const me = meRef.current
    const item: ChatItem = {
      id: -(++localSeq.current), groupId, authorId: meId, authorName: me.name || 'Du', authorIni: me.ini,
      authorAvColor: me.av || null, authorAcColor: me.ac || null, authorIsLeader: false,
      body, replyToId: null, clientId, createdAt: new Date().toISOString(),
      editedAt: null, deletedAt: null, pinnedAt: null, pending: true,
    }
    updateThread(groupId, th => ({ ...th, messages: [...th.messages, item] }))
    await deliver(groupId, body, clientId)
  }, [meId, updateThread, deliver])

  const retry = useCallback((groupId: string, clientId: string) => {
    const item = threadsRef.current[groupId]?.messages.find(m => m.clientId === clientId && m.id <= 0)
    if (!item) return
    // Samma clientId: har meddelandet redan sparats ger API:t tillbaka det i stället för en dubblett
    patchLocal(groupId, clientId, m => ({ ...m, pending: true, failed: undefined }))
    void deliver(groupId, item.body, clientId)
  }, [patchLocal, deliver])

  const discard = useCallback((groupId: string, clientId: string) => {
    updateThread(groupId, th => ({ ...th, messages: th.messages.filter(m => !(m.clientId === clientId && m.id <= 0)) }))
  }, [updateThread])

  const mutate = useCallback(async (groupId: string, run: (t: ChatTransport) => Promise<ChatMessage>): Promise<string | null> => {
    const t = transportRef.current
    if (!t) return 'Chatten är inte tillgänglig.'
    try {
      const message = await run(t)
      updateThread(groupId, th => ({ ...th, messages: mergeMessages(th.messages, [message]) }))
      refreshOverviewSoon()
      return null
    } catch (e) {
      if (e instanceof ChatApiFailure) {
        if (e.network) return 'Kunde inte nå servern. Kontrollera nätverket och försök igen.'
        if (e.status === 403 && e.code === 'archived') return 'Chatten är arkiverad. Du kan läsa men inte skriva.'
        if (e.status === 409) return 'Meddelandet är redan borttaget.'
        if (e.status === 404) return 'Meddelandet finns inte längre.'
        if (e.status === 400) return e.message
      }
      return 'Något gick fel. Försök igen.'
    }
  }, [updateThread, refreshOverviewSoon])

  const edit = useCallback((groupId: string, id: number, body: string) => mutate(groupId, t => t.edit(groupId, id, body)), [mutate])
  const remove = useCallback((groupId: string, id: number) => mutate(groupId, t => t.remove(groupId, id)), [mutate])

  // ─── Läsmarkering ─────────────────────────────────────
  const reportViewing = useCallback((groupId: string | null) => {
    viewingRef.current = groupId
  }, [])

  const markRead = useCallback(async (groupId: string) => {
    const t = transportRef.current
    const th = threadsRef.current[groupId]
    const last = th ? lastRealId(th.messages) : null
    if (!t || last === null) return
    if ((readSentRef.current.get(groupId) ?? 0) >= last) {
      // Redan skickat, men märket kan ha kommit tillbaka av en sen översikt
      setChats(prev => prev.map(c => (c.groupId === groupId && c.unreadCount ? { ...c, unreadCount: 0 } : c)))
      return
    }
    readSentRef.current.set(groupId, last)
    try {
      await t.markRead(groupId, last)
      setChats(prev => prev.map(c => (c.groupId === groupId ? { ...c, unreadCount: 0 } : c)))
    } catch {
      readSentRef.current.delete(groupId)
    }
  }, [setChats])

  // ─── Start, byte av användare och utloggning ──────────
  // Tömmer allt: ingen chattdata ska ligga kvar efter utloggning eller byte av användare
  const resetAll = useCallback(() => {
    generation.current++
    if (overviewTimer.current) clearTimeout(overviewTimer.current)
    chatsRef.current = []; setChatsState([])
    threadsRef.current = {}; setThreadsState({})
    staleRef.current.clear(); readSentRef.current.clear(); catchingUp.current.clear()
    activeRef.current = null; viewingRef.current = null; setActive(null)
    setOverviewStatus('idle')
  }, [])

  useEffect(() => {
    if (mode === 'off') return
    generation.current++
    void loadOverview(false)
    return resetAll
  }, [mode, meId, loadOverview, resetAll])

  // ─── Realtime: en enda kanal (bara skarpt läge) ───────
  useEffect(() => {
    if (mode !== 'real') return
    const supabase = createClient()

    const resync = () => {
      void loadOverview(true)
      for (const gid of Object.keys(threadsRef.current)) {
        if (!threadsRef.current[gid].loaded) continue
        if (gid === activeRef.current) void catchUp(gid)
        else staleRef.current.add(gid)
      }
    }

    const onRow = (kind: 'INSERT' | 'UPDATE', row: ChatMessageRow) => {
      const gid = row.group_id
      // Okänd chatt (t.ex. nytt gruppmedlemskap): läs om översikten
      if (!chatsRef.current.some(c => c.groupId === gid)) { refreshOverviewSoon(); return }
      const th = threadsRef.current[gid]
      if (kind === 'UPDATE') {
        if (th?.loaded) updateThread(gid, cur => ({ ...cur, messages: applyRowUpdate(cur.messages, row) }))
      } else if (th?.loaded && !hasMessage(th.messages, row)) {
        // Raden saknar författarens namn: hämta det via ?after=
        if (gid === activeRef.current) void catchUp(gid)
        else staleRef.current.add(gid)
      }
      refreshOverviewSoon()
    }

    let dropped = false
    const channel = supabase.channel('chat-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, p => onRow('INSERT', p.new as ChatMessageRow))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, p => onRow('UPDATE', p.new as ChatMessageRow))
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          if (dropped) { dropped = false; resync() }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          dropped = true
        }
      })

    const onVisible = () => { if (document.visibilityState === 'visible') resync() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', resync)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', resync)
      void supabase.removeChannel(channel)
    }
  }, [mode, meId, loadOverview, catchUp, updateThread, refreshOverviewSoon])

  const api = useMemo<ChatApi>(() => mode === 'off' ? OFF : ({
    enabled: true, meId, chats, overviewStatus, unreadTotal: totalUnread(chats), activeGroupId,
    openChat, closeChat, reloadOverview: () => { void loadOverview(false) },
    thread: (groupId: string) => threads[groupId] ?? EMPTY_THREAD,
    reloadThread, loadOlder, send, retry, discard, edit, remove, reportViewing, markRead,
  }), [mode, meId, chats, overviewStatus, activeGroupId, threads, openChat, closeChat, loadOverview, reloadThread, loadOlder, send, retry, discard, edit, remove, reportViewing, markRead])

  return <ChatCtx.Provider value={api}>{children}</ChatCtx.Provider>
}

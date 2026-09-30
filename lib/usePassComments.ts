'use client'
// Kommentarer på ett pass: ladda, skriva, svara, redigera och ta bort.
// Skarpt läge går via /api/passes/{id}/messages (API och RLS avgör vem som får vad).
// Demoläget (ingen inloggad användare) använder demoStore och sparar bara lokalt.
// Ändringar visas direkt och återställs med ett felmeddelande om anropet misslyckas.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '@/lib/appStore'
import { useDemoComments } from '@/lib/demoStore'
import type { PassData, PersonData } from '@/lib/appData'
import type { CommentParticipant, PassMessage } from '@/types'
import { visibleMessages } from '@/lib/comments/threadView'

export type CommentsStatus = 'loading' | 'ready' | 'forbidden' | 'error'

export interface PassComments {
  status: CommentsStatus
  /** Synliga kommentarer och svar (platt lista, sorteras i groupThread). */
  messages: PassMessage[]
  /** Personer som kan @nämnas, utan en själv. */
  participants: CommentParticipant[]
  /** Senaste felmeddelandet på svenska, eller null. */
  error: string | null
  clearError: () => void
  meId: string
  /** Admin får ta bort andras kommentarer (API:t kontrollerar församlingen). */
  canModerate: boolean
  create: (body: string, mentionIds: string[], parentId?: number | null) => Promise<boolean>
  edit: (id: number, body: string) => Promise<boolean>
  remove: (id: number) => Promise<boolean>
  reload: () => void
}

const NETWORK_ERROR = 'Kunde inte nå servern. Kontrollera internetanslutningen och försök igen.'

function errorFor(status: number, serverMsg: unknown, fallback: string): string {
  if (typeof serverMsg === 'string' && serverMsg.trim()) return serverMsg
  if (status === 401) return 'Du är utloggad. Logga in igen och försök på nytt.'
  if (status === 403) return 'Du har inte behörighet att göra det här.'
  if (status === 404) return 'Kommentaren eller passet finns inte längre.'
  if (status === 409) return 'Kommentaren är borttagen.'
  return fallback
}

async function send(url: string, method: string, body?: unknown): Promise<{ ok: true; data: PassMessage } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) {
      return { ok: false, error: errorFor(res.status, data?.error, 'Något gick fel. Försök igen.') }
    }
    return { ok: true, data: data as PassMessage }
  } catch {
    return { ok: false, error: NETWORK_ERROR }
  }
}

/** Vilka som har åtkomst till ett pass i demoläget: bokade, ansvariga, vaktmästare och admin. */
function demoParticipants(pass: PassData | undefined, people: PersonData[]): CommentParticipant[] {
  if (!pass) return []
  const responsible = new Set((pass.responsibleUserIds ?? []).map(String))
  const ids = new Set<string>(responsible)
  for (const b of pass.bookings) if (b.personId != null) ids.add(String(b.personId))
  if (pass.vkProfileId) ids.add(String(pass.vkProfileId))
  const isPassAdmin = (p: PersonData) =>
    p.adminLevel === 'super' || p.adminLevel === 'pastorat' || (p.adminLevel === 'forsamling' && p.church === pass.church)
  for (const p of people) if (isPassAdmin(p)) ids.add(String(p.id))
  return people
    .filter(p => ids.has(String(p.id)))
    .map(p => ({
      profileId: String(p.id),
      name: p.name,
      isStaff: responsible.has(String(p.id)) || isPassAdmin(p) || !!p.isEmployee || String(pass.vkProfileId ?? '') === String(p.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'sv'))
}

export function usePassComments(passId: number): PassComments {
  const { currentUser, profile, isAdmin, u, passes, people } = useApp()
  const demo = useDemoComments()
  const isDemo = !currentUser
  const pass = passes.find(p => p.id === passId)
  const meId: string = currentUser ? String(currentUser.id) : String(u()?.id ?? '')
  const myName: string = currentUser ? (profile?.name ?? '') : (u()?.name ?? '')

  const [remote, setRemote] = useState<PassMessage[]>([])
  const [remoteParticipants, setRemoteParticipants] = useState<CommentParticipant[]>([])
  const [remoteStatus, setRemoteStatus] = useState<CommentsStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const tempId = useRef(-1)

  // ── Skarpt läge: hämta tråden och vilka som kan nämnas ──
  useEffect(() => {
    if (isDemo) return
    let cancelled = false
    const base = `/api/passes/${passId}/messages`
    fetch(base)
      .then(async res => {
        if (cancelled) return
        if (res.status === 403) { setRemoteStatus('forbidden'); return }
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (!res.ok || !Array.isArray(data)) {
          setRemoteStatus('error')
          setError(errorFor(res.status, data?.error, 'Kunde inte hämta kommentarerna.'))
          return
        }
        setRemote(data as PassMessage[])
        setRemoteStatus('ready')
      })
      .catch(() => {
        if (cancelled) return
        setRemoteStatus('error')
        setError(NETWORK_ERROR)
      })
    // Vilka som kan nämnas. Misslyckas det går det ändå att kommentera, bara utan @.
    fetch(`${base}/participants`)
      .then(r => (r.ok ? r.json() : []))
      .then(data => { if (!cancelled && Array.isArray(data)) setRemoteParticipants(data as CommentParticipant[]) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [passId, isDemo, reloadKey])

  // ── Demoläge ──
  const demoAll = useMemo(() => demoParticipants(pass, people), [pass, people])
  const allParticipants = isDemo ? demoAll : remoteParticipants
  const demoHasAccess = demoAll.some(p => p.profileId === meId)

  const status: CommentsStatus = isDemo ? (demoHasAccess ? 'ready' : 'forbidden') : remoteStatus
  const rawMessages = useMemo(
    () => (isDemo ? (demo?.comments ?? []).filter(m => m.passId === passId) : remote),
    [isDemo, demo?.comments, passId, remote],
  )
  const messages = useMemo(() => visibleMessages(rawMessages), [rawMessages])
  const participants = useMemo(() => allParticipants.filter(p => p.profileId !== meId), [allParticipants, meId])
  const meIsStaff = allParticipants.find(p => p.profileId === meId)?.isStaff ?? false

  const mentionRefs = useCallback(
    (ids: string[]) => ids
      .map(id => allParticipants.find(p => p.profileId === id))
      .filter((p): p is CommentParticipant => !!p)
      .map(p => ({ profileId: p.profileId, name: p.name })),
    [allParticipants],
  )

  const create = useCallback(async (body: string, mentionIds: string[], parentId: number | null = null) => {
    const text = body.trim()
    if (!text) return false
    setError(null)

    if (isDemo) {
      if (!demo) { setError('Demoläget är inte igång.'); return false }
      demo.addComment({
        passId, body: text, parentId,
        author: { id: meId, name: myName, isStaff: meIsStaff },
        mentions: mentionRefs(mentionIds),
      })
      return true
    }

    const temp: PassMessage = {
      id: tempId.current--, passId, parentId, authorId: meId, authorName: myName, body: text,
      createdAt: new Date().toISOString(), editedAt: null, deletedAt: null,
      authorIsStaff: meIsStaff, mentions: mentionRefs(mentionIds),
    }
    setRemote(prev => [...prev, temp])
    const r = await send(`/api/passes/${passId}/messages`, 'POST', { body: text, parentId: parentId ?? undefined, mentionIds })
    if (!r.ok) {
      setRemote(prev => prev.filter(m => m.id !== temp.id))
      setError(r.error)
      return false
    }
    setRemote(prev => prev.map(m => (m.id === temp.id ? r.data : m)))
    return true
  }, [isDemo, demo, passId, meId, myName, meIsStaff, mentionRefs])

  const edit = useCallback(async (id: number, body: string) => {
    const text = body.trim()
    if (!text) return false
    setError(null)

    if (isDemo) {
      demo?.editComment(id, text)
      return true
    }

    const before = remote.find(m => m.id === id)
    if (!before) return false
    setRemote(prev => prev.map(m => (m.id === id ? { ...m, body: text, editedAt: new Date().toISOString() } : m)))
    const r = await send(`/api/passes/${passId}/messages/${id}`, 'PATCH', { body: text })
    if (!r.ok) {
      setRemote(prev => prev.map(m => (m.id === id ? before : m)))
      setError(r.error)
      return false
    }
    setRemote(prev => prev.map(m => (m.id === id ? r.data : m)))
    return true
  }, [isDemo, demo, passId, remote])

  const remove = useCallback(async (id: number) => {
    setError(null)

    if (isDemo) {
      demo?.deleteComment(id)
      return true
    }

    const before = remote.find(m => m.id === id)
    if (!before) return false
    setRemote(prev => prev.map(m => (m.id === id ? { ...m, body: '', mentions: [], deletedAt: new Date().toISOString() } : m)))
    const r = await send(`/api/passes/${passId}/messages/${id}`, 'DELETE')
    if (!r.ok) {
      setRemote(prev => prev.map(m => (m.id === id ? before : m)))
      setError(r.error)
      return false
    }
    setRemote(prev => prev.map(m => (m.id === id ? r.data : m)))
    return true
  }, [isDemo, demo, passId, remote])

  const reload = useCallback(() => {
    setError(null)
    setRemoteStatus('loading')
    setReloadKey(k => k + 1)
  }, [])

  return {
    status,
    messages,
    participants,
    error,
    clearError: () => setError(null),
    meId,
    canModerate: isAdmin(),
    create,
    edit,
    remove,
    reload,
  }
}

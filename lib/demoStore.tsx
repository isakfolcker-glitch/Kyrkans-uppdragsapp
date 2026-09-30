'use client'
import { useState, ReactNode, createContext, useContext } from 'react'
import { Ctx, ALL_PERMS, NO_PERMS, StaffPerms } from '@/lib/appStore'
import type { PassMessage } from '@/types'
import { Group, Church, PersonData, PassData, MessageData, NotifData, ChurchMembershipData, NAV_ITEMS } from '@/lib/appData'
import { DEMO_GROUPS, DEMO_CHURCHES, DEMO_PASTORAT, DEMO_USERS, DEMO_PEOPLE, DEMO_PASSES, DEMO_MESSAGES, DEMO_NOTIFICATIONS, DEMO_COMMENTS } from '@/lib/demoData'

let _nextId = 200
let _nextCommentId = 1000

// ─── Kommentarer på pass (demoläge) ────────────────────
// Eget kontext så att appStore inte behöver ändras. Skarpt läge går via
// /api/passes/{id}/messages, se lib/usePassComments.ts. Allt här sparas bara lokalt.
export interface DemoCommentInput {
  passId: number
  body: string
  parentId: number | null
  author: { id: string; name: string; isStaff: boolean }
  mentions: { profileId: string; name: string }[]
}
export interface DemoComments {
  comments: PassMessage[]
  addComment: (input: DemoCommentInput) => PassMessage
  editComment: (id: number, body: string) => void
  deleteComment: (id: number) => void
}
const DemoCommentsCtx = createContext<DemoComments | null>(null)
/** null utanför demoläget. */
export const useDemoComments = () => useContext(DemoCommentsCtx)

function initSelfBookings(idx: number, passes: PassData[]) {
  const uid = DEMO_USERS[idx].id
  const out: Record<number, boolean> = {}
  for (const p of passes) {
    if (p.bookings.some(b => b.personId === uid)) out[p.id] = true
  }
  return out
}

export function DemoProvider({ children, initialIndex = 2 }: { children: ReactNode; initialIndex?: number }) {
  const [userIndex, setUserIndex]     = useState(initialIndex)
  const [page, setPage]               = useState(() => NAV_ITEMS[DEMO_USERS[initialIndex].role]?.[0]?.id ?? 'pass')
  const [passes, setPasses]           = useState<PassData[]>(DEMO_PASSES)
  const [people, setPeople]           = useState<PersonData[]>(DEMO_PEOPLE)
  const [messages, setMessages]       = useState<MessageData[]>(DEMO_MESSAGES)
  const [notifications, setNotifs]    = useState<NotifData[]>(DEMO_NOTIFICATIONS)
  const [selfBookings, setSelfBkgs]   = useState<Record<number, boolean>>(() => initSelfBookings(initialIndex, DEMO_PASSES))
  const [selfWaitlist, setSelfWl]     = useState<Record<number, number>>({})
  const [activeChurch, setActiveChurch] = useState(0)
  const [groupFilter, setGroupFilter] = useState('alla')
  const [modal, setModal]             = useState<ReactNode | null>(null)
  const [groups, setGroups]           = useState<Group[]>(DEMO_GROUPS)
  const [churches, setChurches]       = useState<Church[]>(DEMO_CHURCHES)
  const [comments, setComments]       = useState<PassMessage[]>(DEMO_COMMENTS)

  const usr          = DEMO_USERS[userIndex]
  const adminLevel   = usr.adminLevel
  const role         = usr.role

  const isIdeell     = () => role === 'ideell'
  const isAnstalld   = () => role === 'anstalld'
  const isFAdmin     = () => adminLevel === 'forsamling'
  const isPAdmin     = () => adminLevel === 'pastorat'
  const isSuperAdmin = () => adminLevel === 'super'
  const isAdmin      = () => ['forsamling', 'pastorat', 'super'].includes(adminLevel)
  const isKiosk      = () => role === 'kiosk'
  const staffPerms: StaffPerms = isAdmin() || isAnstalld() ? ALL_PERMS : NO_PERMS
  const perm         = (key: keyof StaffPerms) => isAdmin() ? true : staffPerms[key]
  const isResponsible = (pass: PassData) => usr.responsibleForPasses?.includes(pass.id) ?? false
  const canBook      = () => !isAdmin() && !isKiosk()
  const canViewBkgs  = (p: PassData) => isAdmin() || isResponsible(p)
  const canAddBkg    = (p: PassData) => isAdmin() || isResponsible(p)
  const canRemoveBkg = (p: PassData) => isAdmin() || isResponsible(p)
  const canMsgBooked = (p: PassData) => isAdmin() || isResponsible(p)
  const canEditPass  = (p: PassData) => isAdmin() || isResponsible(p)
  const canCancelPass = (p: PassData) => isAdmin() || isResponsible(p)
  const canDeletePass = () => isAdmin() || perm('kan_redigera_pass')
  const canCreatePass = () => isAdmin() || perm('kan_skapa_pass')
  const canManage    = () => isAdmin() || isAnstalld()
  const canMakePAdmin = () => isPAdmin() || isSuperAdmin()
  const canMakeFAdmin = (c: number) => isPAdmin() || isSuperAdmin() || (isFAdmin() && usr.churches.includes(c))
  const currentChurchId = () => (isPAdmin() || isSuperAdmin())
    ? (churches[activeChurch]?.id ?? churches[0]?.id ?? 1)
    : (usr.churches[0] ?? 1)
  const memberships: ChurchMembershipData[] = usr.churches.map(churchId => ({
    profileId: String(usr.id),
    churchId,
    role: usr.role,
    adminLevel: usr.adminLevel,
    isEmployee: usr.isEmployee,
    active: true,
  }))
  const availableChurches = churches.filter(church => church.id !== undefined && usr.churches.includes(church.id))
  const currentMembership = () => memberships.find(membership => membership.churchId === currentChurchId()) ?? null
  const currentGroups = () => usr.groups

  const u = () => DEMO_USERS[userIndex]

  const addNotif = (type: string, title: string, body: string) => {
    setNotifs(prev => [{ id: Date.now(), userId: usr.id, type, title, body, time: new Date().toISOString(), read: false }, ...prev])
  }
  const markNotifRead = (id: number) => setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  const markAllNotifsRead = () => setNotifs(prev => prev.map(n => n.userId === usr.id ? { ...n, read: true } : n))

  // Simulerar väntelista-uppflyttning: om aktuell demo-användare står först i kön
  // för passet och en plats öppnas, flyttas de upp precis som i skarpt läge.
  const tryPromoteFromWaitlist = (passId: number) => {
    const pass = passes.find(p => p.id === passId)
    if (!pass || !(pass.waitlistCount ?? 0) || selfWaitlist[passId] !== 1) return
    setSelfWl(prev => { const n = { ...prev }; delete n[passId]; return n })
    setSelfBkgs(prev => ({ ...prev, [passId]: true }))
    setPasses(prev => prev.map(p => p.id === passId ? { ...p, waitlistCount: Math.max(0, (p.waitlistCount ?? 1) - 1), filled: p.filled + 1 } : p))
    addNotif('waitlist_promoted', `Du har fått en plats: ${pass.title}`, `${pass.date} kl ${pass.time} – ${pass.plats}`)
  }

  const cycleUser = () => {
    const next = (userIndex + 1) % DEMO_USERS.length
    const nextUsr = DEMO_USERS[next]
    setUserIndex(next)
    setPage(NAV_ITEMS[nextUsr.role]?.[0]?.id ?? 'pass')
    setActiveChurch(0)
    setGroupFilter('alla')
    setModal(null)
    setSelfBkgs(initSelfBookings(next, passes))
  }

  const goTo        = (p: string) => { setPage(p); setModal(null) }
  const setChurch   = (i: number) => setActiveChurch(i)
  const setFilter   = (f: string) => setGroupFilter(f)
  const showModal   = (content: ReactNode) => setModal(content)
  const closeModal  = () => setModal(null)

  const doBook = (id: number) => {
    const pass = passes.find(p => p.id === id)
    setPasses(prev => prev.map(p => p.id === id && p.filled < p.spots ? { ...p, filled: p.filled + 1 } : p))
    setSelfBkgs(prev => ({ ...prev, [id]: true }))
    if (pass) addNotif('signup', `Du är uppsatt: ${pass.title}`, `${pass.date} kl ${pass.time} – ${pass.plats}`)
  }
  const doUnbook = (id: number) => {
    setPasses(prev => prev.map(p => p.id === id ? { ...p, filled: Math.max(0, p.filled - 1) } : p))
    setSelfBkgs(prev => { const n = { ...prev }; delete n[id]; return n })
    tryPromoteFromWaitlist(id)
  }
  const joinWaitlist = (id: number) => {
    const pass = passes.find(p => p.id === id)
    const pos = (pass?.waitlistCount ?? 0) + 1
    setSelfWl(prev => ({ ...prev, [id]: pos }))
    setPasses(prev => prev.map(p => p.id === id ? { ...p, waitlistCount: (p.waitlistCount ?? 0) + 1 } : p))
    if (pass) addNotif('waitlist_joined', `Du är på väntelistan: ${pass.title}`, `Vi hör av oss om en plats blir ledig.`)
  }
  const leaveWaitlist = (id: number) => {
    setSelfWl(prev => { const n = { ...prev }; delete n[id]; return n })
  }
  const publishNow = (id: number) => {
    setPasses(prev => prev.map(p => p.id === id ? { ...p, pubStatus: 'live', pubDate: '', history: [...p.history, 'Publicerades – Demo'] } : p))
  }
  const toggleAvail = () => {}
  const updateUserNotif = () => {}

  const addPass = async (p: PassData) => {
    setPasses(prev => [{ ...p, id: _nextId++ }, ...prev])
  }
  const updatePass  = (p: PassData) => setPasses(prev => prev.map(x => x.id === p.id ? p : x))
  const deletePass  = (id: number)  => setPasses(prev => prev.filter(x => x.id !== id))
  const cancelPass  = (id: number)  => setPasses(prev => prev.map(p => p.id === id ? { ...p, cancelled: true, history: [...p.history, 'Ställdes in – Demo'] } : p))
  const reloadPasses = async () => {}

  const addBooking = (passId: number, b: PassData['bookings'][0]) => {
    setPasses(prev => prev.map(p => p.id === passId ? { ...p, bookings: [...p.bookings, b], filled: p.filled + 1 } : p))
  }
  const removeBooking = (passId: number, idx: number) => {
    setPasses(prev => prev.map(p => p.id === passId ? { ...p, bookings: p.bookings.filter((_, i) => i !== idx), filled: Math.max(0, p.filled - 1) } : p))
    tryPromoteFromWaitlist(passId)
  }

  const addPerson    = (p: PersonData) => setPeople(prev => [...prev, { ...p, id: _nextId++ }])
  const updatePerson = (p: PersonData) => setPeople(prev => prev.map(x => x.id === p.id ? p : x))
  const deletePerson = (id: any)       => setPeople(prev => prev.filter(x => x.id !== id))
  const addMessage   = (m: MessageData) => setMessages(prev => [m, ...prev])
  const addChurch    = (c: Church)      => setChurches(prev => [...prev, c])
  const updateChurch = (idx: number, c: Church) => setChurches(prev => prev.map((x, i) => i === idx ? c : x))
  const deleteChurch = (idx: number)   => setChurches(prev => prev.filter((_, i) => i !== idx))

  const addPastorat    = async () => {}
  const updatePastorat = async () => {}
  const deletePastorat = async () => {}
  const addGroup       = (g: Group)  => setGroups(prev => [...prev, g])
  const deleteGroup    = (id: string) => setGroups(prev => prev.filter(g => g.id !== id))

  const nextPersonId   = () => _nextId++
  const nextPassId     = () => _nextId++
  const nextPastoratId = () => _nextId++

  const getResponsibleNames = (pass: PassData) =>
    (pass.responsibleUserIds || []).map(id => people.find(p => p.id === id)?.name).filter(Boolean).join(', ')

  const addComment = (input: DemoCommentInput): PassMessage => {
    const m: PassMessage = {
      id: _nextCommentId++, passId: input.passId, parentId: input.parentId,
      authorId: input.author.id, authorName: input.author.name, body: input.body,
      createdAt: new Date().toISOString(), editedAt: null, deletedAt: null,
      authorIsStaff: input.author.isStaff, mentions: input.mentions,
    }
    setComments(prev => [...prev, m])
    return m
  }
  const editComment = (id: number, body: string) =>
    setComments(prev => prev.map(m => m.id === id ? { ...m, body, editedAt: new Date().toISOString() } : m))
  const deleteComment = (id: number) =>
    setComments(prev => prev.map(m => m.id === id ? { ...m, body: '', mentions: [], deletedAt: new Date().toISOString() } : m))

  const logout      = () => {}
  const inviteUser  = async () => {}
  const updateStaffPerms = async () => {}

  return (
    <Ctx.Provider value={{
      userIndex, page, passes, people, messages, notifications,
      selfBookings, selfWaitlist, activeChurch, groupFilter, modal,
      groups, churches, pastorat: DEMO_PASTORAT, users: DEMO_USERS,
      memberships, availableChurches,
      currentUser: null, profile: null, loadingAuth: false, staffPerms,
      u, isIdeell, isAnstalld, isFAdmin, isPAdmin, isSuperAdmin, isAdmin, isKiosk,
      isResponsible, canBook, canViewBkgs, canAddBkg, canRemoveBkg, canMsgBooked,
      canEditPass, canCancelPass, canDeletePass, canCreatePass, canManage,
      canMakePAdmin, canMakeFAdmin, perm,
      cycleUser, goTo, setChurch, setFilter, showModal, closeModal,
      doBook, doUnbook, joinWaitlist, leaveWaitlist, publishNow, toggleAvail, updateUserNotif, markNotifRead, markAllNotifsRead,
      addPass, updatePass, deletePass, cancelPass, reloadPasses, addBooking, removeBooking,
      addPerson, updatePerson, deletePerson, addMessage,
      addChurch, updateChurch, deleteChurch,
      addPastorat, updatePastorat, deletePastorat, addGroup, deleteGroup,
      nextPersonId, nextPassId, nextPastoratId, updateStaffPerms,
      getResponsibleNames, currentChurchId, currentMembership, currentGroups, logout, inviteUser,
    }}>
      <DemoCommentsCtx.Provider value={{ comments, addComment, editComment, deleteComment }}>
        {children}
      </DemoCommentsCtx.Provider>
    </Ctx.Provider>
  )
}

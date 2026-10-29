'use client'
import { useState, ReactNode, createContext, useContext } from 'react'
import { Ctx, NO_PERMS, StaffPerms } from '@/lib/appStore'
import type { PassMessage } from '@/types'
import { Group, Church, PersonData, PassData, MessageData, NotifData, ChurchMembershipData, NAV_ITEMS, PastoratData, UserDef, Role } from '@/lib/appData'
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

interface DemoAccess {
  permissionsFor: (personId: string | number, churchId: number) => StaffPerms
  saveAccess: (person: PersonData, role: Role, perms: StaffPerms, passIds: number[]) => void
}
const DemoAccessCtx = createContext<DemoAccess | null>(null)
export const useDemoAccess = () => useContext(DemoAccessCtx)

const permissionKey = (personId: string | number, churchId: number) => `${personId}:${churchId}`

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
  const [users, setUsers] = useState<UserDef[]>(() => structuredClone(DEMO_USERS))
  const [page, setPage]               = useState(() => NAV_ITEMS[DEMO_USERS[initialIndex].role]?.[0]?.id ?? 'pass')
  const [passes, setPasses]           = useState<PassData[]>(DEMO_PASSES)
  const [people, setPeople]           = useState<PersonData[]>(() => [
    ...structuredClone(DEMO_PEOPLE),
    ...DEMO_USERS.flatMap(user => user.churches.filter(church => !DEMO_PEOPLE.some(p => p.id === user.id && p.church === church)).map(church => ({
      id: user.id, name: user.name, mail: user.email, ini: user.ini, av: user.av, ac: user.ac,
      role: user.role, adminLevel: user.adminLevel, isEmployee: user.isEmployee, church, groups: church === 1 ? user.groups : [], available: user.available,
    }))),
  ])
  const [messages, setMessages]       = useState<MessageData[]>(DEMO_MESSAGES)
  const [notifications, setNotifs]    = useState<NotifData[]>(DEMO_NOTIFICATIONS)
  const [selfBookings, setSelfBkgs]   = useState<Record<number, boolean>>(() => initSelfBookings(initialIndex, DEMO_PASSES))
  const [selfWaitlist, setSelfWl]     = useState<Record<number, number>>({})
  const [activeChurch, setActiveChurch] = useState(0)
  const [groupFilter, setGroupFilter] = useState('alla')
  const [modal, setModal]             = useState<ReactNode | null>(null)
  const [groups, setGroups]           = useState<Group[]>(DEMO_GROUPS)
  const [churches, setChurches]       = useState<Church[]>(DEMO_CHURCHES)
  const [pastorat, setPastorat] = useState<PastoratData[]>(DEMO_PASTORAT)
  const [permissions, setPermissions] = useState<Record<string, StaffPerms>>({
    '2:1': { ...NO_PERMS, kan_skapa_pass: true, kan_se_personal: true, kan_lagg_till_personal: true },
  })
  const [comments, setComments]       = useState<PassMessage[]>(DEMO_COMMENTS)

  const identity = users[userIndex]
  const managedPastoratIds = new Set(people.filter(p => p.id === identity.id && p.adminLevel === 'pastorat').map(p => churches.find(c => c.id === p.church)?.pastoratId).filter(id => id != null))
  const availableChurches = churches.filter(church => church.id !== undefined && (identity.adminLevel === 'super' || people.some(person => person.id === identity.id && person.church === church.id) || (church.pastoratId != null && managedPastoratIds.has(church.pastoratId))))
  const currentChurchId = () => {
    const selected = churches[activeChurch]?.id
    return availableChurches.find(church => church.id === selected)?.id ?? availableChurches[0]?.id ?? 0
  }
  const member = people.find(person => person.id === identity.id && person.church === currentChurchId())
  const selectedPastorat = churches.find(c => c.id === currentChurchId())?.pastoratId
  const inheritedAdmin = selectedPastorat != null && managedPastoratIds.has(selectedPastorat)
  const role = identity.adminLevel === 'super' ? identity.role : member?.role ?? (inheritedAdmin ? 'padmin' : 'ideell')
  const adminLevel = identity.adminLevel === 'super' ? 'super' : member?.adminLevel ?? (inheritedAdmin ? 'pastorat' : 'none')
  const badgeLbl = role === 'superadmin' ? 'Superadmin' : role === 'padmin' ? 'Pastoratsadmin' : role === 'fadmin' ? 'Församlingsadmin' : role === 'anstalld' ? 'Anställd' : role === 'kiosk' ? 'Kiosk' : 'Ideell'
  const usr: UserDef = { ...identity, role, adminLevel, badgeLbl, churches: availableChurches.map(c => c.id!), isEmployee: member?.isEmployee ?? identity.isEmployee, groups: member?.groups ?? [], responsibleForPasses: passes.filter(p => p.responsibleUserIds.includes(identity.id)).map(p => p.id) }

  const isIdeell     = () => role === 'ideell'
  const isAnstalld   = () => role === 'anstalld'
  const isFAdmin     = () => adminLevel === 'forsamling'
  const isPAdmin     = () => adminLevel === 'pastorat'
  const isSuperAdmin = () => adminLevel === 'super'
  const isAdmin      = () => ['forsamling', 'pastorat', 'super'].includes(adminLevel)
  const isKiosk      = () => role === 'kiosk'
  const permissionsFor = (personId: string | number, churchId: number) => permissions[permissionKey(personId, churchId)] ?? NO_PERMS
  const staffPerms = permissionsFor(identity.id, currentChurchId())
  const perm         = (key: keyof StaffPerms) => isAdmin() ? true : isAnstalld() && staffPerms[key]
  const isResponsible = (pass: PassData) => pass.responsibleUserIds?.includes(identity.id) ?? false
  const canBook      = () => !isAdmin() && !isKiosk()
  const canViewBkgs  = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_se_bokningar')
  const canAddBkg    = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_hantera_bokningar')
  const canRemoveBkg = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_hantera_bokningar')
  const canMsgBooked = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_skicka_utskick')
  const canEditPass  = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_redigera_pass')
  const canCancelPass = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_redigera_pass')
  const canDeletePass = () => isAdmin() || perm('kan_redigera_pass')
  const canCreatePass = () => isAdmin() || perm('kan_skapa_pass')
  const canManage    = () => isAdmin() || isAnstalld()
  const canMakePAdmin = () => isPAdmin() || isSuperAdmin()
  const canMakeFAdmin = (c: number) => isPAdmin() || isSuperAdmin() || (isFAdmin() && currentChurchId() === c)
  const memberships: ChurchMembershipData[] = availableChurches.map(church => {
    const direct = people.find(p => p.id === identity.id && p.church === church.id)
    return { profileId: String(usr.id), churchId: church.id!, role: identity.adminLevel === 'super' ? 'superadmin' : direct?.role ?? 'padmin', adminLevel: identity.adminLevel === 'super' ? 'super' : direct?.adminLevel ?? 'pastorat', isEmployee: direct?.isEmployee ?? true, active: true }
  })
  const currentMembership = () => memberships.find(membership => membership.churchId === currentChurchId()) ?? null
  const currentGroups = () => usr.groups

  const u = () => usr

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
    const next = (userIndex + 1) % users.length
    const nextUsr = users[next]
    setUserIndex(next)
    setPage(NAV_ITEMS[nextUsr.role]?.[0]?.id ?? 'pass')
    setActiveChurch(0)
    setGroupFilter('alla')
    setModal(null)
    setSelfBkgs(initSelfBookings(next, passes))
    setSelfWl({})
  }

  const goTo        = (p: string) => { setPage(p); setModal(null) }
  const setChurch   = (i: number) => {
    if (!availableChurches.some(c => c.id === churches[i]?.id)) return
    setActiveChurch(i); setPage('oversikt'); setModal(null); setGroupFilter('alla')
  }
  const setFilter   = (f: string) => setGroupFilter(f)
  const showModal   = (content: ReactNode) => setModal(content)
  const closeModal  = () => setModal(null)

  const doBook = (id: number) => {
    const pass = passes.find(p => p.id === id)
    if (!pass || pass.cancelled || pass.pubStatus !== 'live' || pass.filled >= pass.spots || selfBookings[id]) return
    setPasses(prev => prev.map(p => p.id === id ? { ...p, filled: p.filled + 1, bookings: [...p.bookings, { personId: usr.id, name: usr.name, ini: usr.ini, av: usr.av, ac: usr.ac, source: 'app', noAccount: false, mail: usr.email }] } : p))
    setSelfBkgs(prev => ({ ...prev, [id]: true }))
    if (pass) addNotif('signup', `Du är uppsatt: ${pass.title}`, `${pass.date} kl ${pass.time} – ${pass.plats}`)
  }
  const doUnbook = (id: number) => {
    if (!selfBookings[id]) return
    setPasses(prev => prev.map(p => p.id === id ? { ...p, filled: Math.max(0, p.filled - 1), bookings: p.bookings.filter(b => b.personId !== usr.id) } : p))
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
    if (!selfWaitlist[id]) return
    setSelfWl(prev => { const n = { ...prev }; delete n[id]; return n })
    setPasses(prev => prev.map(p => p.id === id ? { ...p, waitlistCount: Math.max(0, (p.waitlistCount ?? 0) - 1) } : p))
  }
  const publishNow = (id: number) => {
    setPasses(prev => prev.map(p => p.id === id ? { ...p, pubStatus: 'live', pubDate: '', history: [...p.history, 'Publicerades – Demo'] } : p))
  }
  const toggleAvail = () => setUsers(prev => prev.map((user, i) => i === userIndex ? { ...user, available: !user.available } : user))
  const updateUserNotif = (key: string, val: boolean) => setUsers(prev => prev.map((user, i) => i === userIndex ? { ...user, notifs: { ...user.notifs, [key]: val } } : user))

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
  const updatePerson = (p: PersonData) => setPeople(prev => prev.map(x => x.id === p.id && x.church === p.church ? p : x))
  const deletePerson = (id: number) => {
    const churchId = currentChurchId()
    setPeople(prev => prev.filter(x => !(x.id === id && x.church === churchId)))
    setPasses(prev => prev.map(p => p.church === churchId ? { ...p, bookings: p.bookings.filter(b => b.personId !== id), filled: Math.max(0, p.filled - p.bookings.filter(b => b.personId === id).length), responsibleUserIds: p.responsibleUserIds.filter(personId => personId !== id) } : p))
  }
  const addMessage   = (m: MessageData) => setMessages(prev => [m, ...prev])
  const addChurch    = (c: Church)      => setChurches(prev => [...prev, c])
  const updateChurch = (idx: number, c: Church) => setChurches(prev => prev.map((x, i) => i === idx ? { ...x, ...c } : x))
  const deleteChurch = (idx: number)   => setChurches(prev => prev.filter((_, i) => i !== idx))

  const addPastorat = async (p: PastoratData) => {
    setPastorat(prev => [...prev, p])
    setChurches(prev => prev.map(c => p.churches.includes(c.id!) ? { ...c, pastoratId: p.id } : c))
  }
  const updatePastorat = async (p: PastoratData) => {
    setPastorat(prev => prev.map(x => x.id === p.id ? p : x))
    setChurches(prev => prev.map(c => p.churches.includes(c.id!) ? { ...c, pastoratId: p.id } : c.pastoratId === p.id ? { ...c, pastoratId: null } : c))
  }
  const deletePastorat = async (id: number) => {
    setPastorat(prev => prev.filter(x => x.id !== id))
    setChurches(prev => prev.map(c => c.pastoratId === id ? { ...c, pastoratId: null } : c))
  }
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

  const logout = () => { setPage('oversikt'); setModal(null) }
  const inviteUser = async (email: string, name: string, invitedRole: string, churchId: number) => {
    const adminLevel = invitedRole === 'fadmin' ? 'forsamling' : invitedRole === 'padmin' ? 'pastorat' : invitedRole === 'superadmin' ? 'super' : 'none'
    addPerson({ id: _nextId++, name, mail: email, role: invitedRole as Role, adminLevel, isEmployee: invitedRole !== 'ideell', church: churchId, ini: name.split(' ').map(w => w[0]).join('').slice(0, 2), av: '#FFEBE1', ac: '#7D0037', groups: [], available: true })
  }
  const updateStaffPerms = async (profileId: string, perms: StaffPerms) => {
    setPermissions(prev => ({ ...prev, [permissionKey(profileId, currentChurchId())]: perms }))
  }
  const saveAccess: DemoAccess['saveAccess'] = (person, newRole, perms, passIds) => {
    updatePerson({ ...person, role: newRole, adminLevel: newRole === 'fadmin' ? 'forsamling' : newRole === 'padmin' ? 'pastorat' : newRole === 'superadmin' ? 'super' : 'none', isEmployee: newRole !== 'ideell' })
    setPermissions(prev => ({ ...prev, [permissionKey(person.id, person.church)]: perms }))
    setPasses(prev => prev.map(p => p.church === person.church ? { ...p, responsibleUserIds: [...p.responsibleUserIds.filter(id => id !== person.id), ...(passIds.includes(p.id) ? [person.id] : [])] } : p))
  }

  return (
    <Ctx.Provider value={{
      isDemo: true,
      userIndex, page, passes, people, messages, notifications,
      selfBookings, selfWaitlist, activeChurch, groupFilter, modal,
      groups, churches, pastorat: pastorat.map(p => ({ ...p, churches: churches.filter(c => c.pastoratId === p.id).map(c => c.id!) })), users,
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
        <DemoAccessCtx.Provider value={{ permissionsFor, saveAccess }}>{children}</DemoAccessCtx.Provider>
      </DemoCommentsCtx.Provider>
    </Ctx.Provider>
  )
}

'use client'
import { useState, ReactNode } from 'react'
import { Ctx, ALL_PERMS, NO_PERMS, StaffPerms } from '@/lib/appStore'
import { Group, Church, PersonData, PassData, MessageData, NotifData, PastoratData, UserDef, NAV_ITEMS } from '@/lib/appData'
import { DEMO_GROUPS, DEMO_CHURCHES, DEMO_PASTORAT, DEMO_USERS, DEMO_PEOPLE, DEMO_PASSES, DEMO_MESSAGES, DEMO_NOTIFICATIONS } from '@/lib/demoData'

let _nextId = 200

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

  const u = () => DEMO_USERS[userIndex]

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
    setPasses(prev => prev.map(p => p.id === id && p.filled < p.spots ? { ...p, filled: p.filled + 1 } : p))
    setSelfBkgs(prev => ({ ...prev, [id]: true }))
  }
  const doUnbook = (id: number) => {
    setPasses(prev => prev.map(p => p.id === id ? { ...p, filled: Math.max(0, p.filled - 1) } : p))
    setSelfBkgs(prev => { const n = { ...prev }; delete n[id]; return n })
  }
  const joinWaitlist = (id: number) => {
    const pos = (passes.find(p => p.id === id)?.waitlistCount ?? 0) + 1
    setSelfWl(prev => ({ ...prev, [id]: pos }))
    setPasses(prev => prev.map(p => p.id === id ? { ...p, waitlistCount: (p.waitlistCount ?? 0) + 1 } : p))
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

  const logout      = () => {}
  const inviteUser  = async () => {}
  const updateStaffPerms = async () => {}

  return (
    <Ctx.Provider value={{
      userIndex, page, passes, people, messages, notifications,
      selfBookings, selfWaitlist, activeChurch, groupFilter, modal,
      groups, churches, pastorat: DEMO_PASTORAT, users: DEMO_USERS,
      currentUser: null, profile: null, loadingAuth: false, staffPerms,
      u, isIdeell, isAnstalld, isFAdmin, isPAdmin, isSuperAdmin, isAdmin, isKiosk,
      isResponsible, canBook, canViewBkgs, canAddBkg, canRemoveBkg, canMsgBooked,
      canEditPass, canCancelPass, canDeletePass, canCreatePass, canManage,
      canMakePAdmin, canMakeFAdmin, perm,
      cycleUser, goTo, setChurch, setFilter, showModal, closeModal,
      doBook, doUnbook, joinWaitlist, leaveWaitlist, publishNow, toggleAvail, updateUserNotif,
      addPass, updatePass, deletePass, cancelPass, reloadPasses, addBooking, removeBooking,
      addPerson, updatePerson, deletePerson, addMessage,
      addChurch, updateChurch, deleteChurch,
      addPastorat, updatePastorat, deletePastorat, addGroup, deleteGroup,
      nextPersonId, nextPassId, nextPastoratId, updateStaffPerms,
      getResponsibleNames, currentChurchId, logout, inviteUser,
    }}>
      {children}
    </Ctx.Provider>
  )
}

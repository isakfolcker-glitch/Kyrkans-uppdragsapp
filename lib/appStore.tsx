'use client'
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  GROUPS, CHURCHES, NAV_ITEMS, INITIAL_PEOPLE, INITIAL_PASSES, INITIAL_MESSAGES, INITIAL_NOTIFICATIONS,
  Group, Church, PersonData, PassData, MessageData, NotifData, PastoratData, UserDef, USERS,
  ini2, gLabel, gCls, roleLabel,
} from './appData'

// ─── Types ───────────────────────────────────────────
export interface StaffPerms {
  kan_skapa_pass: boolean
  kan_redigera_pass: boolean
  kan_se_bokningar: boolean
  kan_hantera_bokningar: boolean
  kan_se_personal: boolean
  kan_lagg_till_personal: boolean
  kan_hantera_grupper: boolean
  kan_skicka_utskick: boolean
}

const ALL_PERMS: StaffPerms = {
  kan_skapa_pass: true, kan_redigera_pass: true,
  kan_se_bokningar: true, kan_hantera_bokningar: true,
  kan_se_personal: true, kan_lagg_till_personal: true,
  kan_hantera_grupper: true, kan_skicka_utskick: true,
}

const NO_PERMS: StaffPerms = {
  kan_skapa_pass: false, kan_redigera_pass: false,
  kan_se_bokningar: false, kan_hantera_bokningar: false,
  kan_se_personal: false, kan_lagg_till_personal: false,
  kan_hantera_grupper: false, kan_skicka_utskick: false,
}

interface AppCtx {
  userIndex: number; page: string; passes: PassData[]; people: PersonData[]
  messages: MessageData[]; notifications: NotifData[]; selfBookings: Record<number, boolean>; selfWaitlist: Record<number, number>
  activeChurch: number; groupFilter: string; modal: ReactNode | null
  groups: Group[]; churches: Church[]; pastorat: PastoratData[]; users: UserDef[]
  currentUser: any; profile: any; loadingAuth: boolean; staffPerms: StaffPerms

  u: () => UserDef
  isIdeell: () => boolean; isAnstalld: () => boolean; isFAdmin: () => boolean
  isPAdmin: () => boolean; isSuperAdmin: () => boolean; isAdmin: () => boolean
  isKiosk: () => boolean; isResponsible: (pass: PassData) => boolean
  canBook: () => boolean; canViewBkgs: (pass: PassData) => boolean
  canAddBkg: (pass: PassData) => boolean; canRemoveBkg: (pass: PassData) => boolean
  canMsgBooked: (pass: PassData) => boolean; canEditPass: (pass: PassData) => boolean
  canCancelPass: (pass: PassData) => boolean; canDeletePass: () => boolean
  canCreatePass: () => boolean; canManage: () => boolean
  canMakePAdmin: () => boolean; canMakeFAdmin: (churchIdx: number) => boolean
  perm: (key: keyof StaffPerms) => boolean

  cycleUser: () => void; goTo: (p: string) => void; setChurch: (i: number) => void
  setFilter: (f: string) => void; showModal: (content: ReactNode) => void; closeModal: () => void
  doBook: (id: number) => void; doUnbook: (id: number) => void
  joinWaitlist: (id: number) => void; leaveWaitlist: (id: number) => void
  publishNow: (id: number) => void; toggleAvail: () => void
  updateUserNotif: (key: string, val: boolean) => void
  addPass: (p: PassData) => Promise<void>; updatePass: (p: PassData) => void
  deletePass: (id: number) => void; cancelPass: (id: number) => void
  addBooking: (passId: number, b: PassData['bookings'][0]) => void
  removeBooking: (passId: number, idx: number) => void
  addPerson: (p: PersonData) => void; updatePerson: (p: PersonData) => void
  deletePerson: (id: number) => void; addMessage: (m: MessageData) => void
  addChurch: (c: Church) => void; updateChurch: (idx: number, c: Church) => void
  deleteChurch: (idx: number) => void
  addPastorat: (p: PastoratData) => Promise<void>; updatePastorat: (p: PastoratData) => Promise<void>
  deletePastorat: (id: number) => Promise<void>; addGroup: (g: Group) => void; deleteGroup: (id: string) => void
  nextPersonId: () => number; nextPassId: () => number; nextPastoratId: () => number
  getResponsibleNames: (pass: PassData) => string; currentChurchId: () => number
  logout: () => void; inviteUser: (email: string, name: string, role: string, churchId: number) => Promise<void>
  updateStaffPerms: (profileId: string, perms: StaffPerms) => Promise<void>
}

let _nextPersonId = 100, _nextPassId = 200, _nextPasId = 2
const Ctx = createContext<AppCtx>(null!)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()

  // Auth state
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  // State — börjar tomt, fylls på från Supabase när inloggad
  const [userIndex, setUserIndex] = useState(0)
  const [page, setPage] = useState('pass')
  const [passes, setPasses] = useState<PassData[]>([])
  const [people, setPeople] = useState<PersonData[]>([])
  const [messages, setMessages] = useState<MessageData[]>([])
  const [notifications, setNotifications] = useState<NotifData[]>([])
  const [selfBookings, setSelfBookings] = useState<Record<number, boolean>>({})
  const [selfWaitlist, setSelfWaitlist] = useState<Record<number, number>>({})
  const [activeChurch, setActiveChurch] = useState(0)
  const [groupFilter, setGroupFilter] = useState('alla')
  const [modal, setModal] = useState<ReactNode | null>(null)
  const [groups, setGroups] = useState<Group[]>(GROUPS)
  const [churches, setChurches] = useState<Church[]>(CHURCHES)
  const [pastorat, setPastorat] = useState<PastoratData[]>([])
  const [staffPerms, setStaffPerms] = useState<StaffPerms>(NO_PERMS)
  const [users] = useState<UserDef[]>(USERS)

  // ─── Auth listener ────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user)
      if (user) fetchProfile(user.id)
      else setLoadingAuth(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setCurrentUser(session?.user ?? null)
      // Ladda bara om all data vid inloggning/utloggning — INTE vid token-refresh
      if (event === 'SIGNED_IN') {
        if (session?.user) fetchProfile(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        setProfile(null); setLoadingAuth(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*, profile_groups(group_id), notif_settings(*)')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoadingAuth(false)
    if (data) {
      fetchAppData(data)
      // Hämta behörigheter för anställda (admin/superadmin får ALL_PERMS direkt)
      if (['forsamling','pastorat','super'].includes(data.admin_level)) {
        setStaffPerms(ALL_PERMS)
      } else if (data.role === 'anstalld') {
        const { data: permsData } = await supabase
          .from('staff_permissions')
          .select('*')
          .eq('profile_id', userId)
          .single()
        setStaffPerms(permsData ? {
          kan_skapa_pass:         permsData.kan_skapa_pass,
          kan_redigera_pass:      permsData.kan_redigera_pass,
          kan_se_bokningar:       permsData.kan_se_bokningar,
          kan_hantera_bokningar:  permsData.kan_hantera_bokningar,
          kan_se_personal:        permsData.kan_se_personal,
          kan_lagg_till_personal: permsData.kan_lagg_till_personal,
          kan_hantera_grupper:    permsData.kan_hantera_grupper,
          kan_skicka_utskick:     permsData.kan_skicka_utskick,
        } : NO_PERMS)
      } else {
        setStaffPerms(NO_PERMS)
      }
      // Hämta kö-anmälningar och position
      const { data: myWaitlist } = await supabase.from('waitlist').select('pass_id, created_at').eq('profile_id', userId)
      if (myWaitlist?.length) {
        const passIds = myWaitlist.map((w: any) => w.pass_id)
        const { data: allWl } = await supabase.from('waitlist').select('pass_id, profile_id, created_at').in('pass_id', passIds).order('created_at')
        const positions: Record<number, number> = {}
        if (allWl) {
          passIds.forEach((pid: number) => {
            const entries = allWl.filter((e: any) => e.pass_id === pid)
            const idx = entries.findIndex((e: any) => e.profile_id === userId)
            if (idx !== -1) positions[pid] = idx + 1
          })
        }
        setSelfWaitlist(positions)
      }
      // Hämta notiser
      const { data: notifData } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (notifData) setNotifications(notifData.map((n: any) => ({
        id: n.id, userId: n.user_id, type: n.type,
        title: n.title, body: n.body, time: n.created_at, read: n.read,
      })))
      // Realtid – nya notiser
      supabase.channel('notif-' + userId)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'notifications',
          filter: `user_id=eq.${userId}`,
        }, (payload) => {
          const n = payload.new as any
          setNotifications(prev => [{
            id: n.id, userId: n.user_id, type: n.type,
            title: n.title, body: n.body, time: n.created_at, read: false,
          }, ...prev])
        })
        .subscribe()
    }
  }

  const fetchAppData = async (prof: any) => {
    // Hämta kyrkor
    const { data: churchData } = await supabase.from('churches').select('*').order('id')
    if (churchData?.length) setChurches(churchData.map((c: any) => ({ id: c.id, name: c.name, admin: c.admin_name || '', tel: c.tel || '', address: c.address })))

    // Hämta grupper
    const { data: groupData } = await supabase.from('groups').select('*')
    if (groupData?.length) setGroups(groupData.map((g: any) => ({ id: g.id, label: g.label, cls: g.cls, churchId: g.church_id ?? null })))

    // Hämta pastorat med admin-profil och kopplade kyrkor
    const { data: pastData } = await supabase
      .from('pastorat')
      .select('id, name, profiles(name, email), churches(id)')
      .order('id')
    if (pastData?.length) {
      setPastorat(pastData.map((p: any) => ({
        id: p.id,
        name: p.name,
        admin: p.profiles?.name ?? '',
        adminEmail: p.profiles?.email ?? '',
        churches: (p.churches ?? []).map((c: any) => c.id),
      })))
    }

    // Hämta pass — superadmin/padmin hämtar alla, fadmin/övriga bara sin kyrka
    const churchId = prof.church_id
    const isGlobalAdmin = ['pastorat', 'super'].includes(prof.admin_level)
    if (churchId || isGlobalAdmin) {
      let passQuery = supabase
        .from('passes')
        .select('*, pass_groups(group_id), pass_responsible(profile_id), bookings(id, name, ini, av_color, ac_color, mail, tel, source, no_account, profile_id), pass_history(entry), waitlist(id)')
        .order('created_at', { ascending: false })
      if (!isGlobalAdmin && churchId) passQuery = passQuery.eq('church_id', churchId)
      const { data: passData } = await passQuery
      if (passData) {
        setPasses(passData.map((p: any) => ({
          id: p.id, church: p.church_id, title: p.title,
          groups: p.pass_groups?.map((g: any) => g.group_id) || [],
          date: p.date_str, time: p.time_str, plats: p.plats,
          spots: p.spots, filled: p.filled, vk: p.vk || '', tel: p.tel || '',
          desc: p.description || '', cancelled: p.cancelled,
          pubStatus: p.pub_status, pubDate: p.pub_date || '',
          kioskVisible: p.kiosk_visible,
          responsibleUserIds: p.pass_responsible?.map((r: any) => r.profile_id) || [],
          bookings: p.bookings?.map((b: any) => ({
            personId: b.profile_id, name: b.name, ini: b.ini || '',
            av: b.av_color || '#F1EFE8', ac: b.ac_color || '#5F5E5A',
            source: b.source, noAccount: b.no_account, mail: b.mail, tel: b.tel,
          })) || [],
          history: p.pass_history?.map((h: any) => h.entry) || [],
          waitlistCount: p.waitlist?.length ?? 0,
        })))
      }
    }

    // Hämta personal (bara admin ser alla)
    if (['forsamling','pastorat','super'].includes(prof.admin_level)) {
      let query = supabase.from('profiles').select('*, profile_groups(group_id)')
      // Församlingsadmin ser bara sin kyrka; pastorat/super ser alla
      if (prof.admin_level === 'forsamling') query = query.eq('church_id', prof.church_id)
      const { data: peopleData } = await query
      if (peopleData) {
        setPeople(peopleData.map((p: any) => ({
          id: p.id, name: p.name, mail: p.email || '', phone: p.phone,
          ini: p.ini || p.name?.slice(0,2).toUpperCase() || '??',
          av: p.av_color || '#EEEDFE', ac: p.ac_color || '#3C3489',
          church: p.church_id, groups: p.profile_groups?.map((g: any) => g.group_id) || [],
          role: p.role, isEmployee: p.is_employee, adminLevel: p.admin_level, available: p.available,
        })))
      }
    }

    // Hämta utskick
    const { data: msgData } = await supabase.from('message_logs').select('*').order('sent_at', { ascending: false }).limit(20)
    if (msgData) setMessages(msgData.map((m: any) => ({ id: m.id, from: m.from_name, to: m.to_label, toCount: m.to_count, subject: m.subject, body: m.body, sentAt: m.sent_at })))
  }

  // ─── Behörighetssystem ────────────────────────────
  // Använd riktig profil om inloggad, annars demo-användare
  const effectiveAdminLevel = profile?.admin_level ?? users[userIndex]?.adminLevel ?? 'none'
  const effectiveRole = profile?.role ?? users[userIndex]?.role ?? 'ideell'
  const effectiveChurchId = profile?.church_id ?? users[userIndex]?.churches?.[0] ?? churches[0]?.id ?? 0

  const u = useCallback(() => users[userIndex], [users, userIndex])
  const isIdeell     = () => effectiveRole === 'ideell'
  const isAnstalld   = () => effectiveRole === 'anstalld'
  const isFAdmin     = () => effectiveAdminLevel === 'forsamling'
  const isPAdmin     = () => effectiveAdminLevel === 'pastorat'
  const isSuperAdmin = () => effectiveAdminLevel === 'super'
  const isAdmin      = () => ['forsamling','pastorat','super'].includes(effectiveAdminLevel)
  const isKiosk      = () => effectiveRole === 'kiosk'
  // Kollar granulerad behörighet – admin har alltid allt, anställda bara det som är tillåtet
  const perm = (key: keyof StaffPerms) => isAdmin() ? true : staffPerms[key]
  const isResponsible = (pass: PassData) => {
    if (currentUser) return pass.responsibleUserIds?.includes(currentUser.id) ?? false
    return users[userIndex]?.responsibleForPasses?.includes(pass.id) ?? false
  }
  const canBook       = () => !isAdmin() && !isKiosk()
  const canViewBkgs   = (p: PassData) => isAdmin() || isResponsible(p)
  const canAddBkg     = (p: PassData) => isAdmin() || isResponsible(p)
  const canRemoveBkg  = (p: PassData) => isAdmin() || isResponsible(p)
  const canMsgBooked  = (p: PassData) => isAdmin() || isResponsible(p)
  const canEditPass   = (p: PassData) => isAdmin() || isResponsible(p)
  const canCancelPass = (p: PassData) => isAdmin() || isResponsible(p)
  const canDeletePass = () => isAdmin() || perm('kan_redigera_pass')
  const canCreatePass = () => isAdmin() || perm('kan_skapa_pass')
  const canManage     = () => isAdmin() || isAnstalld()
  const canMakePAdmin = () => isPAdmin() || isSuperAdmin()
  const canMakeFAdmin = (c: number) => isPAdmin() || isSuperAdmin() || (isFAdmin() && (users[userIndex]?.churches ?? []).includes(c))

  const currentChurchId = () => (isPAdmin() || isSuperAdmin()) ? (churches[activeChurch]?.id ?? churches[0]?.id ?? activeChurch) : effectiveChurchId

  // ─── Actions ──────────────────────────────────────
  const cycleUser = () => {
    const next = (userIndex + 1) % users.length
    setUserIndex(next)
    setPage(NAV_ITEMS[users[next].role]?.[0]?.id ?? 'pass')
    setActiveChurch(0); setGroupFilter('alla'); setModal(null)
  }
  const goTo     = (p: string) => { setPage(p); setModal(null) }
  const setChurch = (i: number) => setActiveChurch(i)
  const setFilter = (f: string) => setGroupFilter(f)
  const showModal = (content: ReactNode) => setModal(content)
  const closeModal = () => setModal(null)

  const doBook = (id: number) => {
    setPasses(prev => prev.map(p => p.id === id && p.filled < p.spots ? { ...p, filled: p.filled + 1 } : p))
    setSelfBookings(prev => ({ ...prev, [id]: true }))
    // API-anrop om inloggad
    if (currentUser) {
      fetch('/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass_id: id, name: profile?.name, mail: currentUser.email, source: 'app' }) })
    }
  }
  const doUnbook = (id: number) => {
    setPasses(prev => prev.map(p => p.id === id ? { ...p, filled: Math.max(0, p.filled - 1) } : p))
    setSelfBookings(prev => { const n = { ...prev }; delete n[id]; return n })
  }
  const joinWaitlist = (id: number) => {
    // Optimistisk position = antal i kön + 1
    const pass = passes.find(p => p.id === id)
    const optimisticPos = (pass?.waitlistCount ?? 0) + 1
    setSelfWaitlist(prev => ({ ...prev, [id]: optimisticPos }))
    setPasses(prev => prev.map(p => p.id === id ? { ...p, waitlistCount: (p.waitlistCount ?? 0) + 1 } : p))
    fetch('/api/waitlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass_id: id }) })
      .then(r => { if (!r.ok) { setSelfWaitlist(prev => { const n = { ...prev }; delete n[id]; return n }); setPasses(prev => prev.map(p => p.id === id ? { ...p, waitlistCount: Math.max(0, (p.waitlistCount ?? 1) - 1) } : p)) } })
  }
  const leaveWaitlist = (id: number) => {
    setSelfWaitlist(prev => { const n = { ...prev }; delete n[id]; return n })
    fetch('/api/waitlist', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass_id: id }) })
  }
  const publishNow = (id: number) => {
    setPasses(prev => prev.map(p => p.id === id ? { ...p, pubStatus: 'live', pubDate: '', history: [...p.history, 'Publicerades manuellt – Idag'] } : p))
    fetch(`/api/passes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pub_status: 'live', pub_date: '' }) })
  }
  const toggleAvail = () => {
    const newVal = !profile?.available
    setProfile((p: any) => ({ ...p, available: newVal }))
    fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ available: newVal }) })
  }
  const updateUserNotif = (key: string, val: boolean) => {
    setProfile((p: any) => ({ ...p, notif_settings: [{ ...p.notif_settings?.[0], [key]: val }] }))
    fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notif_settings: { [key]: val } }) })
  }

  const addPass = async (p: PassData) => {
    const res = await fetch('/api/passes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: p.title, church_id: p.church, date_str: p.date, time_str: p.time,
        plats: p.plats, spots: p.spots, vk: p.vk, tel: p.tel, description: p.desc,
        pub_status: p.pubStatus, pub_date: p.pubDate, kiosk_visible: p.kioskVisible,
        groups: p.groups, responsible_ids: p.responsibleUserIds,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert('Kunde inte spara passet: ' + (err.error ?? res.status))
      return
    }
    const saved = await res.json()
    setPasses(prev => [{ ...p, id: saved.id }, ...prev])
  }
  const updatePass = (p: PassData) => {
    setPasses(prev => prev.map(x => x.id === p.id ? p : x))
    fetch(`/api/passes/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: p.title, date_str: p.date, time_str: p.time, plats: p.plats, spots: p.spots, vk: p.vk, tel: p.tel, description: p.desc, pub_status: p.pubStatus, pub_date: p.pubDate, kiosk_visible: p.kioskVisible, groups: p.groups }) })
  }
  const deletePass = (id: number) => {
    setPasses(prev => prev.filter(x => x.id !== id))
    setSelfBookings(prev => { const n = { ...prev }; delete n[id]; return n })
    fetch(`/api/passes/${id}`, { method: 'DELETE' })
  }
  const cancelPass = (id: number) => {
    setPasses(prev => prev.map(p => p.id === id ? { ...p, cancelled: true, history: [...p.history, 'Ställdes in – Idag'] } : p))
    fetch(`/api/passes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cancelled: true }) })
  }
  const addBooking = (passId: number, b: PassData['bookings'][0]) => {
    setPasses(prev => prev.map(p => p.id === passId ? { ...p, bookings: [...p.bookings, b], filled: p.filled + 1 } : p))
  }
  const removeBooking = (passId: number, idx: number) => {
    setPasses(prev => prev.map(p => p.id === passId ? { ...p, bookings: p.bookings.filter((_, i) => i !== idx), filled: Math.max(0, p.filled - 1) } : p))
  }
  const addPerson    = (p: PersonData) => setPeople(prev => [...prev, p])
  const updatePerson = (p: PersonData) => {
    setPeople(prev => prev.map(x => x.id === p.id ? p : x))
    fetch(`/api/people/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: p.groups }),
    }).catch(() => {})
  }
  const deletePerson = (id: any) => {
    setPeople(prev => prev.filter(x => x.id !== id))
    fetch(`/api/people/${id}`, { method: 'DELETE' }).catch(() => {})
  }
  const addMessage   = (m: MessageData) => setMessages(prev => [m, ...prev])
  const addChurch    = (c: Church)     => setChurches(prev => [...prev, c])
  const updateChurch = (idx: number, c: Church) => setChurches(prev => prev.map((x, i) => i === idx ? c : x))
  const deleteChurch = (idx: number)   => { const cid = churches[idx]?.id; setChurches(prev => prev.filter((_, i) => i !== idx)); setPasses(prev => prev.filter(p => p.church !== cid)); setPeople(prev => prev.filter(p => p.church !== cid)) }
  const addPastorat = async (p: PastoratData) => {
    const { data, error } = await supabase.from('pastorat').insert({ name: p.name }).select().single()
    if (error) { alert('Kunde inte spara pastoratet: ' + error.message); return }
    setPastorat(prev => [...prev, { ...p, id: data.id }])
  }
  const updatePastorat = async (p: PastoratData) => {
    const { error } = await supabase.from('pastorat').update({ name: p.name }).eq('id', p.id)
    if (error) { alert('Kunde inte uppdatera pastoratet: ' + error.message); return }
    setPastorat(prev => prev.map(x => x.id === p.id ? p : x))
  }
  const deletePastorat = async (id: number) => {
    const { error } = await supabase.from('pastorat').delete().eq('id', id)
    if (error) { alert('Kunde inte ta bort pastoratet: ' + error.message); return }
    setPastorat(prev => prev.filter(x => x.id !== id))
  }
  const addGroup     = (g: Group)      => setGroups(prev => [...prev, g])
  const deleteGroup  = (id: string)    => setGroups(prev => prev.filter(g => g.id !== id))

  const updateStaffPerms = async (profileId: string, perms: StaffPerms) => {
    const { error } = await supabase.from('staff_permissions').upsert({
      profile_id: profileId, ...perms,
    }, { onConflict: 'profile_id' })
    if (error) { alert('Kunde inte spara behörigheter: ' + error.message); return }
  }

  const nextPersonId   = () => _nextPersonId++
  const nextPassId     = () => _nextPassId++
  const nextPastoratId = () => _nextPasId++

  const getResponsibleNames = (pass: PassData) =>
    (pass.responsibleUserIds || []).map(id => people.find(p => p.id === id)?.name).filter(Boolean).join(', ')

  const logout = async () => { await supabase.auth.signOut(); window.location.href = '/login' }

  const inviteUser = async (email: string, name: string, role: string, churchId: number) => {
    const res = await fetch('/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name, role, church_id: churchId }) })
    if (!res.ok) { const d = await res.json(); throw new Error(d.error) }
  }

  return (
    <Ctx.Provider value={{
      userIndex, page, passes, people, messages, notifications, selfBookings, selfWaitlist,
      activeChurch, groupFilter, modal, groups, churches, pastorat, users,
      currentUser, profile, loadingAuth, staffPerms,
      u, isIdeell, isAnstalld, isFAdmin, isPAdmin, isSuperAdmin, isAdmin, isKiosk,
      isResponsible, canBook, canViewBkgs, canAddBkg, canRemoveBkg, canMsgBooked,
      canEditPass, canCancelPass, canDeletePass, canCreatePass, canManage,
      canMakePAdmin, canMakeFAdmin, perm,
      cycleUser, goTo, setChurch, setFilter, showModal, closeModal,
      doBook, doUnbook, joinWaitlist, leaveWaitlist, publishNow, toggleAvail, updateUserNotif,
      addPass, updatePass, deletePass, cancelPass, addBooking, removeBooking,
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

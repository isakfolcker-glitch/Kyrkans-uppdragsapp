'use client'
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  GROUPS, CHURCHES, NAV_ITEMS, INITIAL_PEOPLE, INITIAL_PASSES, INITIAL_MESSAGES, INITIAL_NOTIFICATIONS,
  Group, Church, PersonData, PassData, MessageData, NotifData, PastoratData, UserDef, ChurchMembershipData, USERS,
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

export const ALL_PERMS: StaffPerms = {
  kan_skapa_pass: true, kan_redigera_pass: true,
  kan_se_bokningar: true, kan_hantera_bokningar: true,
  kan_se_personal: true, kan_lagg_till_personal: true,
  kan_hantera_grupper: true, kan_skicka_utskick: true,
}

export const NO_PERMS: StaffPerms = {
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
  memberships: ChurchMembershipData[]; availableChurches: Church[]
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
  markAllNotifsRead: () => void
  addPass: (p: PassData) => Promise<void>; updatePass: (p: PassData) => void
  deletePass: (id: number) => void; cancelPass: (id: number) => void
  reloadPasses: () => Promise<void>
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
  currentMembership: () => ChurchMembershipData | null; currentGroups: () => string[]
  logout: () => void; inviteUser: (email: string, name: string, role: string, churchId: number) => Promise<void>
  updateStaffPerms: (profileId: string, perms: StaffPerms) => Promise<void>
}

let _nextPersonId = 100, _nextPassId = 200, _nextPasId = 2
export const Ctx = createContext<AppCtx>(null!)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }: { children: ReactNode }) {
  const supabase = createClient()

  // Auth state
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)

  // State — börjar tomt, fylls på från Supabase när inloggad
  const [userIndex, setUserIndex] = useState(0)
  const [page, setPage] = useState(() => (typeof window !== 'undefined' ? localStorage.getItem('lastPage') || 'pass' : 'pass'))
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
  const [memberships, setMemberships] = useState<ChurchMembershipData[]>([])
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

    const { data: membershipRows, error: membershipError } = await supabase
      .from('profile_churches')
      .select('profile_id, church_id, role, admin_level, is_employee, active, accepted_at')
      .eq('profile_id', userId)
      .eq('active', true)

    let mappedMemberships: ChurchMembershipData[] = (membershipRows ?? []).map((m: any) => ({
      profileId: m.profile_id,
      churchId: m.church_id,
      role: m.role,
      adminLevel: m.admin_level,
      isEmployee: m.is_employee,
      active: m.active,
      acceptedAt: m.accepted_at,
    }))

    // Bakåtkompatibilitet tills migration 016 är körd i alla miljöer.
    if ((!mappedMemberships.length || membershipError) && data?.church_id) {
      mappedMemberships = [{
        profileId: userId,
        churchId: data.church_id,
        role: data.role,
        adminLevel: data.admin_level,
        isEmployee: data.is_employee,
        active: true,
        acceptedAt: data.onboarding_done ? data.updated_at : null,
      }]
    }

    setProfile(data)
    setMemberships(mappedMemberships)
    setLoadingAuth(false)

    if (data) {
      await fetchAppData(data, mappedMemberships)

      const { data: permsData } = await supabase
        .from('staff_permissions')
        .select('*')
        .eq('profile_id', userId)
        .maybeSingle()
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

  const fetchAppData = async (prof: any, membershipRows: ChurchMembershipData[]) => {
    const { data: churchData } = await supabase.from('churches').select('*').order('id')
    const mappedChurches: Church[] = (churchData ?? []).map((church: any) => ({
      id: church.id,
      name: church.name,
      admin: church.admin_name || '',
      tel: church.tel || '',
      address: church.address,
      pastoratId: church.pastorat_id ?? null,
    }))
    setChurches(mappedChurches)

    const directChurchIds = new Set(membershipRows.filter(m => m.active).map(m => m.churchId))
    const isSystemSuper = prof.admin_level === 'super' || membershipRows.some(m => m.active && m.adminLevel === 'super')
    const pastoratAdminIds = new Set(
      membershipRows
        .filter(m => m.active && m.adminLevel === 'pastorat')
        .map(m => mappedChurches.find(church => church.id === m.churchId)?.pastoratId)
        .filter((id): id is number => typeof id === 'number')
    )
    const selectable = isSystemSuper
      ? mappedChurches
      : mappedChurches.filter(church =>
          (church.id !== undefined && directChurchIds.has(church.id))
          || (church.pastoratId !== undefined && church.pastoratId !== null && pastoratAdminIds.has(church.pastoratId))
        )

    if (selectable.length) {
      const queryChurch = typeof window !== 'undefined'
        ? Number(new URLSearchParams(window.location.search).get('church'))
        : NaN
      const storedChurch = typeof window !== 'undefined'
        ? Number(localStorage.getItem('activeChurchId'))
        : NaN
      const preferredId = [queryChurch, storedChurch].find(id => selectable.some(church => church.id === id))
        ?? selectable[0].id
      const preferredIndex = mappedChurches.findIndex(church => church.id === preferredId)
      if (preferredIndex >= 0) {
        setActiveChurch(preferredIndex)
        if (typeof window !== 'undefined' && preferredId !== undefined) {
          localStorage.setItem('activeChurchId', String(preferredId))
        }
      }
    }

    const { data: groupData } = await supabase.from('groups').select('*')
    const mappedGroups: Group[] = (groupData ?? []).map((group: any) => ({
      id: group.id,
      label: group.label,
      cls: group.cls,
      churchId: group.church_id ?? null,
    }))
    setGroups(mappedGroups)

    const { data: pastData } = await supabase
      .from('pastorat')
      .select('id, name, churches(id)')
      .order('id')
    if (pastData?.length) {
      setPastorat(pastData.map((p: any) => ({
        id: p.id,
        name: p.name,
        admin: '',
        adminEmail: '',
        churches: (p.churches ?? []).map((church: any) => church.id),
      })))
    }

    // RLS returnerar bara pass från församlingar användaren har tillgång till.
    const { data: passData } = await supabase
      .from('passes')
      .select('*, pass_groups(group_id), pass_responsible(profile_id), bookings(id, name, ini, av_color, ac_color, mail, tel, source, no_account, profile_id), pass_history(entry), waitlist(id)')
      .order('created_at', { ascending: false })

    if (passData) {
      const mappedPasses: PassData[] = passData.map((p: any) => ({
        id: p.id, church: p.church_id, title: p.title,
        groups: p.pass_groups?.map((g: any) => g.group_id) || [],
        date: p.date_str, time: p.time_str, plats: p.plats,
        spots: p.spots, filled: p.filled, vk: p.vk || '', tel: p.tel || '',
        vkProfileId: p.vk_profile_id ?? null,
        desc: p.description || '', cancelled: p.cancelled,
        pubStatus: p.pub_status, pubDate: p.pub_date || '',
        kioskVisible: p.kiosk_visible,
        responsibleUserIds: p.pass_responsible?.map((r: any) => r.profile_id) || [],
        bookings: p.bookings?.map((b: any) => ({
          id: b.id, personId: b.profile_id, name: b.name, ini: b.ini || '',
          av: b.av_color || '#F1EFE8', ac: b.ac_color || '#5F5E5A',
          source: b.source, noAccount: b.no_account, mail: b.mail, tel: b.tel,
        })) || [],
        history: p.pass_history?.map((h: any) => h.entry) || [],
        waitlistCount: p.waitlist?.length ?? 0,
      }))
      setPasses(mappedPasses)

      if (currentUser?.id) {
        const mine: Record<number, boolean> = {}
        mappedPasses.forEach(pass => {
          if (pass.bookings.some(booking => booking.personId === currentUser.id)) mine[pass.id] = true
        })
        setSelfBookings(mine)
      }
    }

    // En profil kan förekomma en gång per aktivt församlingsmedlemskap.
    const { data: peopleMemberships } = await supabase
      .from('profile_churches')
      .select('church_id, role, admin_level, is_employee, active, profiles!inner(id, name, email, phone, ini, av_color, ac_color, available, profile_groups(group_id))')
      .eq('active', true)

    if (peopleMemberships) {
      const peopleRows: PersonData[] = peopleMemberships.map((membership: any) => {
        const rawProfile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles
        const profileGroups = rawProfile?.profile_groups?.map((g: any) => g.group_id) || []
        const visibleGroupIds = profileGroups.filter((groupId: string) => {
          const group = mappedGroups.find(item => item.id === groupId)
          return !group || group.churchId === null || group.churchId === membership.church_id
        })
        return {
          id: rawProfile?.id,
          name: rawProfile?.name || '',
          mail: rawProfile?.email || '',
          phone: rawProfile?.phone,
          ini: rawProfile?.ini || rawProfile?.name?.slice(0, 2).toUpperCase() || '??',
          av: rawProfile?.av_color || '#EEEDFE',
          ac: rawProfile?.ac_color || '#3C3489',
          church: membership.church_id,
          groups: visibleGroupIds,
          role: membership.role,
          isEmployee: membership.is_employee,
          adminLevel: membership.admin_level,
          available: rawProfile?.available ?? true,
        }
      }).filter((person: PersonData) => Boolean(person.id))
      setPeople(peopleRows)
    }

    const { data: msgData } = await supabase
      .from('message_logs')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(100)
    if (msgData) {
      setMessages(msgData.map((m: any) => ({
        id: m.id,
        from: m.from_name,
        to: m.to_label,
        toCount: m.to_count,
        subject: m.subject,
        body: m.body,
        sentAt: m.sent_at,
        church: m.church_id ?? null,
      })))
    }
  }

  // ─── Behörighetssystem ────────────────────────────
  const systemSuper = profile?.admin_level === 'super'
    || memberships.some(membership => membership.active && membership.adminLevel === 'super')

  const directChurchIds = new Set(
    memberships.filter(membership => membership.active).map(membership => membership.churchId)
  )
  const pastoratAdminIds = new Set(
    memberships
      .filter(membership => membership.active && membership.adminLevel === 'pastorat')
      .map(membership => churches.find(church => church.id === membership.churchId)?.pastoratId)
      .filter((id): id is number => typeof id === 'number')
  )

  const availableChurches = currentUser
    ? (systemSuper
        ? churches
        : churches.filter(church =>
            (church.id !== undefined && directChurchIds.has(church.id))
            || (church.pastoratId !== undefined && church.pastoratId !== null && pastoratAdminIds.has(church.pastoratId))
          ))
    : churches

  const currentChurchId = () => {
    if (!currentUser) {
      return users[userIndex]?.churches?.[0] ?? churches[activeChurch]?.id ?? churches[0]?.id ?? 0
    }
    const selected = churches[activeChurch]
    if (selected?.id !== undefined && availableChurches.some(church => church.id === selected.id)) {
      return selected.id
    }
    return availableChurches[0]?.id ?? profile?.church_id ?? 0
  }

  const currentMembership = (): ChurchMembershipData | null => {
    const churchId = currentChurchId()
    if (!churchId) return null

    const direct = memberships.find(membership => membership.active && membership.churchId === churchId)
    if (direct) return direct

    if (systemSuper && currentUser) {
      return {
        profileId: currentUser.id,
        churchId,
        role: 'superadmin',
        adminLevel: 'super',
        isEmployee: true,
        active: true,
      }
    }

    const targetPastoratId = churches.find(church => church.id === churchId)?.pastoratId
    if (targetPastoratId !== undefined && targetPastoratId !== null && currentUser) {
      const inherited = memberships.find(membership => {
        if (!membership.active || membership.adminLevel !== 'pastorat') return false
        return churches.find(church => church.id === membership.churchId)?.pastoratId === targetPastoratId
      })
      if (inherited) {
        return {
          profileId: currentUser.id,
          churchId,
          role: 'padmin',
          adminLevel: 'pastorat',
          isEmployee: true,
          active: true,
        }
      }
    }

    return null
  }

  const effectiveMembership = currentMembership()
  const effectiveAdminLevel = currentUser
    ? (effectiveMembership?.adminLevel ?? 'none')
    : (users[userIndex]?.adminLevel ?? 'none')
  const effectiveRole = currentUser
    ? (effectiveMembership?.role ?? 'ideell')
    : (users[userIndex]?.role ?? 'ideell')

  const currentGroups = () => {
    if (!currentUser) return users[userIndex]?.groups ?? []
    const churchId = currentChurchId()
    const profileGroupIds = profile?.profile_groups?.map((group: any) => group.group_id) ?? []
    return profileGroupIds.filter((groupId: string) => {
      const group = groups.find(item => item.id === groupId)
      return !group || group.churchId === null || group.churchId === churchId
    })
  }

  const u = (): UserDef => {
    if (!currentUser) return users[userIndex]
    const role = effectiveRole
    const adminLevel = effectiveAdminLevel
    const displayName = profile?.name ?? ''
    return {
      id: 0,
      name: displayName,
      email: currentUser.email ?? '',
      role,
      isEmployee: effectiveMembership?.isEmployee ?? role !== 'ideell',
      adminLevel,
      ini: displayName.split(' ').map((part: string) => part[0]).join('').slice(0, 2).toUpperCase(),
      av: profile?.av_color ?? '#EEEDFE',
      ac: profile?.ac_color ?? '#3C3489',
      badge: role === 'ideell' ? 'rb-ideell' : role === 'anstalld' ? 'rb-anstalld' : 'rb-admin',
      badgeLbl: role === 'ideell'
        ? 'Ideell'
        : role === 'anstalld'
          ? 'Anställd'
          : role === 'fadmin'
            ? 'Församlingsadmin'
            : role === 'padmin'
              ? 'Pastoratsadmin'
              : 'Systemadmin',
      groups: currentGroups(),
      churches: availableChurches.flatMap(church => church.id !== undefined ? [church.id] : []),
      responsibleForPasses: passes.filter(pass => pass.responsibleUserIds?.includes(currentUser.id)).map(pass => pass.id),
      notifs: profile?.notif_settings?.[0] ?? {},
      available: profile?.available ?? true,
    }
  }

  const isIdeell     = () => effectiveRole === 'ideell'
  const isAnstalld   = () => effectiveRole === 'anstalld'
  const isFAdmin     = () => effectiveAdminLevel === 'forsamling'
  const isPAdmin     = () => effectiveAdminLevel === 'pastorat'
  const isSuperAdmin = () => effectiveAdminLevel === 'super'
  const isAdmin      = () => ['forsamling','pastorat','super'].includes(effectiveAdminLevel)
  const isKiosk      = () => effectiveRole === 'kiosk'
  const perm = (key: keyof StaffPerms) => isAdmin() ? true : (isAnstalld() ? staffPerms[key] : false)

  const isResponsible = (pass: PassData) => {
    if (currentUser) return pass.responsibleUserIds?.includes(currentUser.id) ?? false
    return users[userIndex]?.responsibleForPasses?.includes(pass.id) ?? false
  }
  const canBook       = () => !isAdmin() && !isKiosk()
  const canViewBkgs   = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_se_bokningar')
  const canAddBkg     = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_hantera_bokningar')
  const canRemoveBkg  = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_hantera_bokningar')
  const canMsgBooked  = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_skicka_utskick')
  const canEditPass   = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_redigera_pass')
  const canCancelPass = (p: PassData) => isAdmin() || isResponsible(p) || perm('kan_redigera_pass')
  const canDeletePass = () => isAdmin() || perm('kan_redigera_pass')
  const canCreatePass = () => isAdmin() || perm('kan_skapa_pass')
  const canManage     = () => isAdmin() || isAnstalld()
  const canMakePAdmin = () => isPAdmin() || isSuperAdmin()
  const canMakeFAdmin = (churchId: number) =>
    isPAdmin() || isSuperAdmin() || (isFAdmin() && currentChurchId() === churchId)

  // ─── Actions ──────────────────────────────────────
  const cycleUser = () => {
    const next = (userIndex + 1) % users.length
    setUserIndex(next)
    setPage(NAV_ITEMS[users[next].role]?.[0]?.id ?? 'pass')
    setActiveChurch(0); setGroupFilter('alla'); setModal(null)
  }
  const goTo     = (p: string) => { setPage(p); setModal(null); if (typeof window !== 'undefined') localStorage.setItem('lastPage', p) }
  const setChurch = (i: number) => {
    const churchId = churches[i]?.id
    if (churchId !== undefined && !availableChurches.some(church => church.id === churchId)) return
    setActiveChurch(i)
    setGroupFilter('alla')
    setModal(null)
    if (typeof window !== 'undefined' && churchId !== undefined) localStorage.setItem('activeChurchId', String(churchId))
  }
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
    // Hitta bokningens ID för att kunna ta bort den i databasen
    const pass = passes.find(p => p.id === id)
    const booking = pass?.bookings.find(b => b.personId === currentUser?.id || (profile && b.personId === profile.id))
    setPasses(prev => prev.map(p => p.id === id ? { ...p, filled: Math.max(0, p.filled - 1) } : p))
    setSelfBookings(prev => { const n = { ...prev }; delete n[id]; return n })
    if (booking?.id) {
      fetch('/api/bookings', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: booking.id }) })
        .then(r => r.json().then(d => ({ ok: r.ok, d })))
        .then(({ ok, d }) => {
          if (!ok) {
            alert('Kunde inte avboka: ' + (d.error ?? 'Okänt fel'))
            setPasses(prev => prev.map(p => p.id === id ? { ...p, filled: p.filled + 1 } : p))
            setSelfBookings(prev => ({ ...prev, [id]: true }))
          }
        })
        .catch(() => {
          alert('Nätverksfel vid avbokning')
          setPasses(prev => prev.map(p => p.id === id ? { ...p, filled: p.filled + 1 } : p))
          setSelfBookings(prev => ({ ...prev, [id]: true }))
        })
    }
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
  const markAllNotifsRead = () => {
    if (!currentUser) return
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
  }

  const addPass = async (p: PassData) => {
    const res = await fetch('/api/passes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: p.title, church_id: p.church, date_str: p.date, time_str: p.time,
        plats: p.plats, spots: p.spots, vk: p.vk, tel: p.tel, vk_profile_id: p.vkProfileId || null, description: p.desc,
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
    fetch(`/api/passes/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: p.title, date_str: p.date, time_str: p.time, plats: p.plats, spots: p.spots, vk: p.vk, tel: p.tel, vk_profile_id: p.vkProfileId || null, description: p.desc, pub_status: p.pubStatus, pub_date: p.pubDate, kiosk_visible: p.kioskVisible, groups: p.groups }) })
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
  const reloadPasses = async () => {
    const { data: passData } = await supabase
      .from('passes')
      .select('*, pass_groups(group_id), pass_responsible(profile_id), bookings(id, name, ini, av_color, ac_color, mail, tel, source, no_account, profile_id), pass_history(entry), waitlist(id)')
      .order('created_at', { ascending: false })
    if (passData) {
      setPasses(passData.map((p: any) => ({
        id: p.id, church: p.church_id, title: p.title,
        groups: p.pass_groups?.map((g: any) => g.group_id) || [],
        date: p.date_str, time: p.time_str, plats: p.plats,
        spots: p.spots, filled: p.bookings?.length ?? 0,
        vk: p.vk ?? '', tel: p.tel ?? '', vkProfileId: p.vk_profile_id ?? null, desc: p.description ?? '',
        pubStatus: p.pub_status, pubDate: p.pub_date ?? '',
        kioskVisible: p.kiosk_visible ?? false, cancelled: p.cancelled ?? false,
        bookings: (p.bookings ?? []).map((b: any) => ({ id: b.id, personId: b.profile_id, name: b.name, ini: b.ini, av: b.av_color, ac: b.ac_color, mail: b.mail, tel: b.tel, source: b.source, noAccount: b.no_account })),
        history: p.pass_history?.map((h: any) => h.entry) ?? [],
        waitlistCount: p.waitlist?.length ?? 0,
        responsibleUserIds: p.pass_responsible?.map((r: any) => r.profile_id) ?? [],
      })))
    }
  }
  const addBooking = (passId: number, b: PassData['bookings'][0]) => {
    setPasses(prev => prev.map(p => p.id === passId ? { ...p, bookings: [...p.bookings, b], filled: p.filled + 1 } : p))
  }
  const removeBooking = (passId: number, idx: number) => {
    const pass = passes.find(p => p.id === passId)
    const bookingId = pass?.bookings[idx]?.id
    if (!bookingId) {
      alert('Kunde inte hitta bokningen.')
      return
    }

    setPasses(prev => prev.map(p => p.id === passId ? {
      ...p,
      bookings: p.bookings.filter((_, i) => i !== idx),
      filled: Math.max(0, p.filled - 1),
    } : p))

    fetch('/api/bookings', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: bookingId }),
    })
      .then(async r => ({ ok: r.ok, data: await r.json() }))
      .then(({ ok, data }) => {
        if (!ok) {
          alert('Kunde inte ta bort bokningen: ' + (data.error ?? 'Okänt fel'))
          void reloadPasses()
        }
      })
      .catch(() => {
        alert('Nätverksfel när bokningen skulle tas bort.')
        void reloadPasses()
      })
  }
  const addPerson    = (p: PersonData) => setPeople(prev => [...prev, p])
  const updatePerson = (p: PersonData) => {
    setPeople(prev => prev.map(x => x.id === p.id && x.church === p.church ? p : x))
    fetch(`/api/people/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: p.groups, church_id: p.church }),
    }).catch(() => {})
  }
  const deletePerson = (id: any) => {
    const churchId = currentChurchId()
    fetch(`/api/people/${id}?church_id=${churchId}`, { method: 'DELETE' })
      .then(async res => ({ ok: res.ok, data: await res.json() }))
      .then(({ ok, data }) => {
        if (!ok) {
          alert(`Kunde inte ta bort: ${data.error ?? 'Okänt fel'}`)
          return
        }
        setPeople(prev => prev.filter(x => !(x.id === id && x.church === churchId)))
      })
      .catch(() => alert('Nätverksfel vid borttagning'))
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
      memberships, availableChurches,
      currentUser, profile, loadingAuth, staffPerms,
      u, isIdeell, isAnstalld, isFAdmin, isPAdmin, isSuperAdmin, isAdmin, isKiosk,
      isResponsible, canBook, canViewBkgs, canAddBkg, canRemoveBkg, canMsgBooked,
      canEditPass, canCancelPass, canDeletePass, canCreatePass, canManage,
      canMakePAdmin, canMakeFAdmin, perm,
      cycleUser, goTo, setChurch, setFilter, showModal, closeModal,
      doBook, doUnbook, joinWaitlist, leaveWaitlist, publishNow, toggleAvail, updateUserNotif, markAllNotifsRead,
      addPass, updatePass, deletePass, cancelPass, reloadPasses, addBooking, removeBooking,
      addPerson, updatePerson, deletePerson, addMessage,
      addChurch, updateChurch, deleteChurch,
      addPastorat, updatePastorat, deletePastorat, addGroup, deleteGroup,
      nextPersonId, nextPassId, nextPastoratId, updateStaffPerms,
      getResponsibleNames, currentChurchId, currentMembership, currentGroups, logout, inviteUser,
    }}>
      {children}
    </Ctx.Provider>
  )
}

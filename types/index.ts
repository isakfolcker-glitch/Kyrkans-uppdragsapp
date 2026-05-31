export type Role = 'ideell' | 'anstalld' | 'fadmin' | 'padmin' | 'superadmin' | 'kiosk'
export type AdminLevel = 'none' | 'forsamling' | 'pastorat' | 'super'

export interface Church {
  id: number
  name: string
  admin: string
  tel: string
  address?: string
  pastoratId: number
}

export interface Pastorat {
  id: number
  name: string
  admin: string
  adminEmail: string
  churchIds: number[]
}

export interface Group {
  id: string
  label: string
  churchId?: number
}

export interface Person {
  id: number
  name: string
  mail: string
  phone?: string
  role: Role
  isEmployee: boolean
  adminLevel: AdminLevel
  churchId: number
  groups: string[]
  available: boolean
}

export interface Booking {
  personId: number | null
  name: string
  ini: string
  source: 'app' | 'manual' | 'kiosk'
  noAccount: boolean
  mail?: string
  tel?: string
  comment?: string
}

export interface Pass {
  id: number
  churchId: number
  title: string
  groups: string[]
  date: string
  time: string
  plats: string
  spots: number
  filled: number
  vk: string
  tel: string
  desc: string
  cancelled: boolean
  pubStatus: 'live' | 'scheduled'
  pubDate: string
  kioskVisible: boolean
  responsibleUserIds: number[]
  bookings: Booking[]
  history: string[]
  importRef?: string
}

export interface Notification {
  id: number
  userId: number
  type: 'reminder' | 'cancelled' | 'new_pass' | 'message'
  title: string
  body: string
  time: string
  read: boolean
}

export interface MessageLog {
  id: number
  from: string
  to: string
  toCount: number
  subject: string
  body: string
  sentAt: string
}

export type Role = 'ideell' | 'anstalld' | 'fadmin' | 'padmin' | 'superadmin' | 'kiosk'
export type AdminLevel = 'none' | 'forsamling' | 'pastorat' | 'super'

export interface Group { id: string; label: string; cls: string; churchId?: number | null }
export interface Church { id?: number; name: string; admin: string; tel: string; address?: string }
export interface PersonData {
  id: any; name: string; mail: string; phone?: string
  ini: string; av: string; ac: string
  role: Role; isEmployee: boolean; adminLevel: AdminLevel
  church: any; groups: string[]; available: boolean
}
export interface BookingData {
  id?: number; personId: any; name: string; ini: string; av: string; ac: string
  source: 'app' | 'manual' | 'kiosk'; noAccount: boolean; mail?: string; tel?: string
}
export interface PassData {
  id: any; church: any; title: string; groups: string[]
  date: string; time: string; plats: string; spots: number; filled: number
  vk: string; tel: string; desc: string; cancelled: boolean
  pubStatus: 'live' | 'scheduled'; pubDate: string; kioskVisible: boolean
  responsibleUserIds: any[]; bookings: BookingData[]; history: string[]
  importRef?: string; waitlistCount?: number
}
export interface MessageData { id: any; from: string; to: string; toCount: number; subject: string; body: string; sentAt: string }
export interface NotifData { id: any; userId: any; type: string; title: string; body: string; time: string; read: boolean }
export interface PastoratData { id: any; name: string; admin: string; adminEmail: string; churches: number[] }

export interface UserDef {
  id: number; name: string; email: string
  role: Role; isEmployee: boolean; adminLevel: AdminLevel
  ini: string; av: string; ac: string; badge: string; badgeLbl: string
  groups: string[]; churches: number[]; responsibleForPasses: number[]
  notifs: Record<string, boolean>; available: boolean
}

// Tom grupp-lista – fylls på från Supabase
export const GROUPS: Group[] = []

// Tom kyrklista – fylls på från Supabase
export const CHURCHES: Church[] = []

// Inga demoanvändare – en enda tom platshållare
export const USERS: UserDef[] = [
  {id:0,name:'',email:'',role:'ideell',isEmployee:false,adminLevel:'none',ini:'',av:'#EEEDFE',ac:'#3C3489',badge:'rb-ideell',badgeLbl:'Ideell',groups:[],churches:[],responsibleForPasses:[],notifs:{},available:true},
]

// Tom initial-data – allt kommer från Supabase
export const INITIAL_PEOPLE: PersonData[] = []
export const INITIAL_PASSES: PassData[] = []
export const INITIAL_MESSAGES: MessageData[] = []
export const INITIAL_NOTIFICATIONS: NotifData[] = []
export const INITIAL_PASTORAT: PastoratData[] = []

export const NAV_ITEMS: Record<string, {id:string;icon:string;lbl:string}[]> = {
  ideell:     [{id:'pass',icon:'Calendar',lbl:'Pass'},{id:'mina-bokningar',icon:'Bookmark',lbl:'Mina bokningar'},{id:'notiser',icon:'Bell',lbl:'Notiser'},{id:'profil',icon:'User',lbl:'Min profil'}],
  anstalld:   [{id:'pass',icon:'Calendar',lbl:'Pass'},{id:'mina-ansvar',icon:'ShieldCheck',lbl:'Mina ansvar'},{id:'mina-bokningar',icon:'Bookmark',lbl:'Mina bokningar'},{id:'notiser',icon:'Bell',lbl:'Notiser'},{id:'profil',icon:'User',lbl:'Min profil'}],
  fadmin:     [{id:'pass',icon:'Calendar',lbl:'Pass'},{id:'personal',icon:'Users',lbl:'Personal'},{id:'ansokningar',icon:'FileCheck',lbl:'Ansökningar'},{id:'grupper',icon:'UsersGroup',lbl:'Grupper'},{id:'utskick',icon:'Send',lbl:'Utskick'},{id:'behorigheter',icon:'Shield',lbl:'Behörigheter'},{id:'exportera',icon:'Download',lbl:'Exportera'},{id:'mina-bokningar',icon:'Bookmark',lbl:'Mina bokningar'},{id:'notiser',icon:'Bell',lbl:'Notiser'},{id:'profil',icon:'User',lbl:'Min profil'}],
  padmin:     [{id:'oversikt',icon:'LayoutDashboard',lbl:'Översikt'},{id:'pass',icon:'Calendar',lbl:'Pass'},{id:'personal',icon:'Users',lbl:'Personal'},{id:'ansokningar',icon:'FileCheck',lbl:'Ansökningar'},{id:'grupper',icon:'UsersGroup',lbl:'Grupper'},{id:'utskick',icon:'Send',lbl:'Utskick'},{id:'behorigheter',icon:'Shield',lbl:'Behörigheter'},{id:'forsamlingar',icon:'BuildingChurch',lbl:'Församlingar'},{id:'exportera',icon:'Download',lbl:'Exportera'},{id:'mina-bokningar',icon:'Bookmark',lbl:'Mina bokningar'},{id:'notiser',icon:'Bell',lbl:'Notiser'},{id:'profil',icon:'User',lbl:'Min profil'}],
  superadmin: [{id:'pastorat',icon:'World',lbl:'Pastorat'},{id:'oversikt',icon:'LayoutDashboard',lbl:'Översikt'},{id:'pass',icon:'Calendar',lbl:'Pass'},{id:'personal',icon:'Users',lbl:'Personal'},{id:'ansokningar',icon:'FileCheck',lbl:'Ansökningar'},{id:'grupper',icon:'UsersGroup',lbl:'Grupper'},{id:'utskick',icon:'Send',lbl:'Utskick'},{id:'behorigheter',icon:'Shield',lbl:'Behörigheter'},{id:'forsamlingar',icon:'BuildingChurch',lbl:'Församlingar'},{id:'exportera',icon:'Download',lbl:'Exportera'},{id:'profil',icon:'User',lbl:'Min profil'}],
  kiosk:      [{id:'kiosk',icon:'DeviceIpad',lbl:'Kiosk'}],
}

export function gLabel(id: string, groups: Group[] = GROUPS) { return groups.find(x=>x.id===id)?.label ?? id }
export function gCls(id: string, groups: Group[] = GROUPS) { return groups.find(x=>x.id===id)?.cls ?? 'tag-extra' }
export function ini2(name: string) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }
export function roleLabel(p: PersonData): [string, string, string] {
  if(p.adminLevel==='pastorat')  return ['Pastoratsadmin','#3C3489','#CECBF6']
  if(p.adminLevel==='forsamling')return ['Församlingsadmin','#085041','#9FE1CB']
  if(p.isEmployee)               return ['Anställd','#633806','#FAEEDA']
  return                                ['Ideell','#5F5E5A','#D3D1C7']
}

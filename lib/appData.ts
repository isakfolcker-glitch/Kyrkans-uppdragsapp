export type Role = 'ideell' | 'anstalld' | 'fadmin' | 'padmin' | 'superadmin' | 'kiosk'
export type AdminLevel = 'none' | 'forsamling' | 'pastorat' | 'super'

export interface Group { id: string; label: string; cls: string }
export interface Church { name: string; admin: string; tel: string; address?: string }
export interface PersonData {
  id: number; name: string; mail: string; phone?: string
  ini: string; av: string; ac: string
  role: Role; isEmployee: boolean; adminLevel: AdminLevel
  church: number; groups: string[]; available: boolean
}
export interface BookingData {
  personId: number | null; name: string; ini: string; av: string; ac: string
  source: 'app' | 'manual' | 'kiosk'; noAccount: boolean; mail?: string; tel?: string
}
export interface PassData {
  id: number; church: number; title: string; groups: string[]
  date: string; time: string; plats: string; spots: number; filled: number
  vk: string; tel: string; desc: string; cancelled: boolean
  pubStatus: 'live' | 'scheduled'; pubDate: string; kioskVisible: boolean
  responsibleUserIds: number[]; bookings: BookingData[]; history: string[]
  importRef?: string
}
export interface MessageData { id: number; from: string; to: string; toCount: number; subject: string; body: string; sentAt: string }
export interface NotifData { id: number; userId: number; type: string; title: string; body: string; time: string; read: boolean }

export interface UserDef {
  id: number; name: string; email: string
  role: Role; isEmployee: boolean; adminLevel: AdminLevel
  ini: string; av: string; ac: string; badge: string; badgeLbl: string
  groups: string[]; churches: number[]; responsibleForPasses: number[]
  notifs: Record<string, boolean>; available: boolean
}

export const GROUPS: Group[] = [
  {id:'kv',     label:'Katedralvärd', cls:'tag-kv'},
  {id:'bv',     label:'Dörrvakt',     cls:'tag-bv'},
  {id:'brand',  label:'Brandvakt',    cls:'tag-brand'},
  {id:'konsert',label:'Konsertvärd',  cls:'tag-konsert'},
  {id:'extra',  label:'Extra hjälp',  cls:'tag-extra'},
  {id:'vakt',   label:'Nattväkt',     cls:'tag-vakt'},
  {id:'kor',    label:'Körvärd',      cls:'tag-kor'},
]

export const CHURCHES: Church[] = [
  {name:'Växjö domkyrka', admin:'Anna K', tel:'073-100 00 01'},
  {name:'Öjaby kyrka',    admin:'Bo M',   tel:'073-100 00 02'},
  {name:'Sandsbro kyrka', admin:'Lena P', tel:'073-100 00 03'},
  {name:'Rottne kyrka',   admin:'Karin J',tel:'073-100 00 04'},
]

export const USERS: UserDef[] = [
  {id:1,name:'Isak S',email:'isak@example.com',role:'ideell',isEmployee:false,adminLevel:'none',ini:'IS',av:'#EEEDFE',ac:'#3C3489',badge:'rb-ideell',badgeLbl:'Ideell',groups:['kv','konsert'],churches:[0],responsibleForPasses:[],notifs:{passdag:true,pamin:true,instllt:true,nyttpass:true,meddelande:true},available:true},
  {id:10,name:'Erik A',email:'erik@kyrka.se',role:'anstalld',isEmployee:true,adminLevel:'none',ini:'EA',av:'#FAEEDA',ac:'#633806',badge:'rb-anstalld',badgeLbl:'Anställd',groups:[],churches:[0],responsibleForPasses:[1,3],notifs:{passdag:false,pamin:false,instllt:true,nyttpass:false,meddelande:true},available:true},
  {id:11,name:'Anna K',email:'anna@kyrka.se',role:'fadmin',isEmployee:true,adminLevel:'forsamling',ini:'AK',av:'#E1F5EE',ac:'#085041',badge:'rb-fadmin',badgeLbl:'Församlingsadmin',groups:[],churches:[0],responsibleForPasses:[],notifs:{},available:true},
  {id:12,name:'Per L',email:'per@pastorat.se',role:'padmin',isEmployee:true,adminLevel:'pastorat',ini:'PL',av:'#3C3489',ac:'#CECBF6',badge:'rb-padmin',badgeLbl:'Pastoratsadmin',groups:[],churches:[0,1,2,3],responsibleForPasses:[],notifs:{},available:true},
  {id:0,name:'Super Admin',email:'super@kyrka.se',role:'superadmin',isEmployee:true,adminLevel:'super',ini:'SA',av:'#2C2C2A',ac:'#F1EFE8',badge:'rb-super',badgeLbl:'Superadmin',groups:[],churches:[],responsibleForPasses:[],notifs:{},available:true},
  {id:99,name:'Kiosk',email:'',role:'kiosk',isEmployee:false,adminLevel:'none',ini:'K',av:'#F1EFE8',ac:'#2C2C2A',badge:'rb-kiosk',badgeLbl:'Kiosk',groups:[],churches:[0],responsibleForPasses:[],notifs:{},available:true},
]

export const INITIAL_PEOPLE: PersonData[] = [
  {id:1,name:'Isak Svensson',mail:'isak@example.com',ini:'IS',av:'#EEEDFE',ac:'#3C3489',church:0,groups:['kv','konsert'],role:'ideell',isEmployee:false,adminLevel:'none',available:true},
  {id:2,name:'Maria Lindgren',mail:'maria@example.com',ini:'ML',av:'#FAEEDA',ac:'#633806',church:0,groups:['brand','bv'],role:'ideell',isEmployee:false,adminLevel:'none',available:false},
  {id:3,name:'Anders Björk',mail:'anders@example.com',ini:'AB',av:'#FCEBEB',ac:'#791F1F',church:0,groups:['brand','kv'],role:'ideell',isEmployee:false,adminLevel:'none',available:true},
  {id:4,name:'Fatima Hassan',mail:'fatima@example.com',ini:'FH',av:'#E1F5EE',ac:'#085041',church:0,groups:['bv','kv'],role:'ideell',isEmployee:false,adminLevel:'none',available:true},
  {id:5,name:'Karin Ek',mail:'karin@example.com',ini:'KE',av:'#EEEDFE',ac:'#3C3489',church:0,groups:['extra','kor'],role:'ideell',isEmployee:false,adminLevel:'none',available:true},
  {id:6,name:'Erik Nilsson',mail:'erikn@example.com',ini:'EN',av:'#F1EFE8',ac:'#444441',church:1,groups:['kv'],role:'ideell',isEmployee:false,adminLevel:'none',available:true},
  {id:10,name:'Erik Anställd',mail:'erik@kyrka.se',ini:'EA',av:'#FAEEDA',ac:'#633806',church:0,groups:[],role:'anstalld',isEmployee:true,adminLevel:'none',available:true},
  {id:11,name:'Anna K',mail:'anna@kyrka.se',ini:'AK',av:'#E1F5EE',ac:'#085041',church:0,groups:[],role:'fadmin',isEmployee:true,adminLevel:'forsamling',available:true},
  {id:12,name:'Bo M',mail:'bo@kyrka.se',ini:'BM',av:'#E1F5EE',ac:'#085041',church:1,groups:[],role:'fadmin',isEmployee:true,adminLevel:'forsamling',available:true},
  {id:13,name:'Per L',mail:'per@pastorat.se',ini:'PL',av:'#3C3489',ac:'#CECBF6',church:0,groups:[],role:'padmin',isEmployee:true,adminLevel:'pastorat',available:true},
]

export const INITIAL_PASSES: PassData[] = [
  {id:1,church:0,title:'Söndagsgudstjänst',groups:['kv','extra'],date:'Sön 1 jun',time:'09:30–12:00',plats:'Kyrkorummet',spots:4,filled:2,vk:'Anna K',tel:'073-100 00 01',desc:'Välkomna besökare, dela ut program och hjälp till vid kollekten.',cancelled:false,pubStatus:'live',pubDate:'',kioskVisible:true,responsibleUserIds:[10],bookings:[{personId:1,name:'Isak Svensson',ini:'IS',av:'#EEEDFE',ac:'#3C3489',source:'app',noAccount:false,mail:'isak@example.com'},{personId:null,name:'Bertil J',ini:'BJ',av:'#F1EFE8',ac:'#444441',source:'manual',noAccount:true,tel:'073-555 00 11'}],history:['Skapades av Anna K – Mån 13 maj']},
  {id:2,church:0,title:'Orgelkonsert midsommar',groups:['konsert','kor'],date:'Fre 20 jun',time:'19:00–21:00',plats:'Stora skeppet',spots:4,filled:0,vk:'Anna K',tel:'073-100 00 01',desc:'Midsommarkonsert med domkyrkans organist. Stor publik förväntas.',cancelled:false,pubStatus:'live',pubDate:'',kioskVisible:true,responsibleUserIds:[],bookings:[],history:['Skapades – Tor 16 maj']},
  {id:3,church:0,title:'Brandvakt – renovering',groups:['brand'],date:'Mån 2 jun',time:'08:00–16:00',plats:'Tornet',spots:1,filled:0,vk:'Bo S',tel:'073-200 00 02',desc:'Tillsyn under renoveringsarbeten i tornet.',cancelled:false,pubStatus:'live',pubDate:'',kioskVisible:false,responsibleUserIds:[10],bookings:[],history:['Skapades – Fre 17 maj']},
  {id:4,church:0,title:'Allhelgonagudstjänst',groups:['kv','bv'],date:'Lör 1 nov',time:'14:00–17:00',plats:'Kyrkorummet',spots:6,filled:0,vk:'Anna K',tel:'073-100 00 01',desc:'Stor gudstjänst med extra personal vid ingångarna.',cancelled:false,pubStatus:'scheduled',pubDate:'Mån 15 sep',kioskVisible:true,responsibleUserIds:[],bookings:[],history:['Skapades – Mån 20 maj']},
  {id:5,church:0,title:'Studentgudstjänst',groups:['bv','extra'],date:'Tor 12 jun',time:'10:00–14:00',plats:'Kyrkorummet',spots:5,filled:3,vk:'Anna K',tel:'073-100 00 01',desc:'Mottagning av studenter och deras familjer.',cancelled:true,pubStatus:'live',pubDate:'',kioskVisible:false,responsibleUserIds:[],bookings:[],history:['Skapades – Tis 14 maj','Ställdes in – Fre 24 maj']},
  {id:6,church:1,title:'Söndagsmässa Öjaby',groups:['kv'],date:'Sön 1 jun',time:'10:00–12:00',plats:'Öjaby kyrka',spots:2,filled:1,vk:'Bo M',tel:'073-100 00 02',desc:'Välkomna besökare och dela ut program.',cancelled:false,pubStatus:'live',pubDate:'',kioskVisible:true,responsibleUserIds:[],bookings:[],history:['Skapades – Ons 15 maj']},
]

export const INITIAL_MESSAGES: MessageData[] = [
  {id:1,from:'Anna K',to:'Alla ideella',toCount:18,subject:'Klädkod vid konserter',body:'Påminnelse om klädkod – mörka kläder.',sentAt:'Mån 26 maj 10:00'},
  {id:2,from:'Anna K',to:'Grupp: Brandvakt',toCount:5,subject:'Sommarschema',body:'Nytt schema för sommarens renoveringsarbeten.',sentAt:'Fre 23 maj 14:30'},
]

export const INITIAL_NOTIFICATIONS: NotifData[] = [
  {id:1,userId:1,type:'reminder',title:'Påminnelse: Söndagsgudstjänst imorgon',body:'Sön 1 jun kl 09:30 i Kyrkorummet.',time:'Idag 07:00',read:false},
  {id:2,userId:1,type:'cancelled',title:'Inställt: Studentgudstjänst',body:'Tor 12 jun är inställt. Du avbokades automatiskt.',time:'Igår 14:22',read:false},
  {id:3,userId:1,type:'new_pass',title:'Nytt pass: Orgelkonsert midsommar',body:'Nytt pass för Konsertvärd. Fre 20 jun.',time:'Mån 26 maj',read:true},
]

export interface PastoratData { id: number; name: string; admin: string; adminEmail: string; churches: number[] }
export const INITIAL_PASTORAT: PastoratData[] = [
  {id:1,name:'Växjö pastorat',admin:'Per L',adminEmail:'per@pastorat.se',churches:[0,1,2,3]},
]

export const NAV_ITEMS: Record<string, {id:string;icon:string;lbl:string}[]> = {
  ideell:     [{id:'pass',icon:'Calendar',lbl:'Pass'},{id:'mina-bokningar',icon:'Bookmark',lbl:'Mina bokningar'},{id:'notiser',icon:'Bell',lbl:'Notiser'},{id:'profil',icon:'User',lbl:'Min profil'}],
  anstalld:   [{id:'pass',icon:'Calendar',lbl:'Pass'},{id:'mina-ansvar',icon:'ShieldCheck',lbl:'Mina ansvar'},{id:'mina-bokningar',icon:'Bookmark',lbl:'Mina bokningar'},{id:'notiser',icon:'Bell',lbl:'Notiser'},{id:'profil',icon:'User',lbl:'Min profil'}],
  fadmin:     [{id:'pass',icon:'Calendar',lbl:'Pass'},{id:'personal',icon:'Users',lbl:'Personal'},{id:'grupper',icon:'UsersGroup',lbl:'Grupper'},{id:'utskick',icon:'Send',lbl:'Utskick'},{id:'behorigheter',icon:'Shield',lbl:'Behörigheter'},{id:'exportera',icon:'Download',lbl:'Exportera'},{id:'mina-bokningar',icon:'Bookmark',lbl:'Mina bokningar'},{id:'notiser',icon:'Bell',lbl:'Notiser'},{id:'profil',icon:'User',lbl:'Min profil'}],
  padmin:     [{id:'oversikt',icon:'LayoutDashboard',lbl:'Översikt'},{id:'pass',icon:'Calendar',lbl:'Pass'},{id:'personal',icon:'Users',lbl:'Personal'},{id:'grupper',icon:'UsersGroup',lbl:'Grupper'},{id:'utskick',icon:'Send',lbl:'Utskick'},{id:'behorigheter',icon:'Shield',lbl:'Behörigheter'},{id:'kyrkor',icon:'BuildingChurch',lbl:'Kyrkor'},{id:'exportera',icon:'Download',lbl:'Exportera'},{id:'mina-bokningar',icon:'Bookmark',lbl:'Mina bokningar'},{id:'notiser',icon:'Bell',lbl:'Notiser'},{id:'profil',icon:'User',lbl:'Min profil'}],
  superadmin: [{id:'pastorat',icon:'World',lbl:'Pastorat'},{id:'oversikt',icon:'LayoutDashboard',lbl:'Översikt'},{id:'pass',icon:'Calendar',lbl:'Pass'},{id:'personal',icon:'Users',lbl:'Personal'},{id:'grupper',icon:'UsersGroup',lbl:'Grupper'},{id:'behorigheter',icon:'Shield',lbl:'Behörigheter'},{id:'kyrkor',icon:'BuildingChurch',lbl:'Kyrkor'},{id:'exportera',icon:'Download',lbl:'Exportera'},{id:'profil',icon:'User',lbl:'Min profil'}],
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

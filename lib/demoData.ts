import { Group, Church, PersonData, PassData, MessageData, NotifData, PastoratData, UserDef } from './appData'
import type { PassMessage } from '@/types'

export const DEMO_GROUPS: Group[] = [
  { id: 'kyrkv',   label: 'Kyrkvärd',     cls: 'tag-kyrkv',   churchId: 1 },
  { id: 'doerr',   label: 'Dörrvakt',     cls: 'tag-doerr',   churchId: 1 },
  { id: 'brand',   label: 'Brandvakt',    cls: 'tag-brand',   churchId: 1 },
  { id: 'konsert', label: 'Konsertguide', cls: 'tag-konsert',  churchId: 1 },
  { id: 'extra',   label: 'Extra hjälp',  cls: 'tag-extra',   churchId: 1 },
  { id: 'natt',    label: 'Nattvakt',     cls: 'tag-natt',    churchId: 1 },
]

export const DEMO_CHURCHES: Church[] = [
  { id: 1, name: 'Domkyrkan', admin: 'Sarah Björk', tel: '08-123 45 67', address: 'Domkyrkoplan 1, Stockholm', pastoratId: 1 },
  { id: 2, name: 'Hovförsamlingen', admin: 'Anna Ström', tel: '08-789 01 23', address: 'Slottsbacken 1, Stockholm', pastoratId: 1 },
]

export const DEMO_PASTORAT: PastoratData[] = [
  { id: 1, name: 'Stockholms Domkyrkoförsamling', admin: 'Sarah Björk', adminEmail: 'sarah@kyrkan.se', churches: [1, 2] },
]

export const DEMO_USERS: UserDef[] = [
  {
    id: 1, name: 'Maria Lindström', email: 'maria@kyrkan.se',
    role: 'ideell', isEmployee: false, adminLevel: 'none',
    ini: 'ML', av: '#FFC3AA', ac: '#7D0037', badge: 'rb-ideell', badgeLbl: 'Ideell',
    groups: ['kyrkv', 'extra'], churches: [1], responsibleForPasses: [],
    notifs: { reminder: true, cancelled: true, nyttpass: true, kommentar_mail: true }, available: true,
  },
  {
    id: 2, name: 'Johan Eriksson', email: 'johan@kyrkan.se',
    role: 'anstalld', isEmployee: true, adminLevel: 'none',
    ini: 'JE', av: '#FFDCCB', ac: '#7D0037', badge: 'rb-anstalld', badgeLbl: 'Anställd',
    groups: ['kyrkv'], churches: [1], responsibleForPasses: [1, 3, 5, 7, 8],
    notifs: {}, available: true,
  },
  {
    id: 3, name: 'Sarah Björk', email: 'sarah@kyrkan.se',
    role: 'padmin', isEmployee: true, adminLevel: 'pastorat',
    ini: 'SB', av: '#FFDCCB', ac: '#7D0037', badge: 'rb-fadmin', badgeLbl: 'Pastoratsadmin',
    groups: [], churches: [1, 2], responsibleForPasses: [],
    notifs: {}, available: true,
  },
]

export const DEMO_PEOPLE: PersonData[] = [
  { id: 1,  name: 'Maria Lindström', mail: 'maria@kyrkan.se',    phone: '073-111 22 33', ini: 'ML', av: '#FFC3AA', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 1, groups: ['kyrkv','extra'],         available: true  },
  { id: 2,  name: 'Johan Eriksson',  mail: 'johan@kyrkan.se',    phone: '070-222 33 44', ini: 'JE', av: '#FFDCCB', ac: '#7D0037', role: 'anstalld',  isEmployee: true,  adminLevel: 'none',      church: 1, groups: ['kyrkv'],              available: true  },
  { id: 3,  name: 'Sarah Björk',     mail: 'sarah@kyrkan.se',    phone: '070-333 44 55', ini: 'SB', av: '#FFDCCB', ac: '#7D0037', role: 'padmin',    isEmployee: true,  adminLevel: 'pastorat',  church: 1, groups: [],                    available: true  },
  { id: 4,  name: 'Lars Pettersson', mail: 'lars@kyrkan.se',     phone: '076-444 55 66', ini: 'LP', av: '#FFEBE1', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 1, groups: ['kyrkv','doerr'],      available: true  },
  { id: 5,  name: 'Eva Nilsson',     mail: 'eva@kyrkan.se',      phone: '073-555 66 77', ini: 'EN', av: '#FFDCCB', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 1, groups: ['brand','extra'],      available: true  },
  { id: 6,  name: 'Anders Carlsson', mail: 'anders@kyrkan.se',                           ini: 'AC', av: '#FFDCCB', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 1, groups: ['konsert','kyrkv'],    available: false },
  { id: 7,  name: 'Ingrid Johansson',mail: 'ingrid@kyrkan.se',                           ini: 'IJ', av: '#FFEBE1', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 1, groups: ['kyrkv'],              available: true  },
  { id: 8,  name: 'Björn Svensson',  mail: 'bjorn@kyrkan.se',                            ini: 'BS', av: '#FFDCCB', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 1, groups: ['doerr','natt'],       available: true  },
  { id: 9,  name: 'Karin Lund',      mail: 'karin@kyrkan.se',                            ini: 'KL', av: '#FFEBE1', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 1, groups: ['extra','konsert'],    available: true  },
  { id: 10, name: 'Peter Holm',      mail: 'peter@kyrkan.se',                            ini: 'PH', av: '#FFDCCB', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 1, groups: ['kyrkv','brand'],      available: true  },
  { id: 11, name: 'Lena Magnusson',  mail: 'lena@kyrkan.se',                             ini: 'LM', av: '#FFEBE1', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 1, groups: ['natt','extra'],       available: true  },
  { id: 12, name: 'Ove Gustafsson',  mail: 'ove@kyrkan.se',                              ini: 'OG', av: '#FFDCCB', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 2, groups: ['kyrkv'],              available: true  },
  { id: 13, name: 'Gun Olsson',      mail: 'gun@kyrkan.se',                              ini: 'GO', av: '#FFEBE1', ac: '#7D0037', role: 'ideell',    isEmployee: false, adminLevel: 'none',      church: 2, groups: ['doerr'],              available: true  },
  { id: 14, name: 'Rolf Jansson',    mail: 'rolf@kyrkan.se',                             ini: 'RJ', av: '#FFDCCB', ac: '#7D0037', role: 'anstalld',  isEmployee: true,  adminLevel: 'none',      church: 1, groups: [],                    available: true  },
  { id: 15, name: 'Anna Ström',      mail: 'anna@kyrkan.se',                             ini: 'AS', av: '#FFDCCB', ac: '#7D0037', role: 'fadmin',    isEmployee: true,  adminLevel: 'forsamling',church: 2, groups: [],                    available: true  },
]

const d = (days: number) => {
  const dt = new Date()
  dt.setDate(dt.getDate() + days)
  return dt.toISOString().slice(0, 10)
}

export const DEMO_PASSES: PassData[] = [
  {
    id: 1, church: 1, title: 'Söndagsgudstjänst', groups: ['kyrkv', 'doerr'],
    date: d(2), time: '10:00', plats: 'Domkyrkan', spots: 4, filled: 2,
    vk: 'Johan Eriksson', tel: '070-222 33 44', desc: 'Ordinarie söndagsgudstjänst med nattvard.',
    cancelled: false, pubStatus: 'live', pubDate: '', kioskVisible: true,
    responsibleUserIds: [2],
    bookings: [
      { id: 101, personId: 1, name: 'Maria Lindström', ini: 'ML', av: '#FFC3AA', ac: '#7D0037', source: 'app',    noAccount: false, mail: 'maria@kyrkan.se' },
      { id: 102, personId: 4, name: 'Lars Pettersson',  ini: 'LP', av: '#FFEBE1', ac: '#7D0037', source: 'app',    noAccount: false },
    ],
    history: ['Skapades – ' + d(-5), 'Tid ändrad till 10:00 – ' + d(-3)],
    waitlistCount: 0,
  },
  {
    id: 2, church: 1, title: 'Orgelkonsert – Bach', groups: ['konsert', 'extra'],
    date: d(5), time: '19:00', plats: 'Domkyrkan', spots: 6, filled: 3,
    vk: 'Johan Eriksson', tel: '070-222 33 44', desc: 'Kvällskonsert med Bachs verk. Ingång via norra portalen.',
    cancelled: false, pubStatus: 'live', pubDate: '', kioskVisible: false,
    responsibleUserIds: [2],
    bookings: [
      { id: 103, personId: 6,    name: 'Anders Carlsson', ini: 'AC', av: '#FFDCCB', ac: '#7D0037', source: 'app',    noAccount: false },
      { id: 104, personId: 9,    name: 'Karin Lund',      ini: 'KL', av: '#FFEBE1', ac: '#7D0037', source: 'app',    noAccount: false },
      { id: 105, personId: null, name: 'Sven Andersson',  ini: 'SA', av: '#FFC3AA', ac: '#7D0037', source: 'manual', noAccount: true },
    ],
    history: ['Skapades – ' + d(-10)],
    waitlistCount: 2,
  },
  {
    id: 3, church: 1, title: 'Vigsel – Larsson/Svensson', groups: ['kyrkv'],
    date: d(3), time: '14:00', plats: 'Domkyrkan', spots: 2, filled: 2,
    vk: 'Johan Eriksson', tel: '070-222 33 44', desc: 'Vigsel för Anna Larsson och Erik Svensson. Noggrant klädsel.',
    cancelled: false, pubStatus: 'live', pubDate: '', kioskVisible: false,
    responsibleUserIds: [2],
    bookings: [
      { id: 106, personId: 7,  name: 'Ingrid Johansson', ini: 'IJ', av: '#FFEBE1', ac: '#7D0037', source: 'app', noAccount: false },
      { id: 107, personId: 10, name: 'Peter Holm',        ini: 'PH', av: '#FFDCCB', ac: '#7D0037', source: 'app', noAccount: false },
    ],
    history: ['Skapades – ' + d(-7)],
    waitlistCount: 1,
  },
  {
    id: 4, church: 1, title: 'Midsommarfest', groups: ['extra', 'kyrkv', 'doerr'],
    date: d(8), time: '15:00', plats: 'Domkyrkans park', spots: 10, filled: 5,
    vk: 'Sarah Björk', tel: '070-333 44 55', desc: 'Midsommarfirande med sång, dans och gemensam middag.',
    cancelled: false, pubStatus: 'live', pubDate: '', kioskVisible: true,
    responsibleUserIds: [3],
    bookings: [
      { id: 108, personId: 1,  name: 'Maria Lindström', ini: 'ML', av: '#FFC3AA', ac: '#7D0037', source: 'app',   noAccount: false },
      { id: 109, personId: 4,  name: 'Lars Pettersson',  ini: 'LP', av: '#FFEBE1', ac: '#7D0037', source: 'app',   noAccount: false },
      { id: 110, personId: 5,  name: 'Eva Nilsson',      ini: 'EN', av: '#FFDCCB', ac: '#7D0037', source: 'app',   noAccount: false },
      { id: 111, personId: 8,  name: 'Björn Svensson',   ini: 'BS', av: '#FFDCCB', ac: '#7D0037', source: 'app',   noAccount: false },
      { id: 112, personId: 11, name: 'Lena Magnusson',   ini: 'LM', av: '#FFEBE1', ac: '#7D0037', source: 'kiosk', noAccount: false },
    ],
    history: ['Skapades – ' + d(-14)],
    waitlistCount: 0,
  },
  {
    id: 5, church: 1, title: 'Nattvardsgudstjänst', groups: ['kyrkv', 'brand'],
    date: d(1), time: '18:30', plats: 'Domkyrkan', spots: 3, filled: 3,
    vk: 'Johan Eriksson', tel: '070-222 33 44', desc: 'Kvällsgudstjänst med nattvard.',
    cancelled: false, pubStatus: 'live', pubDate: '', kioskVisible: false,
    responsibleUserIds: [2],
    bookings: [
      { id: 113, personId: 1,  name: 'Maria Lindström', ini: 'ML', av: '#FFC3AA', ac: '#7D0037', source: 'app', noAccount: false },
      { id: 114, personId: 5,  name: 'Eva Nilsson',      ini: 'EN', av: '#FFDCCB', ac: '#7D0037', source: 'app', noAccount: false },
      { id: 115, personId: 10, name: 'Peter Holm',        ini: 'PH', av: '#FFDCCB', ac: '#7D0037', source: 'app', noAccount: false },
    ],
    history: ['Skapades – ' + d(-3)],
    waitlistCount: 3,
  },
  {
    id: 6, church: 1, title: 'Söndagsskola – ledarstöd', groups: ['extra'],
    date: d(9), time: '09:30', plats: 'Församlingshemmet', spots: 4, filled: 1,
    vk: 'Rolf Jansson', tel: '073-900 11 22', desc: 'Stöd till söndagsskolans ledare under gudstjänsten.',
    cancelled: false, pubStatus: 'live', pubDate: '', kioskVisible: false,
    responsibleUserIds: [14],
    bookings: [
      { id: 116, personId: 9, name: 'Karin Lund', ini: 'KL', av: '#FFEBE1', ac: '#7D0037', source: 'app', noAccount: false },
    ],
    history: ['Skapades – ' + d(-6)],
    waitlistCount: 0,
  },
  {
    id: 7, church: 1, title: 'Sommarkonsert med kören', groups: ['konsert', 'extra'],
    date: d(21), time: '14:00', plats: 'Domkyrkan', spots: 8, filled: 0,
    vk: 'Johan Eriksson', tel: '070-222 33 44', desc: 'Stor sommarkonsert – förväntat besökarantal 500+.',
    cancelled: false, pubStatus: 'scheduled', pubDate: d(12), kioskVisible: false,
    responsibleUserIds: [2],
    bookings: [],
    history: ['Skapades – ' + d(-2)],
    waitlistCount: 0,
  },
  {
    id: 8, church: 1, title: 'Ekumenisk gudstjänst', groups: ['kyrkv', 'doerr', 'extra'],
    date: d(14), time: '11:00', plats: 'Domkyrkan', spots: 5, filled: 2,
    vk: 'Johan Eriksson', tel: '070-222 33 44', desc: 'Gemensam gudstjänst med tre grannförsamlingar.',
    cancelled: false, pubStatus: 'live', pubDate: '', kioskVisible: true,
    responsibleUserIds: [2],
    bookings: [
      { id: 117, personId: 4, name: 'Lars Pettersson', ini: 'LP', av: '#FFEBE1', ac: '#7D0037', source: 'app', noAccount: false },
      { id: 118, personId: 8, name: 'Björn Svensson',  ini: 'BS', av: '#FFDCCB', ac: '#7D0037', source: 'app', noAccount: false },
    ],
    history: ['Skapades – ' + d(-8)],
    waitlistCount: 0,
  },
  {
    id: 9, church: 1, title: 'Begravning – familjen Holm', groups: ['kyrkv'],
    date: d(-1), time: '13:00', plats: 'Domkyrkan', spots: 2, filled: 2,
    vk: 'Johan Eriksson', tel: '070-222 33 44', desc: 'Begravningsgudstjänst. Respektfullt och tyst uppträdande.',
    cancelled: false, pubStatus: 'live', pubDate: '', kioskVisible: false,
    responsibleUserIds: [2],
    bookings: [
      { id: 119, personId: 7,  name: 'Ingrid Johansson', ini: 'IJ', av: '#FFEBE1', ac: '#7D0037', source: 'app', noAccount: false },
      { id: 120, personId: 10, name: 'Peter Holm',        ini: 'PH', av: '#FFDCCB', ac: '#7D0037', source: 'app', noAccount: false },
    ],
    history: ['Skapades – ' + d(-14)],
    waitlistCount: 0,
  },
  {
    id: 10, church: 1, title: 'Konfirmandgudstjänst', groups: ['kyrkv', 'doerr'],
    date: d(-3), time: '11:00', plats: 'Domkyrkan', spots: 4, filled: 4,
    vk: 'Rolf Jansson', tel: '073-900 11 22', desc: 'Konfirmation för årets konfirmander. Extra högtidlig.',
    cancelled: false, pubStatus: 'live', pubDate: '', kioskVisible: false,
    responsibleUserIds: [14],
    bookings: [
      { id: 121, personId: 1,  name: 'Maria Lindström', ini: 'ML', av: '#FFC3AA', ac: '#7D0037', source: 'app', noAccount: false },
      { id: 122, personId: 4,  name: 'Lars Pettersson',  ini: 'LP', av: '#FFEBE1', ac: '#7D0037', source: 'app', noAccount: false },
      { id: 123, personId: 6,  name: 'Anders Carlsson',  ini: 'AC', av: '#FFDCCB', ac: '#7D0037', source: 'app', noAccount: false },
      { id: 124, personId: 11, name: 'Lena Magnusson',   ini: 'LM', av: '#FFEBE1', ac: '#7D0037', source: 'app', noAccount: false },
    ],
    history: ['Skapades – ' + d(-21)],
    waitlistCount: 0,
  },
  {
    id: 11, church: 1, title: 'Kantatgudstjänst', groups: ['kyrkv', 'konsert'],
    date: d(4), time: '10:00', plats: 'Domkyrkan', spots: 3, filled: 1,
    vk: 'Johan Eriksson', tel: '070-222 33 44', desc: '',
    cancelled: true, pubStatus: 'live', pubDate: '', kioskVisible: false,
    responsibleUserIds: [2],
    bookings: [{ id: 125, personId: 7, name: 'Ingrid Johansson', ini: 'IJ', av: '#FFEBE1', ac: '#7D0037', source: 'app', noAccount: false }],
    history: ['Skapades – ' + d(-10), 'Ställdes in – ' + d(-1)],
    waitlistCount: 0,
  },
  {
    id: 12, church: 2, title: 'Hovgudstjänst', groups: ['kyrkv', 'doerr'],
    date: d(2), time: '11:00', plats: 'Hovförsamlingen', spots: 3, filled: 1,
    vk: 'Anna Ström', tel: '08-789 01 23', desc: 'Ordinarie gudstjänst i Hovförsamlingen.',
    cancelled: false, pubStatus: 'live', pubDate: '', kioskVisible: false,
    responsibleUserIds: [15],
    bookings: [
      { id: 126, personId: 12, name: 'Ove Gustafsson', ini: 'OG', av: '#FFDCCB', ac: '#7D0037', source: 'app', noAccount: false },
    ],
    history: ['Skapades – ' + d(-5)],
    waitlistCount: 0,
  },
]

export const DEMO_MESSAGES: MessageData[] = [
  { id: 1, from: 'Sarah Björk',   to: 'Alla kyrkvärdarna', toCount: 8, subject: 'Viktig info inför midsommar',    body: 'Hej alla! Kom ihåg att vi möts 30 minuter innan för briefing vid norra ingången.',  sentAt: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: 2, from: 'Johan Eriksson', to: 'Konsertguider',      toCount: 4, subject: 'Orgelkonsert nästa fredag',      body: 'Orgelkonserten är fredag kl 19. Samling vid norra ingången kl 18:30. Ta med orange väst.', sentAt: new Date(Date.now() - 5 * 86400000).toISOString() },
]

export const DEMO_NOTIFICATIONS: NotifData[] = [
  { id: 1, userId: 1, type: 'new_pass',  title: 'Nytt pass: Orgelkonsert – Bach',          body: 'Det finns ett nytt pass för din grupp Konsertguide.',         time: new Date(Date.now() - 86400000).toISOString(),      read: false },
  { id: 2, userId: 1, type: 'reminder',  title: 'Påminnelse: Nattvardsgudstjänst imorgon', body: 'Du är bokad på Nattvardsgudstjänst kl 18:30 i Domkyrkan.', time: new Date(Date.now() - 2 * 3600000).toISOString(),  read: false },
  { id: 3, userId: 1, type: 'cancelled', title: 'Kantatgudstjänst är inställd',             body: 'Passet ' + d(4) + ' kl 10:00 har ställts in.',              time: new Date(Date.now() - 3600000).toISOString(),       read: true  },
]

// Kommentarer på pass i demoläget. authorId och profileId är demo-personernas id som text,
// precis som i skarpt läge där de är profilernas uuid.
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600000).toISOString()

export const DEMO_COMMENTS: PassMessage[] = [
  {
    id: 1, passId: 1, parentId: null, authorId: '1', authorName: 'Maria Lindström',
    body: 'Hej! Ska vi kyrkvärdar vara på plats 09:30 som vanligt?',
    createdAt: hoursAgo(26), editedAt: null, deletedAt: null, authorIsStaff: false, mentions: [],
  },
  {
    id: 2, passId: 1, parentId: 1, authorId: '2', authorName: 'Johan Eriksson',
    body: 'Hej @Maria Lindström! Ja, 09:30 vid sakristian. Jag låser upp.',
    createdAt: hoursAgo(22), editedAt: null, deletedAt: null, authorIsStaff: true,
    mentions: [{ profileId: '1', name: 'Maria Lindström' }],
  },
  {
    id: 3, passId: 1, parentId: null, authorId: '4', authorName: 'Lars Pettersson',
    body: 'Jag kan ta dörren vid norra ingången om ingen annan vill.',
    createdAt: hoursAgo(3), editedAt: hoursAgo(2), deletedAt: null, authorIsStaff: false, mentions: [],
  },
  {
    id: 4, passId: 4, parentId: null, authorId: '3', authorName: 'Sarah Björk',
    body: 'Vi behöver några som kan bära bord från församlingshemmet kl 14. Skriv här om du kan hjälpa till!',
    createdAt: hoursAgo(30), editedAt: null, deletedAt: null, authorIsStaff: true, mentions: [],
  },
]

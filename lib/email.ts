const BREVO_API_KEY = process.env.BREVO_API_KEY!
const FROM_EMAIL = process.env.BREVO_FROM ?? 'isak.folcker@svenskakyrkan.se'
const FROM_NAME  = process.env.BREVO_FROM_NAME ?? 'Kyrkans uppdragsapp'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Escapar alla textfält (även nästlade) innan de sätts in i mailens HTML,
// så att ingen kan smyga in egna länkar eller HTML via t.ex. passets titel.
function escapeAll<T>(obj: T): T {
  if (typeof obj === 'string') return escapeHtml(obj) as unknown as T
  if (Array.isArray(obj)) return obj.map(v => escapeAll(v)) as unknown as T
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) out[k] = escapeAll(v)
    return out as T
  }
  return obj
}

// I testmiljön sätts EMAIL_ALLOWLIST (kommaseparerad) så mail bara kan gå till
// godkända testadresser, aldrig till riktiga volontärer/anställda av misstag.
// Produktionen har ingen EMAIL_ALLOWLIST satt, så filtret är då inaktivt.
// "namn@exempel.se" tillåter även alias som "namn+test@exempel.se".
export function isAllowedTestEmail(email: string, allowlist: string[]): boolean {
  const lower = email.toLowerCase()
  return allowlist.some(pattern => {
    const p = pattern.trim().toLowerCase()
    if (!p) return false
    if (p.startsWith('@')) return lower.endsWith(p)
    if (lower === p) return true
    const [localPart, domain] = p.split('@')
    return !!domain && lower.startsWith(localPart + '+') && lower.endsWith('@' + domain)
  })
}

function filterToAllowlist(toArr: string[]): string[] {
  const raw = process.env.EMAIL_ALLOWLIST
  if (!raw) return toArr
  const allowlist = raw.split(',').map(s => s.trim()).filter(Boolean)
  const allowed = toArr.filter(addr => isAllowedTestEmail(addr, allowlist))
  const blocked = toArr.filter(addr => !allowed.includes(addr))
  if (blocked.length) console.warn(`[EMAIL_ALLOWLIST] Blockerade ${blocked.length} mottagare utanför testlistan:`, blocked)
  return allowed
}

async function send(to: string | string[], subject: string, html: string, replyTo?: string) {
  const toArr = filterToAllowlist(Array.isArray(to) ? to : [to])
  if (!toArr.length) return
  const chunks: string[][] = []
  for (let i = 0; i < toArr.length; i += 99) chunks.push(toArr.slice(i, i + 99))

  for (const chunk of chunks) {
    const body: any = {
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: chunk.map(email => ({ email })),
      subject,
      htmlContent: html,
    }
    if (replyTo) body.replyTo = { email: replyTo }
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Brevo ${res.status}: ${errText}`)
    }
  }
}


// ---------------------------------------------------------------------------
// Gemensam mailram i Svenska kyrkans profil (samma färger som appen).
// Mailklienter klarar inte CSS-variabler, rgba eller webbfonter på ett säkert
// sätt, så allt är tabeller med inline-stilar och fasta hexfärger.
// Webbfonter laddas medvetet INTE från Google (GDPR). DM Sans används om den
// redan finns på datorn, annars Arial/Helvetica.
// ---------------------------------------------------------------------------

const C = {
  beige: '#FFEBE1',
  vin: '#7D0037',
  rosa: '#FFC3AA',
  orange: '#FF785A',
  text: '#000000',
  text2: '#4d4d4d',
  vit: '#FFFFFF',
  linje: '#F2D3C6',
}
const SANS = "'DM Sans', Arial, Helvetica, sans-serif"
const SERIF = "Georgia, 'Times New Roman', serif"
const PRIVACY_URL = 'https://www.kyrkouppdrag.se/integritetspolicy'

export type RenderedEmail = { subject: string; html: string }

// Kursivt, betonat ord (som Spectral i appen).
function em(html: string): string {
  return `<span style="font-family:${SERIF};font-style:italic;font-weight:400">${html}</span>`
}

function p(html: string, extra = ''): string {
  return `<p style="margin:0 0 16px;font-family:${SANS};font-size:16px;line-height:1.5;color:${C.text};${extra}">${html}</p>`
}

// Knapp som vanlig länk. Minst 44px hög. Blir fyrkantig i Outlook, det är ok.
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px">
  <tr><td bgcolor="${C.vin}" style="background:${C.vin};border-radius:999px">
    <a href="${href}" style="display:inline-block;padding:13px 26px;min-height:18px;line-height:18px;font-family:${SANS};font-size:16px;font-weight:700;color:${C.vit};text-decoration:none;border-radius:999px">${label}</a>
  </td></tr>
</table>`
}

// Ruta med passets namn och uppgifter. Alla värden ska redan vara escapade.
function passCard(title: string, rows: [string, string][] = []): string {
  const rowHtml = rows
    .filter(([, v]) => v)
    .map(([label, value]) => `<tr>
      <td valign="top" style="padding:4px 12px 0 0;width:56px;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.text2}">${label}</td>
      <td valign="top" style="padding:4px 0 0;font-family:${SANS};font-size:15px;line-height:1.5;color:${C.text}">${value}</td>
    </tr>`).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px">
  <tr><td bgcolor="${C.beige}" style="background:${C.beige};border-left:4px solid ${C.orange};border-radius:0 16px 16px 0;padding:16px 18px">
    <div style="font-family:${SANS};font-size:18px;line-height:1.35;font-weight:700;color:${C.text}">${title}</div>
    ${rowHtml ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px">${rowHtml}</table>` : ''}
  </td></tr>
</table>`
}

function passRows(h: { date: string; time: string; plats: string }): [string, string][] {
  return [['Datum', h.date], ['Tid', h.time], ['Plats', h.plats]]
}

// Kontaktrad, t.ex. "Vaktmästare: Namn – 070…".
function contact(label: string, name: string, ...extra: (string | undefined)[]): string {
  const rest = extra.filter(Boolean).map(x => ` – <span style="white-space:nowrap">${x}</span>`).join('')
  return p(`<span style="color:${C.text2}">${label}:</span> <strong>${name}</strong>${rest}`, 'font-size:15px;margin-bottom:8px')
}

export function emailLayout(opts: {
  /** Rubrik (HTML, redan escapad). Kan innehålla em() för kursiv betoning. */
  title: string
  /** Kort text som syns i inkorgen efter ämnesraden (redan escapad). */
  preheader: string
  /** Innehållet (HTML, redan escapat). */
  body: string
  /** Knapp längst ner i innehållet. href och label ska vara escapade. */
  cta?: { href: string; label: string }
  /** Församlingsnamn under "Kyrkouppdrag" i huvudet (redan escapat). */
  churchName?: string
  /** Varför mottagaren får mailet (HTML, redan escapad). */
  reason: string
}): string {
  const plainTitle = opts.title.replace(/<[^>]*>/g, '')
  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${plainTitle}</title>
</head>
<body style="margin:0;padding:0;background:${C.beige};color:${C.text};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${C.beige}">${opts.preheader}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.beige}" style="background:${C.beige}">
<tr><td align="center" style="padding:0 12px 32px">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%">
  <tr><td bgcolor="${C.vin}" style="background:${C.vin};border-radius:0 0 48px 0;padding:26px 28px 30px">
    <div style="font-family:${SANS};font-size:18px;line-height:1.3;font-weight:500;color:${C.beige}">Kyrkouppdrag</div>
    ${opts.churchName ? `<div style="font-family:${SERIF};font-style:italic;font-size:16px;line-height:1.4;color:${C.beige}">${opts.churchName}</div>` : ''}
  </td></tr>
  <tr><td style="padding:32px 4px 18px">
    <h1 style="margin:0;font-family:${SANS};font-size:28px;line-height:1.2;font-weight:500;color:${C.text}">${opts.title}</h1>
  </td></tr>
  <tr><td bgcolor="${C.vit}" style="background:${C.vit};border-radius:20px;padding:24px 22px 20px">
    ${opts.body}
    ${opts.cta ? button(opts.cta.href, opts.cta.label) : ''}
  </td></tr>
  <tr><td style="padding:20px 4px 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.text2}">
    <p style="margin:0 0 8px">${opts.reason}</p>
    <p style="margin:0">Kyrkouppdrag, Svenska kyrkan Växjö. <a href="${PRIVACY_URL}" style="color:${C.vin};text-decoration:underline">Så hanterar vi dina uppgifter</a></p>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Mallarna. Varje mall har en ren render-funktion (används även av
// scripts/forhandsvisa-mail.ts) och en send-funktion som skickar den.
// ---------------------------------------------------------------------------

type BookingOpts = {
  to: string; name: string; passTitle: string; date: string; time: string; plats: string; vk: string; tel: string
}

export function renderBookingConfirmation(opts: BookingOpts): RenderedEmail {
  const h = escapeAll(opts)
  return {
    subject: `Bokningsbekräftelse: ${opts.passTitle}`,
    html: emailLayout({
      title: `Du är ${em('bokad')}, ${h.name}`,
      preheader: `${h.passTitle}, ${h.date} ${h.time}`,
      body: p('Tack! Du är bokad på det här passet:')
        + passCard(h.passTitle, passRows(h))
        + contact('Vaktmästare', h.vk, h.tel),
      reason: 'Du får det här mailet för att du har bokat ett pass i Kyrkouppdrag.',
    }),
  }
}

export async function sendBookingConfirmation(opts: BookingOpts) {
  const m = renderBookingConfirmation(opts)
  return send(opts.to, m.subject, m.html)
}

type CancellationOpts = { to: string; name: string; passTitle: string; date: string }

export function renderCancellationNotice(opts: CancellationOpts): RenderedEmail {
  const h = escapeAll(opts)
  return {
    subject: `Inställt: ${opts.passTitle}`,
    html: emailLayout({
      title: `Passet är ${em('inställt')}`,
      preheader: `${h.passTitle}, ${h.date}`,
      body: p(`Hej ${h.name},`)
        + p('Tyvärr har det här passet ställts in:')
        + passCard(h.passTitle, [['Datum', h.date]])
        + p('Du har avbokats automatiskt. Du behöver inte göra något.', 'margin-bottom:4px'),
      reason: 'Du får det här mailet för att du var bokad på passet.',
    }),
  }
}

export async function sendCancellationNotice(opts: CancellationOpts) {
  const m = renderCancellationNotice(opts)
  return send(opts.to, m.subject, m.html)
}

type PassChangeOpts = { to: string; name: string; passTitle: string; date: string; time: string; plats: string }

export function renderPassChangeNotice(opts: PassChangeOpts): RenderedEmail {
  const h = escapeAll(opts)
  return {
    subject: `Uppdatering: ${opts.passTitle}`,
    html: emailLayout({
      title: `Passet är ${em('ändrat')}`,
      preheader: `Nya uppgifter: ${h.date} ${h.time}, ${h.plats}`,
      body: p(`Hej ${h.name}, ett pass du är bokad på har ändrats. Så här ser det ut nu:`)
        + passCard(h.passTitle, passRows(h)),
      reason: 'Du får det här mailet för att du är bokad på passet.',
    }),
  }
}

export async function sendPassChangeNotice(opts: PassChangeOpts) {
  const m = renderPassChangeNotice(opts)
  return send(opts.to, m.subject, m.html)
}

type BulkOpts = { to: string[]; subject: string; body: string; fromName: string }

export function renderBulkMessage(opts: BulkOpts): RenderedEmail {
  const from = escapeHtml(opts.fromName)
  return {
    subject: opts.subject,
    html: emailLayout({
      title: `Meddelande från ${em(from)}`,
      preheader: escapeHtml(opts.body.slice(0, 90)),
      body: p(escapeHtml(opts.body).replace(/\n/g, '<br>'), 'margin-bottom:4px'),
      reason: `Det här meddelandet skickades av ${from} via Kyrkouppdrag, för att du är med i en grupp eller är bokad på ett pass.`,
    }),
  }
}

export async function sendBulkMessage(opts: BulkOpts) {
  const m = renderBulkMessage(opts)
  return send(opts.to, m.subject, m.html)
}

type NewPassOpts = { to: string[]; passTitle: string; date: string; time: string; plats: string; groups: string[] }

export function renderNewPassNotice(opts: NewPassOpts): RenderedEmail {
  const h = escapeAll(opts)
  return {
    subject: `Nytt pass: ${opts.passTitle}`,
    html: emailLayout({
      title: `Ett ${em('nytt')} pass är ledigt`,
      preheader: `${h.passTitle}, ${h.date} ${h.time}`,
      body: p('Det finns ett nytt pass som du kan anmäla dig till:')
        + passCard(h.passTitle, passRows(h)),
      cta: { href: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`, label: 'Se passet och anmäl dig' },
      reason: 'Du får det här mailet för att du är med i en grupp som passet är öppet för.',
    }),
  }
}

export async function sendNewPassNotice(opts: NewPassOpts) {
  if (!opts.to.length) return
  const m = renderNewPassNotice(opts)
  return send(opts.to, m.subject, m.html)
}

type ReminderOpts = {
  to: string; name: string; passTitle: string; date: string; time: string; plats: string; vk: string; tel: string
  ansvarig?: { name: string; tel?: string; mail?: string }
}

export function renderPassReminder(opts: ReminderOpts): RenderedEmail {
  const h = escapeAll(opts)
  const showAnsvarig = opts.ansvarig && opts.ansvarig.name && opts.ansvarig.name !== opts.vk
  return {
    subject: `Påminnelse imorgon: ${opts.passTitle}`,
    html: emailLayout({
      title: `Vi ses ${em('imorgon')}, ${h.name}`,
      preheader: `Påminnelse: ${h.passTitle}, ${h.date} ${h.time}`,
      body: p('Du har ett uppdrag imorgon:')
        + passCard(h.passTitle, passRows(h))
        + contact('Vaktmästare', h.vk || '–', h.tel)
        + (showAnsvarig ? contact('Ansvarig', h.ansvarig!.name, h.ansvarig!.tel, h.ansvarig!.mail) : ''),
      reason: 'Du får det här mailet för att du är bokad på passet imorgon.',
    }),
  }
}

export async function sendPassReminder(opts: ReminderOpts) {
  const m = renderPassReminder(opts)
  return send(opts.to, m.subject, m.html)
}

type StaffListOpts = {
  to: string; name: string; passTitle: string; date: string; time: string; plats: string
  deltagare: { name: string; mail?: string; tel?: string }[]
}

export function renderStaffDeltagarlista(opts: StaffListOpts): RenderedEmail {
  const h = escapeAll(opts)
  // En rad per person, staplat så att det går att läsa i mobilen.
  const rows = opts.deltagare.length
    ? opts.deltagare.map((d, i) => `<tr><td style="padding:10px 0;${i ? `border-top:1px solid ${C.linje};` : ''}font-family:${SANS};font-size:15px;line-height:1.45;color:${C.text}">
        <strong>${escapeHtml(d.name)}</strong><br>
        <span style="color:${C.text2}">Telefon:</span> ${escapeHtml(d.tel || '–')}<br>
        <span style="color:${C.text2}">Mail:</span> ${escapeHtml(d.mail || '–')}
      </td></tr>`).join('')
    : `<tr><td style="padding:10px 0;font-family:${SANS};font-size:15px;color:${C.text2}">Inga anmälda ännu.</td></tr>`
  return {
    subject: `Deltagarlista imorgon: ${opts.passTitle}`,
    html: emailLayout({
      title: `Deltagarlista för ${em('imorgon')}`,
      preheader: `${h.passTitle}: ${opts.deltagare.length} anmälda`,
      body: p(`Hej ${h.name}, du är vaktmästare eller ansvarig för:`)
        + passCard(h.passTitle, passRows(h))
        + `<h2 style="margin:0 0 4px;font-family:${SANS};font-size:18px;font-weight:500;color:${C.text}">Anmälda (${opts.deltagare.length})</h2>`
        + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`,
      reason: 'Du får det här mailet för att du är vaktmästare eller ansvarig för passet. Uppgifterna är bara till för passet, spara dem inte.',
    }),
  }
}

export async function sendStaffDeltagarlista(opts: StaffListOpts) {
  const m = renderStaffDeltagarlista(opts)
  return send(opts.to, m.subject, m.html)
}

type WaitlistPromotionOpts = BookingOpts

export function renderWaitlistPromotion(opts: WaitlistPromotionOpts): RenderedEmail {
  const h = escapeAll(opts)
  return {
    subject: `Du har fått en plats: ${opts.passTitle}`,
    html: emailLayout({
      title: `Du har fått en ${em('plats')}`,
      preheader: `${h.passTitle}, ${h.date} ${h.time}`,
      body: p(`Hej ${h.name}! En plats har blivit ledig och du stod först i kön. Du är nu bokad på:`)
        + passCard(h.passTitle, passRows(h))
        + contact('Vaktmästare', h.vk, h.tel),
      reason: 'Du får det här mailet för att du stod på väntelistan till passet.',
    }),
  }
}

export async function sendWaitlistPromotion(opts: WaitlistPromotionOpts) {
  const m = renderWaitlistPromotion(opts)
  return send(opts.to, m.subject, m.html)
}

type WaitlistJoinedOpts = {
  to: string; name: string; volunteerName: string; passTitle: string; date: string; time: string; plats: string
}

export function renderWaitlistJoinedNotice(opts: WaitlistJoinedOpts): RenderedEmail {
  const h = escapeAll(opts)
  return {
    subject: `Ny på väntelistan: ${opts.passTitle}`,
    html: emailLayout({
      title: `Ny person på ${em('väntelistan')}`,
      preheader: `${h.volunteerName} väntar på en plats`,
      body: p(`Hej ${h.name},`)
        + p(`<strong>${h.volunteerName}</strong> har ställt sig på väntelistan för:`)
        + passCard(h.passTitle, passRows(h)),
      reason: 'Du får det här mailet för att du är ansvarig för passet.',
    }),
  }
}

export async function sendWaitlistJoinedNotice(opts: WaitlistJoinedOpts) {
  const m = renderWaitlistJoinedNotice(opts)
  return send(opts.to, m.subject, m.html)
}

type CommentOpts = {
  to: string; name: string; passTitle: string; authorName: string; kind: 'mention' | 'reply'; url: string
}

// Mail när någon @nämner dig eller svarar på din kommentar på ett pass.
// Innehåller medvetet INTE kommentarens text, bara att det finns något att läsa.
export function renderCommentNotice(opts: CommentOpts): RenderedEmail {
  const h = escapeAll(opts)
  const subject = opts.kind === 'mention'
    ? `${opts.authorName} nämnde dig: ${opts.passTitle}`
    : `Nytt svar på din kommentar: ${opts.passTitle}`
  const lead = opts.kind === 'mention'
    ? `<strong>${h.authorName}</strong> har nämnt dig i en kommentar på passet:`
    : `<strong>${h.authorName}</strong> har svarat på din kommentar på passet:`
  return {
    subject,
    html: emailLayout({
      title: opts.kind === 'mention' ? `Du har blivit ${em('nämnd')}` : `Du har fått ett ${em('svar')}`,
      preheader: `${h.authorName} på ${h.passTitle}`,
      body: p(`Hej ${h.name},`) + p(lead) + passCard(h.passTitle),
      cta: { href: h.url, label: 'Läs kommentaren i appen' },
      reason: 'Du får det här mailet för att någon nämnde dig eller svarade dig. Du kan stänga av mail om kommentarer under Min profil.',
    }),
  }
}

export async function sendCommentNotice(opts: CommentOpts) {
  const m = renderCommentNotice(opts)
  return send(opts.to, m.subject, m.html)
}

type InvitationOpts = {
  to: string
  name: string
  inviterName: string
  inviterEmail?: string
  inviteUrl: string
  role: string
  churchName?: string
  existingAccount?: boolean
}

export function renderInvitation(opts: InvitationOpts): RenderedEmail {
  const roleLabel: Record<string, string> = {
    ideell: 'ideell volontär', anstalld: 'anställd',
    fadmin: 'församlingsadmin', padmin: 'pastoratsadmin',
  }
  const church = opts.churchName ? escapeHtml(opts.churchName) : ''
  const inviter = escapeHtml(opts.inviterName)
  const churchText = church ? ` i <strong>${church}</strong>` : ''
  const buttonText = opts.existingAccount ? 'Öppna församlingen' : 'Skapa konto och logga in'
  const accountText = opts.existingAccount
    ? p('Du använder samma konto och lösenord som tidigare. Församlingen läggs till i din församlingsväljare.', 'margin-bottom:8px')
    : p('Första gången fyller du i dina kontaktuppgifter och väljer lösenord.', 'margin-bottom:8px')

  return {
    subject: `Inbjudan till Kyrkans uppdragsapp`,
    html: emailLayout({
      title: `Du är ${em('inbjuden')}`,
      preheader: `${inviter} har bjudit in dig till Kyrkouppdrag`,
      churchName: church || undefined,
      body: p(`Hej ${escapeHtml(opts.name)},`)
        + p(`${inviter} har bjudit in dig som <strong>${roleLabel[opts.role] ?? escapeHtml(opts.role)}</strong>${churchText} i Kyrkouppdrag, appen där vi samordnar uppdrag i kyrkan.`)
        + accountText,
      cta: { href: escapeHtml(opts.inviteUrl), label: buttonText },
      reason: `Du får det här mailet för att ${inviter} har bjudit in dig. Länken är tidsbegränsad. Svarar du på mailet når du ${inviter}.`,
    }),
  }
}

export async function sendInvitation(opts: InvitationOpts) {
  const m = renderInvitation(opts)
  return send(opts.to, m.subject, m.html, opts.inviterEmail)
}

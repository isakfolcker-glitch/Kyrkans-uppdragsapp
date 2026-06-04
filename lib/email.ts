const BREVO_API_KEY = process.env.BREVO_API_KEY!
const FROM_EMAIL = process.env.BREVO_FROM ?? 'isak.folcker@svenskakyrkan.se'
const FROM_NAME  = process.env.BREVO_FROM_NAME ?? 'Kyrkans uppdragsapp'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function send(to: string | string[], subject: string, html: string) {
  const toArr = Array.isArray(to) ? to : [to]
  // Brevo max 99 mottagare per anrop
  const chunks: string[][] = []
  for (let i = 0; i < toArr.length; i += 99) chunks.push(toArr.slice(i, i + 99))

  for (const chunk of chunks) {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM_EMAIL },
        to: chunk.map(email => ({ email })),
        subject,
        htmlContent: html,
      }),
    })
  }
}

export async function sendBookingConfirmation(opts: {
  to: string; name: string; passTitle: string; date: string; time: string; plats: string; vk: string; tel: string
}) {
  return send(opts.to, `Bokningsbekräftelse: ${opts.passTitle}`, `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#534AB7">Hej ${opts.name}!</h2>
      <p>Du är bokad på följande pass:</p>
      <div style="background:#F1EFE8;border-radius:10px;padding:16px;margin:16px 0">
        <strong style="font-size:16px">${opts.passTitle}</strong><br>
        📅 ${opts.date} &nbsp;🕐 ${opts.time}<br>
        📍 ${opts.plats}
      </div>
      <p>Vakmästare: <strong>${opts.vk}</strong> – ${opts.tel}</p>
      <p style="color:#888780;font-size:12px">Kyrkans uppdragsapp</p>
    </div>
  `)
}

export async function sendCancellationNotice(opts: {
  to: string; name: string; passTitle: string; date: string
}) {
  return send(opts.to, `Inställt: ${opts.passTitle}`, `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#791F1F">Passet är inställt</h2>
      <p>Hej ${opts.name},</p>
      <p>Tyvärr har följande pass ställts in:</p>
      <div style="background:#FCEBEB;border-radius:10px;padding:16px;margin:16px 0">
        <strong>${opts.passTitle}</strong><br>📅 ${opts.date}
      </div>
      <p>Du har avbokats automatiskt.</p>
      <p style="color:#888780;font-size:12px">Kyrkans uppdragsapp</p>
    </div>
  `)
}

export async function sendPassChangeNotice(opts: {
  to: string; name: string; passTitle: string; date: string; time: string; plats: string
}) {
  return send(opts.to, `Uppdatering: ${opts.passTitle}`, `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#633806">Pass uppdaterat</h2>
      <p>Hej ${opts.name}, ett pass du är bokad på har ändrats:</p>
      <div style="background:#FAEEDA;border-radius:10px;padding:16px;margin:16px 0">
        <strong>${opts.passTitle}</strong><br>
        📅 ${opts.date} &nbsp;🕐 ${opts.time}<br>
        📍 ${opts.plats}
      </div>
      <p style="color:#888780;font-size:12px">Kyrkans uppdragsapp</p>
    </div>
  `)
}

export async function sendBulkMessage(opts: {
  to: string[]; subject: string; body: string; fromName: string
}) {
  return send(opts.to, opts.subject, `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <p>${escapeHtml(opts.body).replace(/\n/g, '<br>')}</p>
      <p style="color:#888780;font-size:12px">Från: ${escapeHtml(opts.fromName)} – Kyrkans uppdragsapp</p>
    </div>
  `)
}

export async function sendNewPassNotice(opts: {
  to: string[]; passTitle: string; date: string; time: string; plats: string; groups: string[]
}) {
  if (!opts.to.length) return
  return send(opts.to, `Nytt pass: ${opts.passTitle}`, `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <div style="background:#7D0037;padding:20px;border-radius:12px 12px 0 0">
        <h2 style="color:#fff;margin:0">Nytt pass tillgängligt</h2>
      </div>
      <div style="background:#FFEBE1;padding:20px;border-radius:0 0 12px 12px">
        <div style="background:#fff;border-radius:10px;padding:16px;margin-bottom:16px;border-left:4px solid #7D0037">
          <strong style="font-size:16px;color:#000">${opts.passTitle}</strong><br>
          <span style="color:#5F5E5A">📅 ${opts.date} &nbsp;🕐 ${opts.time}</span><br>
          <span style="color:#5F5E5A">📍 ${opts.plats}</span>
        </div>
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="display:inline-block;background:#7D0037;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">
          Se passet och anmäl dig →
        </a>
        <p style="color:#888;font-size:12px;margin-top:16px">Kyrkans uppdragsapp</p>
      </div>
    </div>
  `)
}

export async function sendPassReminder(opts: {
  to: string; name: string; passTitle: string; date: string; time: string; plats: string; vk: string; tel: string
}) {
  return send(opts.to, `Påminnelse imorgon: ${opts.passTitle}`, `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <div style="background:#28A88E;padding:20px;border-radius:12px 12px 0 0">
        <h2 style="color:#fff;margin:0">Påminnelse – imorgon!</h2>
      </div>
      <div style="background:#FFEBE1;padding:20px;border-radius:0 0 12px 12px">
        <p style="color:#000">Hej ${opts.name}, du har ett uppdrag imorgon:</p>
        <div style="background:#fff;border-radius:10px;padding:16px;margin:16px 0;border-left:4px solid #28A88E">
          <strong style="font-size:16px;color:#000">${opts.passTitle}</strong><br>
          <span style="color:#5F5E5A">📅 ${opts.date} &nbsp;🕐 ${opts.time}</span><br>
          <span style="color:#5F5E5A">📍 ${opts.plats}</span>
        </div>
        <p style="color:#5F5E5A">Vakmästare: <strong>${opts.vk}</strong>${opts.tel ? ' – ' + opts.tel : ''}</p>
        <p style="color:#888;font-size:12px">Kyrkans uppdragsapp</p>
      </div>
    </div>
  `)
}

export async function sendWaitlistPromotion(opts: {
  to: string; name: string; passTitle: string; date: string; time: string; plats: string; vk: string; tel: string
}) {
  return send(opts.to, `Du har fått en plats: ${opts.passTitle}`, `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <div style="background:#085041;padding:20px;border-radius:12px 12px 0 0">
        <h2 style="color:#fff;margin:0">Du har fått en plats!</h2>
      </div>
      <div style="background:#F0FAF6;padding:20px;border-radius:0 0 12px 12px">
        <p style="color:#000">Hej ${opts.name}! En plats har öppnats upp och du var först i kön.</p>
        <div style="background:#fff;border-radius:10px;padding:16px;margin:16px 0;border-left:4px solid #085041">
          <strong style="font-size:16px;color:#000">${opts.passTitle}</strong><br>
          <span style="color:#5F5E5A">📅 ${opts.date} &nbsp;🕐 ${opts.time}</span><br>
          <span style="color:#5F5E5A">📍 ${opts.plats}</span>
        </div>
        <p style="color:#5F5E5A">Vakmästare: <strong>${opts.vk}</strong>${opts.tel ? ' – ' + opts.tel : ''}</p>
        <p style="color:#888;font-size:12px">Kyrkans uppdragsapp</p>
      </div>
    </div>
  `)
}

export async function sendInvitation(opts: {
  to: string; name: string; inviterName: string; inviteUrl: string; role: string
}) {
  const roleLabel: Record<string, string> = {
    ideell: 'Ideell volontär', anstalld: 'Anställd',
    fadmin: 'Församlingsadmin', padmin: 'Pastoratsadmin',
  }
  return send(opts.to, `Inbjudan till Kyrkans uppdragsapp`, `
    <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
      <h2 style="color:#534AB7">Du är inbjuden!</h2>
      <p>Hej ${opts.name},</p>
      <p>${opts.inviterName} har bjudit in dig som <strong>${roleLabel[opts.role] ?? opts.role}</strong> i Kyrkans uppdragsapp.</p>
      <div style="margin:24px 0;text-align:center">
        <a href="${opts.inviteUrl}" style="background:#534AB7;color:#EEEDFE;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
          Skapa konto och logga in
        </a>
      </div>
      <p style="color:#888780;font-size:12px">Länken är giltig i 24 timmar.</p>
    </div>
  `)
}

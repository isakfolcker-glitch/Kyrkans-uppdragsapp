import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Avsändaradress – byt ut mot din domän när du verifierat den i Resend
const FROM = 'Kyrkans uppdragsapp <onboarding@resend.dev>'

export async function sendBookingConfirmation(opts: {
  to: string; name: string; passTitle: string; date: string; time: string; plats: string; vk: string; tel: string
}) {
  return resend.emails.send({
    from: FROM, to: opts.to,
    subject: `Bokningsbekräftelse: ${opts.passTitle}`,
    html: `
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
    `,
  })
}

export async function sendCancellationNotice(opts: {
  to: string; name: string; passTitle: string; date: string
}) {
  return resend.emails.send({
    from: FROM, to: opts.to,
    subject: `Inställt: ${opts.passTitle}`,
    html: `
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
    `,
  })
}

export async function sendPassChangeNotice(opts: {
  to: string; name: string; passTitle: string; date: string; time: string; plats: string
}) {
  return resend.emails.send({
    from: FROM, to: opts.to,
    subject: `Uppdatering: ${opts.passTitle}`,
    html: `
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
    `,
  })
}

export async function sendBulkMessage(opts: {
  to: string[]; subject: string; body: string; fromName: string
}) {
  // Skicka till max 50 åt gången (Resend-gräns per anrop)
  const chunks = []
  for (let i = 0; i < opts.to.length; i += 50) chunks.push(opts.to.slice(i, i + 50))
  for (const chunk of chunks) {
    await resend.emails.send({
      from: FROM,
      to: chunk,
      subject: opts.subject,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto">
          <p>${opts.body.replace(/\n/g, '<br>')}</p>
          <p style="color:#888780;font-size:12px">Från: ${opts.fromName} – Kyrkans uppdragsapp</p>
        </div>
      `,
    })
  }
}

export async function sendInvitation(opts: {
  to: string; name: string; inviterName: string; inviteUrl: string; role: string
}) {
  const roleLabel: Record<string, string> = {
    ideell: 'Ideell volontär', anstalld: 'Anställd',
    fadmin: 'Församlingsadmin', padmin: 'Pastoratsadmin',
  }
  return resend.emails.send({
    from: FROM, to: opts.to,
    subject: `Inbjudan till Kyrkans uppdragsapp`,
    html: `
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
    `,
  })
}

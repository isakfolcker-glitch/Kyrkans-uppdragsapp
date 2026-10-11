// Förhandsvisa alla mailmallar som HTML-filer, utan att skicka något.
//
// Kör:  npm run mail:forhandsvisa -- <mapp>
// eller: node scripts/forhandsvisa-mail.ts <mapp>
// (Node 22.18 eller senare kör TypeScript direkt.)
//
// Öppna sedan filerna i webbläsaren. All data nedan är påhittad.
// Inga riktiga personuppgifter får läggas in här (repot är publikt).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

type EmailModule = typeof import('../lib/email')

async function main() {
  const outDir = process.argv[2]
  if (!outDir) {
    console.error('Ange en mapp: node scripts/forhandsvisa-mail.ts <mapp>')
    process.exit(1)
  }
  process.env.NEXT_PUBLIC_APP_URL ??= 'https://test.kyrkouppdrag.se'

  // Laddas med sökväg vid körning så att Node kan läsa .ts-filen direkt.
  const mail: EmailModule = await import(new URL('../lib/email.ts', import.meta.url).href)

  const pass = { passTitle: 'Kyrkkaffe efter högmässan', date: 'Söndag 18 oktober', time: '11:30–13:00', plats: 'Domkyrkan, församlingssalen' }
  const maria = { to: 'maria@example.com', name: 'Maria Exempel' }
  const vk = { vk: 'Johan Exempel', tel: '070-000 00 00' }

  const mallar: Record<string, { subject: string; html: string }> = {
    '01-bokningsbekraftelse': mail.renderBookingConfirmation({ ...maria, ...pass, ...vk }),
    '02-installt': mail.renderCancellationNotice({ ...maria, passTitle: pass.passTitle, date: pass.date }),
    '03-andrat-pass': mail.renderPassChangeNotice({ ...maria, ...pass }),
    '04-massutskick': mail.renderBulkMessage({
      to: ['maria@example.com'], subject: 'Välkommen på planeringsträff',
      body: 'Hej alla!\n\nVi träffas torsdag 22 oktober kl 18 i församlingssalen för att planera julens kyrkkaffe.\n\nVarma hälsningar\nEva', fromName: 'Eva Exempel',
    }),
    '05-nytt-pass': mail.renderNewPassNotice({ to: ['maria@example.com'], ...pass, groups: ['Kyrkvärdar'] }),
    '06-paminnelse': mail.renderPassReminder({
      ...maria, ...pass, ...vk, ansvarig: { name: 'Eva Exempel', tel: '070-111 11 11', mail: 'eva@example.com' },
    }),
    '07-deltagarlista': mail.renderStaffDeltagarlista({
      to: 'johan@example.com', name: 'Johan Exempel', ...pass,
      deltagare: [
        { name: 'Maria Exempel', tel: '070-222 22 22', mail: 'maria@example.com' },
        { name: 'Anders Testsson', mail: 'anders@example.com' },
        { name: 'Sara Prov' },
      ],
    }),
    '08-plats-fran-vantelista': mail.renderWaitlistPromotion({ ...maria, ...pass, ...vk }),
    '09-ny-pa-vantelista': mail.renderWaitlistJoinedNotice({ to: 'eva@example.com', name: 'Eva Exempel', volunteerName: 'Maria Exempel', ...pass }),
    '10-kommentar-namnd': mail.renderCommentNotice({
      ...maria, passTitle: pass.passTitle, authorName: 'Eva Exempel', kind: 'mention', url: 'https://test.kyrkouppdrag.se/dashboard?pass=1',
    }),
    '11-kommentar-svar': mail.renderCommentNotice({
      ...maria, passTitle: pass.passTitle, authorName: 'Eva Exempel', kind: 'reply', url: 'https://test.kyrkouppdrag.se/dashboard?pass=1',
    }),
    '12-inbjudan': mail.renderInvitation({
      ...maria, inviterName: 'Eva Exempel', inviterEmail: 'eva@example.com',
      inviteUrl: 'https://test.kyrkouppdrag.se/onboarding?token=exempel', role: 'ideell', churchName: 'Växjö domkyrkoförsamling',
    }),
    '13-inbjudan-befintligt-konto': mail.renderInvitation({
      ...maria, inviterName: 'Eva Exempel', inviteUrl: 'https://test.kyrkouppdrag.se/dashboard', role: 'anstalld',
      churchName: 'Teleborgs församling', existingAccount: true,
    }),
  }

  const dir = resolve(outDir)
  mkdirSync(dir, { recursive: true })
  for (const [namn, m] of Object.entries(mallar)) {
    writeFileSync(join(dir, `${namn}.html`), m.html)
    console.log(`${namn}.html  Ämne: ${m.subject}`)
  }
  console.log(`\n${Object.keys(mallar).length} mail sparade i ${dir}. Inget skickades.`)
}

main()

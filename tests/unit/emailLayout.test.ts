import { describe, it, expect } from 'vitest'
import {
  emailLayout,
  renderBookingConfirmation, renderCancellationNotice, renderPassChangeNotice, renderBulkMessage,
  renderNewPassNotice, renderPassReminder, renderStaffDeltagarlista, renderWaitlistPromotion,
  renderWaitlistJoinedNotice, renderCommentNotice, renderInvitation,
} from '@/lib/email'

// Påhittade testdata. Fälten innehåller med flit HTML som måste escapas.
const evil = '<script>alert(1)</script>'
const pass = { passTitle: `Kyrkkaffe ${evil}`, date: 'Söndag 18 oktober', time: '11:30', plats: `Salen ${evil}` }
const person = { to: 'maria@example.com', name: `Maria ${evil}` }
const vk = { vk: 'Johan Exempel', tel: '070-000 00 00' }

const all = {
  bokning: renderBookingConfirmation({ ...person, ...pass, ...vk }),
  installt: renderCancellationNotice({ ...person, passTitle: pass.passTitle, date: pass.date }),
  andrat: renderPassChangeNotice({ ...person, ...pass }),
  massutskick: renderBulkMessage({ to: ['a@example.com'], subject: 'Hej', body: `Rad 1\n${evil}`, fromName: `Eva ${evil}` }),
  nyttPass: renderNewPassNotice({ to: ['a@example.com'], ...pass, groups: [] }),
  paminnelse: renderPassReminder({ ...person, ...pass, ...vk, ansvarig: { name: `Eva ${evil}`, tel: evil, mail: evil } }),
  deltagarlista: renderStaffDeltagarlista({ ...person, ...pass, deltagare: [{ name: evil, tel: evil, mail: evil }] }),
  vantelistaPlats: renderWaitlistPromotion({ ...person, ...pass, ...vk }),
  vantelistaNy: renderWaitlistJoinedNotice({ ...person, volunteerName: evil, ...pass }),
  kommentar: renderCommentNotice({ ...person, passTitle: pass.passTitle, authorName: evil, kind: 'mention', url: 'https://example.com/?a=1&b=2' }),
  inbjudan: renderInvitation({ ...person, inviterName: evil, inviteUrl: 'https://example.com/x', role: 'ideell', churchName: evil }),
}

// Färger som får finnas i mailen (Svenska kyrkans profil).
const tillatnaFarger = new Set(['#ffebe1', '#7d0037', '#ffc3aa', '#ff785a', '#000000', '#000', '#4d4d4d', '#ffffff', '#fff', '#f2d3c6'])

describe('mailens gemensamma layout', () => {
  for (const [namn, m] of Object.entries(all)) {
    describe(namn, () => {
      it('escapar användardata', () => {
        expect(m.html).not.toContain('<script>')
        expect(m.html).toContain('&lt;script&gt;')
      })

      it('har inga emojis i HTML eller ämnesrad', () => {
        expect(m.html).not.toMatch(/\p{Extended_Pictographic}/u)
        expect(m.subject).not.toMatch(/\p{Extended_Pictographic}/u)
      })

      it('använder bara profilens färger (inga lila eller gröna)', () => {
        const farger = (m.html.match(/(?<!&)#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi) ?? []).map(f => f.toLowerCase())
        expect(farger.length).toBeGreaterThan(0)
        for (const f of farger) expect(tillatnaFarger, `otillåten färg ${f}`).toContain(f)
        expect(m.html).not.toMatch(/rgba?\(/)
        expect(m.html).not.toMatch(/gradient/i)
      })

      it('laddar inga webbfonter och länkar till integritetspolicyn', () => {
        expect(m.html).not.toContain('fonts.googleapis.com')
        expect(m.html).toContain('https://www.kyrkouppdrag.se/integritetspolicy')
        expect(m.html).toContain('Kyrkouppdrag')
      })
    })
  }

  it('ämnesraden förblir vanlig text utan escapning', () => {
    expect(renderBookingConfirmation({ ...person, ...pass, ...vk, passTitle: 'Kaffe & kaka' }).subject)
      .toBe('Bokningsbekräftelse: Kaffe & kaka')
  })

  it('länkar i knappar escapas', () => {
    expect(all.kommentar.html).toContain('href="https://example.com/?a=1&amp;b=2"')
  })

  it('församlingsnamnet visas i huvudet när det finns', () => {
    const m = renderInvitation({ ...person, inviterName: 'Eva', inviteUrl: 'https://example.com', role: 'ideell', churchName: 'Exempelförsamlingen' })
    expect(m.html).toContain('Exempelförsamlingen</div>')
  })

  it('layouten har max-bredd 560px och knapp när cta anges', () => {
    const html = emailLayout({ title: 'T', preheader: 'P', body: '<p>B</p>', reason: 'R', cta: { href: 'https://example.com', label: 'Gå vidare' } })
    expect(html).toContain('max-width:560px')
    expect(html).toContain('>Gå vidare</a>')
    expect(html).toContain('border-radius:0 0 48px 0')
  })
})

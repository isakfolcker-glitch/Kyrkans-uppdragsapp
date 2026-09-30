import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendNewPassNotice, sendInvitation, sendPassReminder } from '@/lib/email'
import { demoToken } from '@/lib/demoToken'

// Fångar det som skulle ha skickats till Brevo i stället för att skicka.
const sent: { subject: string; htmlContent: string }[] = []

beforeEach(() => {
  sent.length = 0
  vi.stubEnv('EMAIL_ALLOWLIST', '')
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
    sent.push(JSON.parse(init.body))
    return new Response('{}', { status: 200 })
  }))
})

const evil = '<a href="https://phish.example">Logga in här</a>'

describe('mailmallar escapar användardata', () => {
  it('passets titel och plats kan inte bli en länk i nytt pass-mailet', async () => {
    await sendNewPassNotice({ to: ['a@test.invalid'], passTitle: evil, date: '2026-10-01', time: '10:00', plats: evil, groups: [] })
    expect(sent[0].htmlContent).not.toContain('<a href="https://phish.example">')
    expect(sent[0].htmlContent).toContain('&lt;a href=&quot;https://phish.example&quot;&gt;')
  })

  it('namn i inbjudan escapas', async () => {
    await sendInvitation({ to: 'a@test.invalid', name: evil, inviterName: evil, inviteUrl: 'https://test.kyrkouppdrag.se/x?a=1&b=2', role: 'ideell' })
    expect(sent[0].htmlContent).not.toContain('<a href="https://phish.example">')
    expect(sent[0].htmlContent).toContain('https://test.kyrkouppdrag.se/x?a=1&amp;b=2')
  })

  it('ansvarigs uppgifter i påminnelsen escapas', async () => {
    await sendPassReminder({ to: 'a@test.invalid', name: 'Anna', passTitle: 'Pass', date: 'd', time: 't', plats: 'p', vk: 'VK', tel: '1', ansvarig: { name: evil } })
    expect(sent[0].htmlContent).not.toContain('<a href="https://phish.example">')
  })

  it('ämnesraden förblir vanlig text', async () => {
    await sendNewPassNotice({ to: ['a@test.invalid'], passTitle: 'Kaffe & kaka', date: 'd', time: 't', plats: 'p', groups: [] })
    expect(sent[0].subject).toBe('Nytt pass: Kaffe & kaka')
  })
})

describe('demoToken', () => {
  it('lagrar aldrig lösenordet i klartext och är stabil', async () => {
    const t = await demoToken('hemligt')
    expect(t).not.toContain('hemligt')
    expect(t).toMatch(/^[0-9a-f]{64}$/)
    expect(await demoToken('hemligt')).toBe(t)
    expect(await demoToken('annat')).not.toBe(t)
  })
})

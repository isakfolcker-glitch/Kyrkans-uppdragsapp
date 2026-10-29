import { chromium } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:3100'
const hostname = new URL(baseURL).hostname
if (!['localhost', '127.0.0.1'].includes(hostname) && !hostname.endsWith('.vercel.app') && hostname !== 'test.kyrkouppdrag.se') {
  throw new Error('Skärmbilder får bara tas på lokal app, test eller preview.')
}
const pages = {
  oversikt: 'Start', pass: 'Pass', 'mina-bokningar': 'Mina bokningar', notiser: 'Notiser', profil: 'Min profil',
  'mina-ansvar': 'Mina ansvar', personal: 'Personal', grupper: 'Grupper', utskick: 'Utskick',
  behorigheter: 'Behörigheter', exportera: 'Exportera', forsamlingar: 'Församlingar', pastorat: 'Pastorat', kiosk: 'Kiosk',
}
const roles = {
  ideell: { label: 'Ideell', pages: ['oversikt', 'pass', 'mina-bokningar', 'notiser', 'profil'] },
  anstalld: { label: 'Anställd', pages: ['oversikt', 'pass', 'personal', 'mina-ansvar', 'mina-bokningar', 'notiser', 'profil'] },
  fadmin: { label: 'Församlingsadmin', pages: ['oversikt', 'pass', 'personal', 'grupper', 'utskick', 'behorigheter', 'exportera', 'mina-bokningar', 'notiser', 'profil'] },
  padmin: { label: 'Pastoratsadmin', pages: ['oversikt', 'pass', 'personal', 'grupper', 'utskick', 'behorigheter', 'forsamlingar', 'exportera', 'mina-bokningar', 'notiser', 'profil'] },
  superadmin: { label: 'Superadmin', pages: ['oversikt', 'pastorat', 'pass', 'personal', 'grupper', 'utskick', 'behorigheter', 'forsamlingar', 'exportera', 'profil'] },
  kiosk: { label: 'Kiosk', pages: ['kiosk'] },
}
const output = path.resolve('docs/screenshots/demo')
await mkdir(output, { recursive: true })
const browser = await chromium.launch()
const manifest = []
const forbidden = []
const runtimeErrors = []
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' })
    await context.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.origin !== new URL(baseURL).origin || (url.pathname.startsWith('/api/') && url.pathname !== '/api/demo/auth')) {
        forbidden.push(`${route.request().method()} ${url.href}`)
        await route.abort()
      } else await route.continue()
    })
    const page = await context.newPage()
    page.on('pageerror', error => runtimeErrors.push(error.message))
    await page.goto(`${baseURL}/demo`)
    if (page.url().includes('/demo-login')) {
      await page.getByLabel('Lösenord', { exact: true }).fill(process.env.DEMO_PASSWORD ?? 'lokaltest')
      await page.getByRole('button', { name: 'Gå till demo' }).click()
    }
    await page.locator('.pick-row').first().waitFor()
    // Development controls are not part of the user guide. Runtime errors
    // are collected separately and make this capture fail instead of hiding defects.
    await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' })
    for (const [roleId, role] of Object.entries(roles)) {
      await page.getByRole('button', { name: new RegExp(`^${role.label},`) }).click()
      for (const pageId of role.pages) {
        const label = pages[pageId]
        if (pageId !== 'kiosk') {
          const matcher = new RegExp(`^${label}(?: \\(\\d+\\))?$`)
          if (viewport.width < 768) {
            const tabLabel = label === 'Mina bokningar' ? 'Bokningar' : label
            const tab = page.locator('.bottom-nav').getByRole('button', { name: new RegExp(`^${tabLabel}(?: \\(\\d+\\))?$`) })
            if (await tab.count()) await tab.click()
            else {
              await page.getByRole('button', { name: 'Mer', exact: true }).click()
              await page.getByRole('navigation', { name: 'Fler sidor' }).getByRole('button', { name: matcher }).click()
            }
          } else await page.locator('.sidebar-nav').getByRole('button', { name: matcher }).click()
        }
        await page.evaluate(() => document.fonts.ready)
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.locator('main').waitFor()
        const filename = `${roleId}-${pageId}-${viewport.width}.png`
        await page.screenshot({ path: path.join(output, filename), fullPage: false, animations: 'disabled' })
        manifest.push({ role: roleId, roleLabel: role.label, page: pageId, label, path: `docs/screenshots/demo/${filename}`, ...viewport })
        console.log(`${roleId} ${pageId} ${viewport.width}`)
      }
      await page.getByRole('button', { name: /Avsluta|Lämna kioskläget/ }).click()
      await page.locator('.pick-row').first().waitFor()
    }
    await context.close()
  }
  if (forbidden.length) throw new Error(`Oväntade nätanrop: ${forbidden.join(', ')}`)
  if (runtimeErrors.length) throw new Error(`Sidfel: ${runtimeErrors.join(', ')}`)
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`${manifest.length} kontrollerade skärmbilder sparade.`)
} finally { await browser.close() }

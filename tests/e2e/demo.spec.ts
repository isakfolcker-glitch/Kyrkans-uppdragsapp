import { test, expect, type Page } from '@playwright/test'

// Explicit expectations keep a menu regression from changing both the test and app.
const menus = {
  ideell: ['Start', 'Pass', 'Mina bokningar', 'Notiser', 'Min profil'],
  anstalld: ['Start', 'Pass', 'Personal', 'Mina ansvar', 'Mina bokningar', 'Notiser', 'Min profil'],
  fadmin: ['Start', 'Pass', 'Personal', 'Grupper', 'Utskick', 'Behörigheter', 'Exportera', 'Mina bokningar', 'Notiser', 'Min profil'],
  padmin: ['Start', 'Pass', 'Personal', 'Grupper', 'Utskick', 'Behörigheter', 'Församlingar', 'Exportera', 'Mina bokningar', 'Notiser', 'Min profil'],
  superadmin: ['Start', 'Pastorat', 'Pass', 'Personal', 'Grupper', 'Utskick', 'Behörigheter', 'Församlingar', 'Exportera', 'Min profil'],
  kiosk: ['Kiosk'],
}
type Role = keyof typeof menus
const roles: { id: Role; label: string }[] = [
  { id: 'ideell', label: 'Ideell' }, { id: 'anstalld', label: 'Anställd' },
  { id: 'fadmin', label: 'Församlingsadmin' }, { id: 'padmin', label: 'Pastoratsadmin' },
  { id: 'superadmin', label: 'Superadmin' }, { id: 'kiosk', label: 'Kiosk' },
]
const labelPattern = (label: string) => new RegExp(`^${label}(?: \\(\\d+\\))?$`)

async function openMenu(page: Page, label: string) {
  const mobile = (page.viewportSize()?.width ?? 1280) < 768
  if (mobile) {
    const tabLabel = label === 'Mina bokningar' ? 'Bokningar' : label
    const tab = page.locator('.bottom-nav').getByRole('button', { name: labelPattern(tabLabel) })
    if (await tab.count()) { await tab.click(); return }
    await page.getByRole('button', { name: 'Mer', exact: true }).click()
    await page.getByRole('navigation', { name: 'Fler sidor' }).getByRole('button', { name: labelPattern(label) }).click()
  } else {
    await page.locator('.sidebar-nav').getByRole('button', { name: labelPattern(label) }).click()
  }
}

async function visibleMenu(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) >= 768) {
    return page.locator('.sidebar-nav button').allTextContents()
  }
  const tabs = await page.locator('.bottom-nav button').allTextContents()
  await page.getByRole('button', { name: 'Mer', exact: true }).click()
  const more = await page.getByRole('navigation', { name: 'Fler sidor' }).getByRole('button').allTextContents()
  await page.getByRole('button', { name: 'Stäng', exact: true }).click()
  return [...tabs, ...more].map(label => label.trim() === 'Bokningar' ? 'Mina bokningar' : label)
}

test.beforeEach(async ({ page, context, baseURL }) => {
  // A representative stored Supabase session must not be consumed by /demo.
  // All credentials are fictional, and the network guard also blocks accidental writes.
  const fakeSession = { access_token: 'fake-demo-isolation-token', refresh_token: 'fake-refresh',
    expires_at: 4102444800, token_type: 'bearer', user: { id: '00000000-0000-0000-0000-000000000999', email: 'real-session@example.com' } }
  const encoded = `base64-${Buffer.from(JSON.stringify(fakeSession)).toString('base64url')}`
  await context.addCookies([{ name: 'sb-xfjizomwxcavkuvweqfx-auth-token', value: encoded, url: baseURL! },
    { name: 'sb-127-auth-token', value: encoded, url: baseURL! }])
  await context.addInitScript(session => {
    localStorage.setItem('sb-xfjizomwxcavkuvweqfx-auth-token', JSON.stringify(session))
  }, fakeSession)
  const forbidden: string[] = []
  const origin = new URL(baseURL!).origin
  await context.route('**/*', async route => {
    const url = new URL(route.request().url())
    const api = url.pathname === '/api' || url.pathname.startsWith('/api/')
    if (url.origin !== origin || (api && url.pathname !== '/api/demo/auth')) {
      forbidden.push(`${route.request().method()} ${url.href}`)
      await route.abort()
    } else await route.continue()
  })
  page.on('dialog', dialog => dialog.accept())
  await page.goto('/demo')
  if (page.url().includes('/demo-login')) {
    await page.getByLabel('Lösenord', { exact: true }).fill(process.env.DEMO_PASSWORD ?? 'lokaltest')
    await page.getByRole('button', { name: 'Gå till demo' }).click()
  }
  await expect(page.locator('.pick-row')).toHaveCount(6)
  // Attach to the test only after setup, then check again after every UI action.
  test.info().annotations.push({ type: 'session', description: 'Fiktiv befintlig Supabase-session, inga riktiga konton' })
  ;(page as Page & { demoForbidden: string[] }).demoForbidden = forbidden
})

test.afterEach(async ({ page }) => {
  expect((page as Page & { demoForbidden?: string[] }).demoForbidden ?? [], 'Demot får inte kontakta API eller Supabase').toEqual([])
})

for (const role of roles) {
  test(`demo ${role.id}: rätt meny, varje sida och ingen produktionskontakt`, async ({ page }) => {
    await page.getByRole('button', { name: new RegExp(`^${role.label},`) }).click()
    await expect(page.getByRole('region', { name: 'Demoläge' })).toBeVisible()
    if (role.id === 'kiosk') {
      await expect(page.getByRole('heading', { name: /Skriv upp dig/ })).toBeVisible()
      await expect(page.locator('.bottom-nav')).not.toBeVisible()
      await page.getByRole('button', { name: /^Anmäl mig/ }).first().click()
      await page.getByLabel(/^Namn/).fill('Testbesökare')
      await page.getByRole('dialog').getByRole('button', { name: /Anmäl/ }).click()
      await expect(page.getByRole('heading', { name: /du är anmäld/ })).toBeVisible()
      await page.getByRole('button', { name: 'Tillbaka till passen' }).click()
      await page.getByRole('button', { name: /Avsluta|Lämna kioskläget/ }).click()
      await expect(page.locator('.pick-row')).toHaveCount(6)
      return
    }
    const labels = (await visibleMenu(page)).map(label => label.trim().replace(/ \(\d+\)$/, '')).sort()
    expect(labels).toEqual([...menus[role.id]].sort())
    for (const label of menus[role.id]) {
      await openMenu(page, label)
      await expect(page.locator('main')).toBeVisible()
      if (label !== 'Start') await expect(page.locator('main h1')).toContainText(label === 'Exportera' ? /Exportera|Import/ : label)
      if (label === 'Mina ansvar') {
        await expect(page.locator('main .pass-card').first()).toBeVisible()
        await expect(page.getByText('Du är inte ansvarig för några pass')).toHaveCount(0)
      }
    }
    await expect(page.locator('main')).not.toContainText('@kyrkan.se')
  })
}

test('demo profil: tillgänglighet och notiser ändras lokalt, kontot skyddas', async ({ page }) => {
  await page.getByRole('button', { name: /^Ideell,/ }).click()
  await openMenu(page, 'Min profil')
  const availability = page.getByRole('button', { name: /^Tillgänglig/ })
  await expect(availability).toHaveAttribute('aria-pressed', 'true')
  await availability.click()
  await expect(page.getByRole('button', { name: /^Otillgänglig/ })).toHaveAttribute('aria-pressed', 'false')
  const notification = page.getByRole('switch').first()
  const previous = await notification.getAttribute('aria-checked')
  await notification.click()
  await expect(notification).toHaveAttribute('aria-checked', previous === 'true' ? 'false' : 'true')
  await page.getByRole('button', { name: 'Redigera uppgifter' }).click()
  await page.getByRole('button', { name: 'Spara', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Fungerar inte i demot' })).toBeVisible()
  await page.getByRole('button', { name: 'Avbryt', exact: true }).click()
  await page.getByRole('button', { name: 'Byt lösenord', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Fungerar inte i demot' })).toBeVisible()
  await page.getByRole('button', { name: 'Exportera', exact: true }).click()
  const pagesBeforePolicy = page.context().pages().length
  await expect(page.locator('a[href="/integritetspolicy"]')).toHaveCount(0)
  await page.getByRole('button', { name: /Läs integritetspolicyn/ }).click()
  await expect(page).toHaveURL(/\/demo$/)
  expect(page.context().pages()).toHaveLength(pagesBeforePolicy)
  await page.getByRole('button', { name: 'Radera', exact: true }).click()
  await page.getByRole('button', { name: 'Ja, radera mitt konto' }).click()
  await expect(page.getByText('Fungerar inte i demot').last()).toBeVisible()
  await expect(page).toHaveURL(/\/demo$/)
})

test('demo admin: grupp och utskick sparas lokalt utan mejl', async ({ page }) => {
  await page.getByRole('button', { name: /^Församlingsadmin,/ }).click()
  await openMenu(page, 'Grupper')
  await page.getByRole('button', { name: 'Ny grupp', exact: true }).click()
  await page.getByLabel('Gruppnamn').fill('Testgrupp lokalt')
  await page.getByRole('button', { name: 'Skapa', exact: true }).click()
  await expect(page.locator('.tag').filter({ hasText: /^Testgrupp lokalt$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Ta bort Testgrupp lokalt' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Ta bort', exact: true }).click()
  await expect(page.getByText('Testgrupp lokalt', { exact: true })).toHaveCount(0)
  await openMenu(page, 'Utskick')
  await page.getByRole('button', { name: 'Nytt utskick' }).click()
  await page.getByRole('checkbox', { name: /Alla i församlingen/ }).check()
  await page.getByLabel('Ämne', { exact: true }).fill('Demoutskick lokalt')
  await page.getByLabel('Meddelande', { exact: true }).fill('Det här meddelandet ska bara finnas lokalt.')
  await page.getByRole('dialog').getByRole('button', { name: /^Skicka till/ }).click()
  await expect(page.getByText('Demoutskick lokalt', { exact: true })).toBeVisible()
})

test('demo anställd: ansvar och behörigheter följer vald församling', async ({ page }) => {
  await page.getByRole('button', { name: /^Anställd,/ }).click()
  await openMenu(page, 'Mina ansvar')
  await expect(page.locator('main .pass-card').first()).toBeVisible()
  const mobile = (page.viewportSize()?.width ?? 1280) < 768
  if (mobile) await page.getByRole('button', { name: 'Mer', exact: true }).click()
  const select = page.getByLabel(mobile ? 'Byt församling' : 'Församling', { exact: true })
  await expect(select).toBeVisible()
  await select.selectOption({ label: 'Hovförsamlingen' })
  if (mobile) await page.getByRole('button', { name: 'Stäng', exact: true }).click()
  const labels = (await visibleMenu(page)).map(label => label.trim().replace(/ \(\d+\)$/, ''))
  expect(labels).not.toContain('Personal')
  expect(labels).not.toContain('Grupper')
  expect(labels).not.toContain('Utskick')
  await openMenu(page, 'Pass')
  await expect(page.getByRole('button', { name: /Nytt pass|Skapa pass/ })).toHaveCount(0)
})

test('demo superadmin: pastorat skapas, ändras och tas bort lokalt', async ({ page }) => {
  await page.getByRole('button', { name: /^Superadmin,/ }).click()
  await openMenu(page, 'Pastorat')
  await page.getByRole('button', { name: 'Nytt pastorat', exact: true }).click()
  await page.getByLabel('Namn på pastoratet').fill('Lokalt testpastorat')
  await page.getByRole('button', { name: 'Skapa pastorat' }).click()
  await expect(page.getByText('Lokalt testpastorat', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Redigera Lokalt testpastorat' }).click()
  await page.getByRole('dialog').getByLabel('Namn', { exact: true }).fill('Ändrat testpastorat')
  await page.getByRole('dialog').getByRole('button', { name: 'Spara', exact: true }).click()
  await expect(page.getByText('Ändrat testpastorat', { exact: true }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Ta bort Ändrat testpastorat' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Ta bort', exact: true }).click()
  await expect(page.getByText('Ändrat testpastorat', { exact: true })).toHaveCount(0)
})

test('demo pastoratsadmin: påminnelse, inbjudan och lösenord når inte servern', async ({ page }) => {
  await page.getByRole('button', { name: /^Pastoratsadmin,/ }).click()
  await openMenu(page, 'Pass')
  await page.getByRole('button', { name: 'Påminn', exact: true }).first().click()
  await openMenu(page, 'Personal')
  await page.getByRole('button', { name: 'Bjud in ideell', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Namn', { exact: true }).fill('Lokalt testkonto')
  await dialog.getByLabel('E-post', { exact: true }).fill('lokal-inbjudan@example.com')
  await dialog.getByRole('button', { name: 'Skicka inbjudan' }).click()
  await expect(dialog.getByRole('status')).toContainText('Inget mejl skickades')
  await dialog.getByRole('button', { name: 'Stäng', exact: true }).last().click()
  await expect(page.getByText('lokal-inbjudan@example.com', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Sätt lösenord för Lokalt testkonto' }).click()
  await dialog.getByRole('button', { name: 'Sätt lösenord', exact: true }).click()
  await expect(dialog.getByRole('alert').filter({ hasText: 'Fungerar inte i demot' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Avbryt' }).click()
})

test('demo behörigheter: anställds rättigheter kan sparas och läsas lokalt', async ({ page }) => {
  await page.getByRole('button', { name: /^Pastoratsadmin,/ }).click()
  await openMenu(page, 'Behörigheter')
  await page.getByRole('button', { name: 'Ändra behörighet för Johan Eriksson' }).click()
  const dialog = page.getByRole('dialog')
  const createPass = dialog.getByRole('checkbox', { name: /^Skapa pass/ })
  await expect(createPass).toBeChecked()
  await createPass.uncheck()
  await dialog.getByRole('button', { name: 'Spara', exact: true }).click()
  await page.getByRole('button', { name: 'Ändra behörighet för Johan Eriksson' }).click()
  await expect(dialog.getByRole('checkbox', { name: /^Skapa pass/ })).not.toBeChecked()
  await dialog.getByRole('button', { name: 'Avbryt' }).click()
})

test('demo pastoratsadmin: exportvalen håller sig inom pastoratet', async ({ page }) => {
  await page.getByRole('button', { name: /^Pastoratsadmin,/ }).click()
  await openMenu(page, 'Exportera')
  await expect(page.locator('.church-bar').getByRole('button', { name: 'Domkyrkan', exact: true })).toBeVisible()
  await expect(page.locator('.church-bar').getByRole('button', { name: 'Hovförsamlingen', exact: true })).toBeVisible()
  await expect(page.locator('.church-bar').getByRole('button', { name: 'Exempelförsamlingen', exact: true })).toHaveCount(0)
})

test('demo nytt pastorat: vald admin får rollen i nya församlingen, tidigare roll bevaras', async ({ page }) => {
  await page.getByRole('button', { name: /^Superadmin,/ }).click()
  await openMenu(page, 'Pastorat')
  await page.getByRole('button', { name: 'Nytt pastorat', exact: true }).click()
  await page.getByLabel('Namn på pastoratet').fill('Johans lokala pastorat')
  await page.getByLabel('Pastoratsadmin', { exact: true }).selectOption('2')
  await page.getByRole('checkbox', { name: 'Exempelförsamlingen', exact: true }).check()
  await page.getByRole('button', { name: 'Skapa pastorat' }).click()
  await expect(page.getByText('Johans lokala pastorat', { exact: true }).first()).toBeVisible()
  const mobile = (page.viewportSize()?.width ?? 1280) < 768
  const originalViewport = page.viewportSize()!
  // The kiosk has no mobile menu. Expand to the desktop menu while cycling
  // Superadmin -> kiosk -> Maria -> Johan, then verify the original viewport.
  if (mobile) await page.setViewportSize({ width: 1280, height: 800 })
  for (let index = 0; index < 3; index++) {
    await page.getByRole('button', { name: /^Byt testanvändare/ }).click()
  }
  if (mobile) await page.setViewportSize(originalViewport)
  let labels = (await visibleMenu(page)).map(label => label.trim().replace(/ \(\d+\)$/, ''))
  expect(labels).toContain('Mina ansvar')
  expect(labels).not.toContain('Behörigheter')
  if (mobile) await page.getByRole('button', { name: 'Mer', exact: true }).click()
  await page.getByLabel(mobile ? 'Byt församling' : 'Församling', { exact: true }).selectOption({ label: 'Exempelförsamlingen' })
  if (mobile) await page.getByRole('button', { name: 'Stäng', exact: true }).click()
  labels = (await visibleMenu(page)).map(label => label.trim().replace(/ \(\d+\)$/, ''))
  expect(labels).toContain('Behörigheter')
  expect(labels).toContain('Församlingar')
  expect(labels).not.toContain('Mina ansvar')
})

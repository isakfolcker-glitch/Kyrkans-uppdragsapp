import { test, expect } from '@playwright/test'

// Röktester: snabba kontroller att appen lever och att skydden fungerar.
// Utökas av testaren med inloggade flöden per behörighetsnivå.

test('oinloggad besökare skickas till inloggningen', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})

test('inloggningssidan visar ett formulär', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('input[type="email"]').first()).toBeVisible()
})

test('integritetspolicyn går att nå', async ({ page }) => {
  const res = await page.goto('/integritetspolicy')
  expect(res?.status()).toBeLessThan(400)
})

test('skyddade API:er kräver inloggning', async ({ request }) => {
  const res = await request.post('/api/people', { data: {} })
  expect(res.status()).toBe(401)
})

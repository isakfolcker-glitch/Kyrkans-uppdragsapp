import { defineConfig, devices } from '@playwright/test'

// Kör mot en preview- eller staging-URL:
//   PLAYWRIGHT_BASE_URL=https://test.kyrkouppdrag.se npm run test:e2e
// Utan variabeln startas appen lokalt (kräver .env.local som pekar på TESTDATABASEN).
// Kör ALDRIG mot https://www.kyrkouppdrag.se.
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

if (/(^|\.)kyrkouppdrag\.se/.test(new URL(baseURL).hostname) && !baseURL.includes('test.')) {
  throw new Error('E2E-tester får inte köras mot produktion. Använd test.kyrkouppdrag.se eller en preview-URL.')
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    extraHTTPHeaders: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
      ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET }
      : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobil', use: { ...devices['Pixel 7'] } },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
})

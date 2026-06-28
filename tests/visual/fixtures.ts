/* eslint-disable react-hooks/rules-of-hooks -- Playwright's `use` is the test.extend yield callback, not a React Hook. This file is a Playwright fixture, not React. */
import { test as base, expect, type Page } from '@playwright/test'
import { E2E_SEED_ENV } from '../../playwright.base.config'

// next-themes has enableSystem:false, so Playwright's `colorScheme` is IGNORED by the app — but the
// fixture reads it as the CARRIER for which theme to force via localStorage. buildVisualMatrix sets
// colorScheme per project; the app ignores it, the fixture honors it. (ARD 0030 / issue #42.)
async function prep(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript(
    (t: string) => {
      try {
        localStorage.setItem('opzava-ds-theme', t)                       // opzava-ds shell (.opzava-ds)
        localStorage.setItem('theme', t === 'light' ? 'light' : 'void')  // next-themes (/login etc.)
      } catch {
        /* storage unavailable */
      }
    },
    theme,
  )
  await page.addInitScript(() => {
    const style = document.createElement('style')
    style.textContent =
      '*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;}'
    document.documentElement.appendChild(style)
  })
}

const themeFrom = (
  cs: 'dark' | 'light' | 'no-preference' | null | undefined,
): 'dark' | 'light' => (cs === 'light' ? 'light' : 'dark')

/** `vrPage` — anonymous, theme-forced + animations off (unauthenticated surfaces, e.g. /login).
 *  `authPage` — vrPage + admin login (the seeded `testadmin`), waiting for the `.opzava-ds` shell. */
export const test = base.extend<{ vrPage: Page; authPage: Page }>({
  vrPage: async ({ page, colorScheme }, use) => {
    await prep(page, themeFrom(colorScheme))
    await use(page)
  },
  authPage: async ({ page, colorScheme }, use) => {
    await prep(page, themeFrom(colorScheme))
    await page.goto('/login')
    await page.fill('#username', E2E_SEED_ENV.AUTH_USER)
    await page.fill('#password', E2E_SEED_ENV.AUTH_PASS)
    await page.click('button[type=submit]')
    await page.waitForSelector('.opzava-ds', { state: 'visible', timeout: 30_000 })
    await use(page)
  },
})

export { expect }

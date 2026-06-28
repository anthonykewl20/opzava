/* eslint-disable react-hooks/rules-of-hooks -- Playwright's `use` is the test.extend yield callback, not a React Hook. This file is a Playwright fixture, not React. */
import { test as base, expect, type Page } from '@playwright/test'

const AUTH_STATE_PATH = 'tests/visual/.auth/user.json'

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

async function dismissOnboarding(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('mc-onboarding-dismissed', '1')
      sessionStorage.removeItem('mc-onboarding-replay')
    } catch {
      /* storage unavailable */
    }
  })
}

/** `vrPage` — anonymous, theme-forced + animations off (unauthenticated surfaces, e.g. /login).
 *  `authPage` — fresh context restored from globalSetup's single API login, waiting for the `.opzava-ds` shell. */
export const test = base.extend<{ vrPage: Page; authPage: Page }>({
  vrPage: async ({ page, colorScheme }, use) => {
    await prep(page, themeFrom(colorScheme))
    await use(page)
  },
  authPage: async ({ browser, colorScheme }, use) => {
    const context = await browser.newContext({
      storageState: AUTH_STATE_PATH,
      colorScheme,
    })
    const page = await context.newPage()
    await prep(page, themeFrom(colorScheme))
    await dismissOnboarding(page)
    try {
      await page.goto('/')
      await page.waitForSelector('.opzava-ds', { state: 'visible', timeout: 30_000 })
      await use(page)
    } finally {
      await context.close()
    }
  },
})

export { expect }

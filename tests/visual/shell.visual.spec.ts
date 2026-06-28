import { test, expect } from './fixtures'

test('authenticated shell — opzava-ds visual contract', async ({ authPage }) => {
  // authPage is already at / (post-login). Wait for the redesigned shell frame + theme to settle.
  await expect(authPage.locator('.opzava-ds')).toBeVisible()
  // Mask conditional/live regions that aren't seed-deterministic: the status banners
  // (LocalModeBanner, OpenClawDoctorBanner, UpdateBanner — role="alert") and the SSE LiveFeed.
  await expect(authPage).toHaveScreenshot('shell.png', {
    mask: [
      authPage.locator('[role="alert"]'),
      authPage.locator('[data-live-feed], .live-feed'),
    ],
  })
})

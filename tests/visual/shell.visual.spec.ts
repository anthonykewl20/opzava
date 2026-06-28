import { appChromeMasks, test, expect, VISUAL_MAX_DIFF_PIXEL_RATIO } from './fixtures'

test('authenticated shell — opzava-ds visual contract', async ({ authPage }) => {
  // authPage is already at / (post-login). Wait for the redesigned shell frame + theme to settle.
  await expect(authPage.locator('.opzava-ds')).toBeVisible()
  // Mask conditional/live regions that aren't seed-deterministic: the status banners
  // (LocalModeBanner, OpenClawDoctorBanner, UpdateBanner — role="alert") and the SSE LiveFeed.
  await expect(authPage).toHaveScreenshot('shell.png', {
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
    mask: appChromeMasks(authPage),
  })
})

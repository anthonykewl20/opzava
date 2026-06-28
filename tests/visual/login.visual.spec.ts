import { test, expect, VISUAL_MAX_DIFF_PIXEL_RATIO } from './fixtures'

test('/login renders the Tier-1 visual contract', async ({ vrPage }) => {
  await vrPage.goto('/login')
  await expect(vrPage).toHaveScreenshot('login.png', {
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
  })
})

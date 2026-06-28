import { appChromeMasks, test, expect, VISUAL_MAX_DIFF_PIXEL_RATIO } from './fixtures'

test('/chat renders the static Messages panel visual contract', async ({ authPage }) => {
  await authPage.goto('/chat')
  await expect(authPage.locator('.opzava-ds')).toBeVisible()
  await expect(authPage.locator('.msg-page')).toBeVisible()
  await expect(authPage.getByRole('log', { name: 'Message history' })).toBeVisible()
  await expect(authPage).toHaveScreenshot('chat.png', {
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
    mask: appChromeMasks(authPage),
  })
})

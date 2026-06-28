import { test, expect } from './fixtures'

test('/chat renders the static Messages panel visual contract', async ({ authPage }) => {
  await authPage.goto('/chat')
  await expect(authPage.locator('.opzava-ds')).toBeVisible()
  await expect(authPage.getByRole('textbox', { name: 'Message #q2-content-push' })).toBeVisible()
  await expect(authPage).toHaveScreenshot('chat.png', {
    mask: [
      authPage.locator('[role="alert"]'),
      authPage.locator('[data-live-feed], .live-feed'),
    ],
  })
})

import { test, expect, VISUAL_MAX_DIFF_PIXEL_RATIO } from './fixtures'

test('/setup renders the first-run admin visual contract', async ({ vrPage }) => {
  await vrPage.route('**/api/setup', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ needsSetup: true }),
    })
  })

  await vrPage.goto('/setup')
  await expect(vrPage.getByRole('heading', { name: 'Welcome to Opzava' })).toBeVisible()
  await expect(vrPage.locator('#username')).toHaveValue('admin')
  await expect(vrPage).toHaveScreenshot('setup.png', {
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
    mask: [
      vrPage.locator('[role="alert"]'),
    ],
  })
})

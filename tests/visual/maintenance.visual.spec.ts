import { appChromeMasks, test, expect, VISUAL_MAX_DIFF_PIXEL_RATIO } from './fixtures'

test('/maintenance renders the static Maintenance panel visual contract', async ({ authPage }) => {
  await authPage.route('**/api/status**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/api/status' || url.searchParams.get('action') !== 'capabilities') {
      await route.continue()
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ gateway: false, interfaceMode: 'full' }),
    })
  })
  await authPage.goto('/maintenance')
  await expect(authPage.locator('.opzava-ds')).toBeVisible()
  await expect(authPage.getByRole('heading', { name: 'Maintenance' })).toBeVisible()
  await expect(authPage).toHaveScreenshot('maintenance.png', {
    maxDiffPixelRatio: VISUAL_MAX_DIFF_PIXEL_RATIO,
    mask: appChromeMasks(authPage),
  })
})

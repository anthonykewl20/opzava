import { test, expect } from './fixtures'

test('/alerts renders the empty Alert Rules panel visual contract', async ({ authPage }) => {
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
  await authPage.evaluate(() => {
    localStorage.setItem('mc-interface-mode', 'full')
  })
  await authPage.goto('/alerts')
  await expect(authPage.locator('.opzava-ds')).toBeVisible()
  await expect(authPage.getByRole('heading', { name: 'Alert Rules' })).toBeVisible()
  await expect(authPage.getByText('No alert rules configured')).toBeVisible()
  await expect(authPage).toHaveScreenshot('alerts.png', {
    mask: [
      authPage.locator('[role="alert"]'),
      authPage.locator('[data-live-feed], .live-feed'),
    ],
  })
})

import { test, expect } from './fixtures'

test('/login renders the Tier-1 visual contract', async ({ vrPage }) => {
  await vrPage.goto('/login')
  await expect(vrPage).toHaveScreenshot('login.png')
})

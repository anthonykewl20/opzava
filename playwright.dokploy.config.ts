import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  testIgnore: /openclaw-harness\.spec\.ts/,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL:
      process.env.E2E_BASE_URL ||
      `http://${process.env.DOKPLOY_LOCAL_DOMAIN || 'opzava.localhost'}:${process.env.DOKPLOY_HTTP_PORT || '3080'}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(process.env.E2E_USE_CHROME ? { channel: 'chrome' } : {}) } },
  ],
  // Intentionally no webServer. Dokploy-parity tests must target the
  // production Docker stack started by scripts/dokploy-parity-test.sh.
})

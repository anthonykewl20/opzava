import { request, type FullConfig } from '@playwright/test'
import { E2E_SEED_ENV } from '../../playwright.base.config'

/**
 * Visual Regression global setup.
 *
 * The app DB is wiped fresh each run by `scripts/e2e-openclaw/start-e2e-server.mjs`, so seeding is
 * idempotent (no upsert). Slice 1 needs the `testadmin` user to exist so `authPage` can log in
 * against the shell — create it (201 created or 409 already-exists are both fine). The empty
 * Dashboard that results is itself deterministic, so no further seed is required for v1.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:3005'
  const ctx = await request.newContext({
    baseURL,
    extraHTTPHeaders: {
      'x-api-key': E2E_SEED_ENV.API_KEY,
      'Content-Type': 'application/json',
    },
  })
  try {
    const res = await ctx.post('/api/auth/users', {
      data: {
        username: E2E_SEED_ENV.AUTH_USER,
        password: E2E_SEED_ENV.AUTH_PASS,
        display_name: 'VR Admin',
        role: 'admin',
      },
    })
    if (res.status() !== 201 && res.status() !== 409) {
      throw new Error(
        `VR globalSetup: could not ensure admin user (POST /api/auth/users → ${res.status()})`,
      )
    }
  } finally {
    await ctx.dispose()
  }
}

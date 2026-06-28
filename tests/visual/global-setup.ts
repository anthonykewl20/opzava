import { mkdir } from 'node:fs/promises'
import { request, type FullConfig } from '@playwright/test'
import { E2E_SEED_ENV } from '../../playwright.base.config'

const AUTH_STATE_PATH = 'tests/visual/.auth/user.json'

/**
 * Visual Regression global setup.
 *
 * The app DB is wiped fresh each run by `scripts/e2e-openclaw/start-e2e-server.mjs`, so seeding is
 * idempotent (no upsert). Visual auth uses one API login here, then `authPage` restores the saved
 * storage state for each spec so the run never trips the interactive login rate limiter.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:3005'
  const adminCtx = await request.newContext({
    baseURL,
    extraHTTPHeaders: {
      'x-api-key': E2E_SEED_ENV.API_KEY,
      'Content-Type': 'application/json',
    },
  })
  try {
    const res = await adminCtx.post('/api/auth/users', {
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
    await adminCtx.dispose()
  }

  const authCtx = await request.newContext({ baseURL })
  try {
    const loginRes = await authCtx.post('/api/auth/login', {
      data: {
        username: E2E_SEED_ENV.AUTH_USER,
        password: E2E_SEED_ENV.AUTH_PASS,
      },
      headers: { 'x-forwarded-for': '10.88.88.1' },
    })
    if (loginRes.status() !== 200) {
      throw new Error(
        `VR globalSetup: could not create auth storage state (POST /api/auth/login → ${loginRes.status()})`,
      )
    }

    await mkdir('tests/visual/.auth', { recursive: true })
    await authCtx.storageState({ path: AUTH_STATE_PATH })
  } finally {
    await authCtx.dispose()
  }
}

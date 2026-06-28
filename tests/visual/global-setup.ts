import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { request, type APIRequestContext, type FullConfig } from '@playwright/test'
import { E2E_SEED_ENV } from '../../playwright.base.config'

const AUTH_STATE_PATH = 'tests/visual/.auth/user.json'
const SESSION_COOKIE_NAMES = new Set(['mc-session', '__Host-mc-session'])
const REQUEST_TIMEOUT_MS = 10_000
const RETRY_BACKOFF_MS = [250, 500, 1_000, 2_000]

type StorageState = Awaited<ReturnType<APIRequestContext['storageState']>>

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function postWithRetry({
  context,
  path,
  data,
  headers,
  acceptedStatuses,
  label,
}: {
  context: APIRequestContext
  path: string
  data: Record<string, unknown>
  headers?: Record<string, string>
  acceptedStatuses: readonly number[]
  label: string
}): Promise<void> {
  let lastError: unknown
  const maxAttempts = RETRY_BACKOFF_MS.length + 1
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await context.post(path, {
        data,
        headers,
        timeout: REQUEST_TIMEOUT_MS,
      })
      const status = res.status()
      if (acceptedStatuses.includes(status)) return
      lastError = new Error(`${label} returned HTTP ${status}`)
    } catch (error) {
      lastError = error
    }

    if (attempt < RETRY_BACKOFF_MS.length) {
      await delay(RETRY_BACKOFF_MS[attempt])
    }
  }

  throw new Error(
    `VR globalSetup: ${label} failed after ${maxAttempts} attempts: ${describeError(lastError)}`,
  )
}

function assertHasSessionCookie(state: StorageState, source: string): void {
  const hasSessionCookie = state.cookies.some(
    (cookie) => SESSION_COOKIE_NAMES.has(cookie.name) && cookie.value.length > 0,
  )
  if (!hasSessionCookie) {
    throw new Error(`VR globalSetup: auth storage state from ${source} does not contain a session cookie`)
  }
}

async function writeStorageStateAtomically(context: APIRequestContext): Promise<void> {
  const state = await context.storageState()
  assertHasSessionCookie(state, 'login response')

  await mkdir(dirname(AUTH_STATE_PATH), { recursive: true })
  const tempPath = `${AUTH_STATE_PATH}.${process.pid}.${Date.now()}.tmp`
  try {
    await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(tempPath, AUTH_STATE_PATH)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {})
    throw error
  }

  const savedState = JSON.parse(await readFile(AUTH_STATE_PATH, 'utf8')) as StorageState
  assertHasSessionCookie(savedState, AUTH_STATE_PATH)
}

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
    await postWithRetry({
      context: adminCtx,
      path: '/api/auth/users',
      acceptedStatuses: [201, 409],
      data: {
        username: E2E_SEED_ENV.AUTH_USER,
        password: E2E_SEED_ENV.AUTH_PASS,
        display_name: 'VR Admin',
        role: 'admin',
      },
      label: 'could not ensure admin user (POST /api/auth/users)',
    })
  } finally {
    await adminCtx.dispose()
  }

  const authCtx = await request.newContext({ baseURL })
  try {
    await postWithRetry({
      context: authCtx,
      path: '/api/auth/login',
      acceptedStatuses: [200],
      data: {
        username: E2E_SEED_ENV.AUTH_USER,
        password: E2E_SEED_ENV.AUTH_PASS,
      },
      headers: { 'x-forwarded-for': '10.88.88.1' },
      label: 'could not create auth storage state (POST /api/auth/login)',
    })

    await writeStorageStateAtomically(authCtx)
  } finally {
    await authCtx.dispose()
  }
}

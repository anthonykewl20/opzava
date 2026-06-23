import { test, expect, type Page } from '@playwright/test'

/**
 * User-level E2E — a human operator opens a task card and sees the fields a
 * CLI/MCP agent wrote (evidence, blockers) plus the agent-attributed comment
 * (author_type + source badge). Drives the real browser against the live app.
 */

const API_KEY = process.env.API_KEY || 'test-api-key-e2e-12345'
const PASS = 'testpass1234!'
const USER = `attr-ui-${Date.now()}`
const SOURCE = 'Claude Code'
const EVIDENCE = 'EVIDENCE-UI-MARK: PR #777 merged, CI green'
const BLOCKERS = 'BLOCKERS-UI-MARK: waiting on infra'
const COMMENT = 'AGENT-COMMENT-UI-MARK: completed via MCP'

let taskId: number

test.beforeAll(async ({ request }) => {
  const create = await request.post('/api/auth/users', {
    data: { username: USER, password: PASS, display_name: 'Attr UI', role: 'admin' },
    headers: { 'x-api-key': API_KEY },
  })
  expect([201, 409]).toContain(create.status())

  const t = await request.post('/api/tasks', {
    data: { title: 'Attribution UI task' },
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  })
  taskId = (await t.json()).task.id

  // Agent writes evidence + blockers to the card.
  const put = await request.put(`/api/tasks/${taskId}`, {
    data: { evidence: EVIDENCE, blockers: BLOCKERS },
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  })
  expect(put.ok()).toBeTruthy()

  // Agent posts an attributed comment (author_type=agent, source=<client>).
  const c = await request.post(`/api/tasks/${taskId}/comments`, {
    data: { content: COMMENT, author_type: 'agent', source: SOURCE },
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' },
  })
  expect(c.ok()).toBeTruthy()
})

async function login(page: Page) {
  // Authenticate via the API (page.request shares the context cookie jar), then
  // re-add the session as SameSite=Lax so it's sent on the first top-level
  // navigation. (We're testing the task card render, not the login form / cookie
  // policy.) The server sets it SameSite=Strict, which Chrome withholds on a
  // script-initiated first navigation from about:blank.
  // loginLimiter is 5/min/IP and security-critical (so NOT bypassed by
  // MC_DISABLE_RATE_LIMIT). Earlier specs share this window/IP — rate-limiting.spec.ts
  // deliberately saturates it — so a legitimate login here can transiently 429 until
  // the fixed 60s window rolls over. Retry past it (the window always clears).
  let res = await page.request.post('/api/auth/login', { data: { username: USER, password: PASS } })
  const loginDeadline = Date.now() + 75_000
  while (res.status() === 429 && Date.now() < loginDeadline) {
    await page.waitForTimeout(3_000)
    res = await page.request.post('/api/auth/login', { data: { username: USER, password: PASS } })
  }
  expect(res.status(), await res.text()).toBe(200)
  const sess = (await page.context().cookies()).find((c) => c.name === 'mc-session')
  expect(sess, 'no mc-session cookie after login').toBeTruthy()
  await page.context().addCookies([
    { name: 'mc-session', value: sess!.value, domain: '127.0.0.1', path: '/', httpOnly: true, sameSite: 'Lax' },
  ])
}

test('operator sees agent-written evidence/blockers and the attributed comment', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  await login(page)

  // Deep-link to the task detail modal. (Don't wait for networkidle — the app
  // holds a persistent SSE/live-feed connection, so the network never goes idle.)
  await page.goto(`/tasks?taskId=${taskId}`, { waitUntil: 'domcontentloaded' })
  expect(page.url(), 'redirected to login — not authenticated').not.toMatch(/\/login/)

  // First run shows a "Welcome" onboarding overlay that makes the app inert — dismiss it.
  await page.getByRole('button', { name: /skip setup/i }).click({ timeout: 15000 }).catch(() => {})

  // Modal open → its title is the task title.
  await expect(page.getByText('Attribution UI task').first()).toBeVisible({ timeout: 30000 })

  // Details tab (default): evidence + blockers the agent wrote.
  await expect(page.getByText('Evidence', { exact: true })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText(EVIDENCE)).toBeVisible()
  await expect(page.getByText('Blockers', { exact: true })).toBeVisible()
  await expect(page.getByText(BLOCKERS)).toBeVisible()

  // Comments tab: the attributed comment + its source badge.
  await page.getByRole('tab', { name: /comment/i }).click()
  await expect(page.getByText(COMMENT)).toBeVisible()
  await expect(page.getByText(SOURCE, { exact: false }).first()).toBeVisible()

  // No uncaught runtime errors while rendering the card.
  expect(pageErrors, pageErrors.join('\n')).toHaveLength(0)

  await page.screenshot({ path: 'test-results/task-attribution-card.png', fullPage: true })
})

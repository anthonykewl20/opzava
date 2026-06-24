import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const requireRoleMock = vi.fn()
const validateBodyMock = vi.fn()
const prepareMock = vi.fn()

vi.mock('@/lib/auth', () => ({ requireRole: requireRoleMock }))
vi.mock('@/lib/rate-limit', () => ({ mutationLimiter: vi.fn(() => null) }))
vi.mock('@/lib/validation', () => ({
  validateBody: validateBodyMock,
  qualityReviewSchema: {},
}))
vi.mock('@/lib/event-bus', () => ({ eventBus: { broadcast: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('@/lib/task-completion-comment', () => ({
  appendTaskCompletionComment: vi.fn(),
  appendAttributedComment: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  getDatabase: vi.fn(() => ({ prepare: prepareMock })),
  db_helpers: { logActivity: vi.fn() },
}))

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/quality-review', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/quality-review reviewer resolution', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    validateBodyMock.mockResolvedValue({
      data: { taskId: 42, status: 'approved', notes: 'LGTM' },
    })
  })

  it('resolves reviewer from the authenticated user, ignoring any body reviewer', async () => {
    requireRoleMock.mockReturnValue({
      user: { username: 'qa-alice', display_name: 'Alice QA', role: 'operator', workspace_id: 1 },
    })
    // Body attempts to spoof the reviewer as 'aegis'.
    validateBodyMock.mockResolvedValue({
      data: { taskId: 42, reviewer: 'aegis', status: 'approved', notes: 'LGTM' },
    })

    const getMock = vi.fn(() => ({ id: 42, title: 'Do thing', assigned_to: 'someone-else' }))
    const runMock = vi.fn((..._args: unknown[]) => ({ lastInsertRowid: 99 }))
    prepareMock.mockImplementation((sql: string) => {
      if (/SELECT id, title/.test(sql)) return { get: getMock }
      return { run: runMock }
    })

    const { POST } = await import('@/app/api/quality-review/route')
    const response = await POST(postRequest({ taskId: 42, reviewer: 'aegis', status: 'approved', notes: 'LGTM' }))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json).toEqual({ success: true, id: 99 })

    // The recorded reviewer MUST be the authenticated user, not 'aegis'.
    const insertCall = runMock.mock.calls.find(([, reviewer]) => reviewer === 'qa-alice')
    expect(insertCall).toBeDefined()
    const aegisCall = runMock.mock.calls.find(([, reviewer]) => reviewer === 'aegis')
    expect(aegisCall).toBeUndefined()
  })

  it('403s when the authenticated user is the task assignee (self-review)', async () => {
    requireRoleMock.mockReturnValue({
      user: { username: 'qa-alice', display_name: 'Alice QA', role: 'operator', workspace_id: 1 },
    })

    const getMock = vi.fn(() => ({ id: 42, title: 'Do thing', assigned_to: 'qa-alice' }))
    const runMock = vi.fn()
    prepareMock.mockImplementation((sql: string) => {
      if (/SELECT id, title/.test(sql)) return { get: getMock }
      return { run: runMock }
    })

    const { POST } = await import('@/app/api/quality-review/route')
    const response = await POST(postRequest({ taskId: 42, reviewer: 'aegis', status: 'approved', notes: 'LGTM' }))

    expect(response.status).toBe(403)
    const json = await response.json()
    expect(json.error).toMatch(/self.review/i)

    // No review row inserted, no activity logged.
    expect(runMock).not.toHaveBeenCalled()
  })

  it('403s on self-review via display_name match too', async () => {
    requireRoleMock.mockReturnValue({
      user: { username: 'agent:coder-bot', display_name: 'coder-bot', role: 'operator', workspace_id: 1 },
    })

    const getMock = vi.fn(() => ({ id: 42, title: 'Do thing', assigned_to: 'coder-bot' }))
    const runMock = vi.fn()
    prepareMock.mockImplementation((sql: string) => {
      if (/SELECT id, title/.test(sql)) return { get: getMock }
      return { run: runMock }
    })

    const { POST } = await import('@/app/api/quality-review/route')
    const response = await POST(postRequest({ taskId: 42, status: 'approved', notes: 'LGTM' }))

    expect(response.status).toBe(403)
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * SEC-6 route-level: PUT /api/v1/runs/:run_id/eval must map self-scoring to 403
 * and resolve the caller's agent identities server-side. attachEval owns the
 * guard; the route forwards the identity set and translates EvalSelfScoringError.
 */

const { requireRoleMock, attachEvalMock, EvalSelfScoringError } = vi.hoisted(() => {
  class EvalSelfScoringError extends Error {
    constructor(runId: string, agentId: string) {
      super(`Self-scoring is not permitted: caller originated run ${runId} (agent ${agentId})`)
      this.name = 'EvalSelfScoringError'
    }
  }
  return {
    requireRoleMock: vi.fn(),
    attachEvalMock: vi.fn(),
    EvalSelfScoringError,
  }
})

vi.mock('@/lib/auth', () => ({ requireRole: requireRoleMock }))
vi.mock('@/lib/runs', () => ({
  attachEval: attachEvalMock,
  EvalSelfScoringError,
}))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))

import { PUT } from './route'

function putRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/runs/run-1/eval', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const PARAMS = async () => ({ run_id: 'run-1' })

describe('PUT /api/v1/runs/:run_id/eval — SEC-6 self-scoring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 when the caller originated the run (self-scoring)', async () => {
    requireRoleMock.mockReturnValue({
      user: {
        id: -1,
        username: 'agent:alpha',
        display_name: 'alpha',
        role: 'operator',
        workspace_id: 1,
        agent_id: 7,
        agent_name: 'alpha',
      },
    })
    attachEvalMock.mockImplementation(() => {
      throw new EvalSelfScoringError('run-1', 'alpha')
    })

    const res = await PUT(putRequest({ pass: true, score: 0.9 }), { params: PARAMS() })

    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toMatch(/Self-scoring is not permitted/)
  })

  it('forwards the caller identity set and succeeds for a different agent', async () => {
    requireRoleMock.mockReturnValue({
      user: {
        id: -2,
        username: 'agent:beta',
        display_name: 'beta',
        role: 'operator',
        workspace_id: 1,
        agent_id: 8,
        agent_name: 'beta',
      },
    })
    const updatedRun = { id: 'run-1', status: 'completed' }
    attachEvalMock.mockReturnValue(updatedRun)

    const res = await PUT(putRequest({ pass: true, score: 0.9 }), { params: PARAMS() })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(updatedRun)

    // The route resolved the caller identities server-side and forwarded them.
    expect(attachEvalMock).toHaveBeenCalledTimes(1)
    const forwardedIdentities = attachEvalMock.mock.calls[0][3] as Set<string>
    expect(forwardedIdentities).toBeInstanceOf(Set)
    expect(forwardedIdentities.has('beta')).toBe(true)
    expect(forwardedIdentities.has('alpha')).toBe(false)
  })

  it('does not forward a caller identity set for human operators (no agent_id)', async () => {
    requireRoleMock.mockReturnValue({
      user: { id: 5, username: 'ops-human', display_name: 'Human', role: 'operator', workspace_id: 1 },
    })
    attachEvalMock.mockReturnValue({ id: 'run-1', status: 'completed' })

    const res = await PUT(putRequest({ pass: true, score: 0.9 }), { params: PARAMS() })

    expect(res.status).toBe(200)
    expect(attachEvalMock.mock.calls[0][3]).toBeUndefined()
  })
})

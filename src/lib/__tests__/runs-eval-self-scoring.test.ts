import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SEC-6: PUT /api/v1/runs/:run_id/eval must reject self-scoring — an agent
 * (via its agent-scoped API key) must not attach an eval result to a run it
 * itself originated. Cross-agent scoring must still succeed.
 *
 * attachEval is the data-layer seam that owns the guard (see runs.ts:251-279).
 * The route resolves the caller's identities server-side and forwards them.
 */

const { mockGet, mockRun, broadcastMock } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockRun: vi.fn(() => ({ changes: 1 })),
  broadcastMock: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDatabase: () => ({ prepare: () => ({ get: mockGet, run: mockRun }) }),
}))

vi.mock('@/lib/event-bus', () => ({
  eventBus: { broadcast: broadcastMock },
}))

import { attachEval, EvalSelfScoringError } from '@/lib/runs'

/** A minimal runs-table row sufficient for rowToAgentRun hydration. */
function runRow(agentId: string, agentName: string | null): Record<string, unknown> {
  return {
    id: 'run-1',
    agent_id: agentId,
    agent_name: agentName,
    model: null,
    provider: null,
    runtime: 'opzava',
    runtime_version: null,
    trigger_type: 'manual',
    parent_run_id: null,
    task_id: null,
    status: 'completed',
    outcome: 'success',
    started_at: '2026-01-01T00:00:00.000Z',
    ended_at: null,
    duration_ms: null,
    steps: '[]',
    tools_available: '[]',
    cost_input_tokens: 0,
    cost_output_tokens: 0,
    cost_cache_read_tokens: null,
    cost_cache_write_tokens: null,
    cost_usd: null,
    cost_model: null,
    run_hash: 'h',
    parent_run_hash: null,
    lineage: '[]',
    model_version: null,
    config_hash: null,
    provenance_runtime: null,
    signed_by: null,
    signature: null,
    provenance_created_at: null,
    eval_task_type: null,
    eval_layer: null,
    eval_pass: null,
    eval_score: null,
    eval_detail: null,
    eval_metrics: null,
    eval_benchmark_id: null,
    error: null,
    git_branch: null,
    git_commit: null,
    workspace_id: 1,
    tags: '[]',
    metadata: '{}',
  }
}

const evalPayload = { pass: true, score: 0.95 }

describe('attachEval — SEC-6 self-scoring guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects self-scoring when the caller originated the run (matched by agent_id string)', () => {
    // Run was originated by agent "alpha" (agent_id string == "alpha").
    mockGet.mockReturnValue(runRow('alpha', 'alpha'))

    const callerIdentities = new Set(['alpha'])

    expect(() =>
      attachEval('run-1', evalPayload, 1, callerIdentities),
    ).toThrow(EvalSelfScoringError)

    // The guard must run before any mutation.
    expect(mockRun).not.toHaveBeenCalled()
    expect(broadcastMock).not.toHaveBeenCalled()
  })

  it('rejects self-scoring when the run matches the caller by agent_name', () => {
    // agent_id is an opaque hash but agent_name reveals the originator.
    mockGet.mockReturnValue(runRow('a1b2c3', 'alpha'))

    const callerIdentities = new Set(['alpha'])

    expect(() =>
      attachEval('run-1', evalPayload, 1, callerIdentities),
    ).toThrow(EvalSelfScoringError)

    expect(mockRun).not.toHaveBeenCalled()
  })

  it('allows cross-agent scoring and performs the update', () => {
    // Run originated by "alpha"; caller is a different agent ("beta").
    mockGet.mockReturnValue(runRow('alpha', 'alpha'))

    const callerIdentities = new Set(['beta'])

    const updated = attachEval('run-1', evalPayload, 1, callerIdentities)

    expect(mockRun).toHaveBeenCalledTimes(1) // the UPDATE fired
    expect(updated).not.toBeNull()
    expect(updated?.id).toBe('run-1')
    expect(broadcastMock).toHaveBeenCalledWith('run.eval_attached', expect.any(Object))
  })

  it('skips the guard entirely when no caller identities are supplied (human operator)', () => {
    // A human operator (no agent-scoped key) passes no identity set; existing
    // operator-driven scoring must keep working unchanged.
    mockGet.mockReturnValue(runRow('alpha', 'alpha'))

    const updated = attachEval('run-1', evalPayload, 1)

    expect(mockRun).toHaveBeenCalledTimes(1)
    expect(updated).not.toBeNull()
  })

  it('returns null for an unknown run without throwing', () => {
    mockGet.mockReturnValue(undefined)

    expect(attachEval('run-missing', evalPayload, 1, new Set(['alpha']))).toBeNull()
    expect(mockRun).not.toHaveBeenCalled()
  })
})

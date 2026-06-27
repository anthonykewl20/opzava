import { describe, expect, it, vi } from 'vitest'

import type { Attempt, Job } from '@/opzava/platform/runner/contracts'
import type { DecomposeAndExecuteOutcome } from './decompose-and-execute'
import {
  DECOMPOSE_CARD_JOB_KIND,
  makeDecompositionExecutor,
  type DecompositionNotice,
} from './decompose-card-job'

const attempt = {} as Attempt
const signal = new AbortController().signal

function job(): Job {
  return {
    schemaVersion: 1,
    jobId: 'job-1',
    workflowRunId: 'run_act-1',
    stepRunId: null,
    status: 'leased',
    idempotencyKey: 'decompose-card:42',
    payload: { kind: DECOMPOSE_CARD_JOB_KIND, cardId: 42, workspaceId: 1, conversationId: 'coord:admin:opzava', runId: 'run_act-1' },
    priority: 50,
    scheduledAt: 't',
    lease: null,
    attemptCount: 1,
    maxAttempts: 3,
  } as Job
}

function harness(outcome: DecomposeAndExecuteOutcome, cardPresent = true) {
  const notices: DecompositionNotice[] = []
  const executor = makeDecompositionExecutor({
    loadCard: (id) => (cardPresent && id === 42 ? { title: 'Series B', description: null } : null),
    decompose: vi.fn(async () => outcome),
    notify: (n) => notices.push(n),
  })
  return { executor, notices }
}

describe('makeDecompositionExecutor (decompose-card drain)', () => {
  it('posts a success notice when the graph executes successfully', async () => {
    const { executor, notices } = harness({ kind: 'executed', status: 'succeeded', graphId: 5 })
    await executor.execute(job(), attempt, signal)
    expect(notices).toHaveLength(1)
    expect(notices[0]).toMatchObject({ conversationId: 'coord:admin:opzava', runId: 'run_act-1', kind: 'succeeded' })
  })

  it('treats a gate-rejection as a terminal business outcome (notice, no throw)', async () => {
    const { executor, notices } = harness({ kind: 'gate-rejected', denials: [{ code: 'COST_EXCEEDS_BUDGET', detail: 'too big' }] as never })
    await expect(executor.execute(job(), attempt, signal)).resolves.toBeUndefined()
    expect(notices[0]?.kind).toBe('rejected')
  })

  it('treats a proposal-rejection as terminal (notice, no throw)', async () => {
    const { executor, notices } = harness({ kind: 'proposal-rejected', reason: 'malformed-emission', detail: 'bad json' })
    await expect(executor.execute(job(), attempt, signal)).resolves.toBeUndefined()
    expect(notices[0]?.kind).toBe('rejected')
  })

  it('throws on a genuine step failure so the runner retries', async () => {
    const { executor } = harness({ kind: 'executed', status: 'failed', graphId: 5 })
    await expect(executor.execute(job(), attempt, signal)).rejects.toThrow()
  })

  it('is a no-op (no throw) when the Card no longer exists', async () => {
    const { executor, notices } = harness({ kind: 'executed', status: 'succeeded', graphId: 5 }, false)
    await expect(executor.execute(job(), attempt, signal)).resolves.toBeUndefined()
    expect(notices).toHaveLength(0)
  })
})

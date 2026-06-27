import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import { parseApproval, type Approval } from '@/opzava/core/approvals/contracts'
import type { PostApprovalDispatcher } from '@/opzava/core/approvals/post-approval-dispatcher'
import { createRunnerRepository } from '@/opzava/platform/runner/repository'
import type { Attempt, Job } from '@/opzava/platform/runner/contracts'
import {
  POST_APPROVAL_DISPATCH_JOB_KIND,
  enqueuePostApprovalDispatch,
  makePostApprovalDispatchExecutor,
} from './post-approval-dispatch'

let db: Database.Database
let repo: ReturnType<typeof createRunnerRepository>
let seq: number

const ids = () => {
  seq += 1
  return `id-${seq}`
}
const deps = () => ({ newId: ids, now: () => '2026-06-27T00:00:00.000Z' })

function approved(): Approval {
  return parseApproval({
    schemaVersion: 1,
    approvalId: 'apr-1',
    requestedAction: 'campaign.send',
    target: { kind: 'external-action', id: 'campaign-send:c1' },
    status: 'approved',
    requesterId: 'system',
    approverId: 'admin',
    decisionReason: 'ok',
    requestedAt: 't0',
    decidedAt: 't1',
    expiresAt: null,
    correlation: { conversationId: 'coord:admin:opzava', runId: 'run-1' },
  })
}

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = createRunnerRepository(db)
  repo.ensureSchema()
  seq = 0
})

afterEach(() => db.close())

describe('enqueuePostApprovalDispatch', () => {
  it('enqueues a durable dispatch job keyed by the approval (idempotent)', () => {
    enqueuePostApprovalDispatch(repo, { approvalId: 'apr-1', requestedAction: 'campaign.send' }, deps())
    enqueuePostApprovalDispatch(repo, { approvalId: 'apr-1', requestedAction: 'campaign.send' }, deps())

    const job = repo.getJobByIdempotencyKey('dispatch:apr-1')
    expect(job).not.toBeNull()
    expect(job?.job.payload).toMatchObject({
      kind: POST_APPROVAL_DISPATCH_JOB_KIND,
      approvalId: 'apr-1',
      requestedAction: 'campaign.send',
    })
    expect(job?.job.status).toBe('queued')
  })
})

describe('makePostApprovalDispatchExecutor', () => {
  const job = (payload: unknown): Job =>
    ({
      schemaVersion: 1,
      jobId: 'job-1',
      workflowRunId: 'apr-1',
      stepRunId: null,
      status: 'leased',
      idempotencyKey: 'dispatch:apr-1',
      payload,
      priority: 50,
      scheduledAt: 't',
      lease: null,
      attemptCount: 1,
      maxAttempts: 3,
    }) as Job
  const attempt = {} as Attempt
  const signal = new AbortController().signal

  it('loads the approval and runs the dispatcher', async () => {
    const dispatch = vi.fn(async (_approval: Approval) => ({ status: 'dispatched' as const, requestedAction: 'campaign.send', outcome: { kind: 'triggered' as const, summary: 'sent' }, turnPosted: true }))
    const executor = makePostApprovalDispatchExecutor({
      approvals: { getApprovalById: (id) => (id === 'apr-1' ? approved() : null) },
      dispatcher: { dispatch } as PostApprovalDispatcher,
    })

    await executor.execute(job({ kind: POST_APPROVAL_DISPATCH_JOB_KIND, approvalId: 'apr-1', requestedAction: 'campaign.send' }), attempt, signal)

    expect(dispatch).toHaveBeenCalledOnce()
    expect(dispatch.mock.calls[0][0].approvalId).toBe('apr-1')
  })

  it('is a no-op (no throw) when the approval no longer exists', async () => {
    const dispatch = vi.fn()
    const executor = makePostApprovalDispatchExecutor({
      approvals: { getApprovalById: () => null },
      dispatcher: { dispatch } as unknown as PostApprovalDispatcher,
    })
    await expect(
      executor.execute(job({ kind: POST_APPROVAL_DISPATCH_JOB_KIND, approvalId: 'gone', requestedAction: 'campaign.send' }), attempt, signal),
    ).resolves.toBeUndefined()
    expect(dispatch).not.toHaveBeenCalled()
  })
})

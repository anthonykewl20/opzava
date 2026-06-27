import { z } from 'zod'

import type { Approval } from '@/opzava/core/approvals/contracts'
import type { PostApprovalDispatcher } from '@/opzava/core/approvals/post-approval-dispatcher'
import { RUNNER_CONTRACT_SCHEMA_VERSION, type Job } from '@/opzava/platform/runner/contracts'
import {
  RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
  type JobStorageRecord,
} from '@/opzava/platform/runner/repository-contracts'
import type { RunnerRepository } from '@/opzava/platform/runner/repository'
import type { RunnerExecutor } from '@/opzava/platform/runner/worker'

// Durable substrate for ARD 0029: a 'post-approval-dispatch' runner job, enqueued in the decide
// route's flip transaction, and the executor that drains it through the PostApprovalDispatcher.
// platform layer — imports core (the dispatcher router) + runner (same layer), never modules. The
// concrete handlers (campaign-send etc.) are injected into the dispatcher at the composition root.
// In S2 the decide route drains this job inline (best-effort); the always-on daemon that drains
// crash-orphaned jobs is the S4 make-it-live boot (it needs live secrets/gateway).

export const POST_APPROVAL_DISPATCH_JOB_KIND = 'post-approval-dispatch' as const

const payloadSchema = z
  .object({
    kind: z.literal(POST_APPROVAL_DISPATCH_JOB_KIND),
    approvalId: z.string().min(1),
    requestedAction: z.string().min(1),
  })
  .strict()

export type PostApprovalDispatchPayload = z.infer<typeof payloadSchema>

export function postApprovalDispatchIdempotencyKey(approvalId: string): string {
  return `dispatch:${approvalId}`
}

export interface EnqueueDispatchDeps {
  readonly newId: () => string
  readonly now: () => string
  readonly priority?: number
  readonly maxAttempts?: number
}

export interface EnqueueDispatchResult {
  readonly jobId: string
  readonly created: boolean
}

/** Idempotent: one dispatch job per approval (key `dispatch:<approvalId>`). */
export function enqueuePostApprovalDispatch(
  repo: RunnerRepository,
  input: Readonly<{ approvalId: string; requestedAction: string }>,
  deps: EnqueueDispatchDeps,
): EnqueueDispatchResult {
  const idempotencyKey = postApprovalDispatchIdempotencyKey(input.approvalId)
  const existing = repo.getJobByIdempotencyKey(idempotencyKey)
  if (existing) return { jobId: existing.job.jobId, created: false }

  const ts = deps.now()
  const jobId = deps.newId()
  const job: Job = {
    schemaVersion: RUNNER_CONTRACT_SCHEMA_VERSION,
    jobId,
    workflowRunId: input.approvalId,
    stepRunId: null,
    status: 'queued',
    idempotencyKey,
    payload: { kind: POST_APPROVAL_DISPATCH_JOB_KIND, approvalId: input.approvalId, requestedAction: input.requestedAction },
    priority: deps.priority ?? 50,
    scheduledAt: ts,
    lease: null,
    attemptCount: 0,
    maxAttempts: deps.maxAttempts ?? 3,
  }
  const record: JobStorageRecord = {
    schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
    recordId: deps.newId(),
    storedAt: ts,
    updatedAt: ts,
    statusIndex: 'queued',
    workflowRunId: input.approvalId,
    stepRunId: null,
    idempotencyKey,
    job,
  }
  repo.saveJob(record)
  return { jobId, created: true }
}

export interface PostApprovalDispatchExecutorDeps {
  readonly approvals: { getApprovalById: (id: string) => Approval | null }
  readonly dispatcher: PostApprovalDispatcher
}

/** A RunnerExecutor for the 'post-approval-dispatch' kind — loads the approval and routes it. */
export function makePostApprovalDispatchExecutor(deps: PostApprovalDispatchExecutorDeps): RunnerExecutor {
  return {
    execute: async (job) => {
      const payload = payloadSchema.parse(job.payload)
      const approval = deps.approvals.getApprovalById(payload.approvalId)
      // The approval was deleted/expired between enqueue and drain — nothing to do; job succeeds.
      if (!approval) return
      await deps.dispatcher.dispatch(approval)
    },
  }
}

import { z } from 'zod'

import { RUNNER_CONTRACT_SCHEMA_VERSION, type Job } from '@/opzava/platform/runner/contracts'
import {
  RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
  type JobStorageRecord,
} from '@/opzava/platform/runner/repository-contracts'
import type { RunnerRepository } from '@/opzava/platform/runner/repository'

// The durable 'decompose-card' runner job — enqueued when a Card is launched from chat (launch_work)
// and drained by the DecompositionExecutor (the first production caller of decomposeAndExecute).
// Mirrors post-approval-dispatch: idempotent enqueue keyed by the Card; the always-on draining
// daemon is the S4 make-it-live boot (the chat route drains inline in S3).

export const DECOMPOSE_CARD_JOB_KIND = 'decompose-card' as const

export const decomposeCardPayloadSchema = z
  .object({
    kind: z.literal(DECOMPOSE_CARD_JOB_KIND),
    cardId: z.number().int(),
    workspaceId: z.number().int(),
    conversationId: z.string().min(1),
    runId: z.string().min(1),
  })
  .strict()

export type DecomposeCardPayload = z.infer<typeof decomposeCardPayloadSchema>

export function decomposeCardIdempotencyKey(cardId: number): string {
  return `decompose-card:${cardId}`
}

export interface EnqueueDecomposeCardDeps {
  readonly newId: () => string
  readonly now: () => string
  readonly priority?: number
  readonly maxAttempts?: number
}

export interface EnqueueDecomposeCardResult {
  readonly jobId: string
  readonly created: boolean
}

/** Idempotent: one decompose job per Card (key `decompose-card:<cardId>`). */
export function enqueueDecomposeCard(
  repo: RunnerRepository,
  input: Readonly<{ cardId: number; workspaceId: number; conversationId: string; runId: string }>,
  deps: EnqueueDecomposeCardDeps,
): EnqueueDecomposeCardResult {
  const idempotencyKey = decomposeCardIdempotencyKey(input.cardId)
  const existing = repo.getJobByIdempotencyKey(idempotencyKey)
  if (existing) return { jobId: existing.job.jobId, created: false }

  const ts = deps.now()
  const jobId = deps.newId()
  const job: Job = {
    schemaVersion: RUNNER_CONTRACT_SCHEMA_VERSION,
    jobId,
    workflowRunId: input.runId,
    stepRunId: null,
    status: 'queued',
    idempotencyKey,
    payload: {
      kind: DECOMPOSE_CARD_JOB_KIND,
      cardId: input.cardId,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      runId: input.runId,
    },
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
    workflowRunId: input.runId,
    stepRunId: null,
    idempotencyKey,
    job,
  }
  repo.saveJob(record)
  return { jobId, created: true }
}

import { z } from 'zod'

import { auditEventSchema, type AuditEvent } from '../audit/contracts'
import { costEventSchema, type CostEvent } from '../costs/contracts'
import { externalCallRecordSchema, type ExternalCallRecord } from '../providers/contracts'
import {
  attemptSchema,
  deadLetterSchema,
  jobSchema,
  jobStatusSchema,
  type Attempt,
  type DeadLetter,
  type Job,
  type JobStatus,
} from './contracts'

export const RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION = 1 as const

const repositoryIdSchema = z.string().min(1).max(160)
const timestampSchema = z.string().min(1)

export const jobStorageRecordSchema = z.object({
  schemaVersion: z.literal(RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION),
  recordId: repositoryIdSchema,
  storedAt: timestampSchema,
  updatedAt: timestampSchema,
  statusIndex: jobStatusSchema,
  workflowRunId: z.string().min(1).max(120),
  stepRunId: z.string().min(1).max(120).nullable(),
  idempotencyKey: z.string().min(1).max(240),
  job: jobSchema,
}).strict().superRefine((record, ctx) => {
  if (record.statusIndex !== record.job.status) {
    ctx.addIssue({ code: 'custom', path: ['statusIndex'], message: 'status index must match stored job status' })
  }

  if (record.workflowRunId !== record.job.workflowRunId) {
    ctx.addIssue({ code: 'custom', path: ['workflowRunId'], message: 'workflow index must match stored job workflow run' })
  }

  if (record.stepRunId !== record.job.stepRunId) {
    ctx.addIssue({ code: 'custom', path: ['stepRunId'], message: 'step index must match stored job step run' })
  }

  if (record.idempotencyKey !== record.job.idempotencyKey) {
    ctx.addIssue({ code: 'custom', path: ['idempotencyKey'], message: 'idempotency index must match stored job idempotency key' })
  }
})

export const attemptStorageRecordSchema = z.object({
  schemaVersion: z.literal(RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION),
  recordId: repositoryIdSchema,
  storedAt: timestampSchema,
  jobId: z.string().min(1).max(120),
  attemptNumber: z.number().int().min(1),
  attempt: attemptSchema,
}).strict().superRefine((record, ctx) => {
  if (record.jobId !== record.attempt.jobId) {
    ctx.addIssue({ code: 'custom', path: ['jobId'], message: 'job index must match stored attempt job id' })
  }

  if (record.attemptNumber !== record.attempt.attemptNumber) {
    ctx.addIssue({ code: 'custom', path: ['attemptNumber'], message: 'attempt index must match stored attempt number' })
  }
})

export const deadLetterStorageRecordSchema = z.object({
  schemaVersion: z.literal(RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION),
  recordId: repositoryIdSchema,
  storedAt: timestampSchema,
  workflowRunId: z.string().min(1).max(120),
  stepRunId: z.string().min(1).max(120).nullable(),
  replayEligible: z.boolean(),
  deadLetter: deadLetterSchema,
}).strict().superRefine((record, ctx) => {
  if (record.workflowRunId !== record.deadLetter.workflowRunId) {
    ctx.addIssue({ code: 'custom', path: ['workflowRunId'], message: 'workflow index must match stored dead letter workflow run' })
  }

  if (record.stepRunId !== record.deadLetter.stepRunId) {
    ctx.addIssue({ code: 'custom', path: ['stepRunId'], message: 'step index must match stored dead letter step run' })
  }

  if (record.replayEligible !== record.deadLetter.replay.eligible) {
    ctx.addIssue({ code: 'custom', path: ['replayEligible'], message: 'replay index must match stored dead letter replay eligibility' })
  }
})

const operationalEventSchema = z.union([
  externalCallRecordSchema,
  costEventSchema,
  auditEventSchema,
])

export const operationalEventStorageRecordSchema = z.object({
  schemaVersion: z.literal(RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION),
  recordId: repositoryIdSchema,
  kind: z.enum(['external-call', 'cost', 'audit']),
  workflowRunId: z.string().min(1).max(120),
  stepRunId: z.string().min(1).max(120).nullable(),
  occurredAt: timestampSchema,
  event: operationalEventSchema,
}).strict().superRefine((record, ctx) => {
  if (record.kind === 'external-call') {
    const event = externalCallRecordSchema.safeParse(record.event)
    if (!event.success) {
      ctx.addIssue({ code: 'custom', path: ['event'], message: 'external-call records must store an ExternalCallRecord' })
      return
    }

    assertWorkflowAndStepIndexes(record, event.data.workflowRunId, event.data.stepRunId, ctx)
    if (record.occurredAt !== (event.data.finishedAt ?? event.data.startedAt)) {
      ctx.addIssue({ code: 'custom', path: ['occurredAt'], message: 'external-call timestamp index must match stored event timing' })
    }

    return
  }

  if (record.kind === 'cost') {
    const event = costEventSchema.safeParse(record.event)
    if (!event.success) {
      ctx.addIssue({ code: 'custom', path: ['event'], message: 'cost records must store a CostEvent' })
      return
    }

    assertWorkflowAndStepIndexes(record, event.data.workflowRunId, event.data.stepRunId, ctx)
    if (record.occurredAt !== event.data.recordedAt) {
      ctx.addIssue({ code: 'custom', path: ['occurredAt'], message: 'cost timestamp index must match stored event timing' })
    }

    return
  }

  const event = auditEventSchema.safeParse(record.event)
  if (!event.success) {
    ctx.addIssue({ code: 'custom', path: ['event'], message: 'audit records must store an AuditEvent' })
    return
  }

  if (record.occurredAt !== event.data.occurredAt) {
    ctx.addIssue({ code: 'custom', path: ['occurredAt'], message: 'audit timestamp index must match stored event timing' })
  }
})

export const replayQuerySchema = z.object({
  schemaVersion: z.literal(RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION),
  workflowRunId: z.string().min(1).max(120),
  stepRunId: z.string().min(1).max(120).nullable(),
  onlyEligible: z.boolean(),
  limit: z.number().int().min(1).max(100),
  cursor: z.string().min(1).max(240).nullable(),
}).strict()

const recoveryJobReferenceSchema = z.object({
  jobId: z.string().min(1).max(120),
  idempotencyKey: z.string().min(1).max(240),
  reason: z.string().min(1).max(500),
}).strict()

export const runnerRecoveryPlanSchema = z.object({
  schemaVersion: z.literal(RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION),
  recoveryPlanId: repositoryIdSchema,
  generatedAt: timestampSchema,
  workerId: z.string().min(1).max(120),
  expiredLeaseCutoff: timestampSchema,
  jobsToRequeue: z.array(recoveryJobReferenceSchema).max(1000),
  jobsToDeadLetter: z.array(recoveryJobReferenceSchema).max(1000),
}).strict()

export type JobStorageRecord = Readonly<z.infer<typeof jobStorageRecordSchema>>
export type AttemptStorageRecord = Readonly<z.infer<typeof attemptStorageRecordSchema>>
export type DeadLetterStorageRecord = Readonly<z.infer<typeof deadLetterStorageRecordSchema>>
export type OperationalEventStorageRecord = Readonly<z.infer<typeof operationalEventStorageRecordSchema>>
export type ReplayQuery = Readonly<z.infer<typeof replayQuerySchema>>
export type RunnerRecoveryPlan = Readonly<z.infer<typeof runnerRecoveryPlanSchema>>
export type StoredOperationalEvent = ExternalCallRecord | CostEvent | AuditEvent

export function parseJobStorageRecord(input: unknown): JobStorageRecord {
  return Object.freeze(jobStorageRecordSchema.parse(input))
}

export function parseAttemptStorageRecord(input: unknown): AttemptStorageRecord {
  return Object.freeze(attemptStorageRecordSchema.parse(input))
}

export function parseDeadLetterStorageRecord(input: unknown): DeadLetterStorageRecord {
  return Object.freeze(deadLetterStorageRecordSchema.parse(input))
}

export function parseOperationalEventStorageRecord(input: unknown): OperationalEventStorageRecord {
  return Object.freeze(operationalEventStorageRecordSchema.parse(input))
}

export function parseReplayQuery(input: unknown): ReplayQuery {
  return Object.freeze(replayQuerySchema.parse(input))
}

export function parseRunnerRecoveryPlan(input: unknown): RunnerRecoveryPlan {
  return Object.freeze(runnerRecoveryPlanSchema.parse(input))
}

function assertWorkflowAndStepIndexes(
  record: { workflowRunId: string, stepRunId: string | null },
  workflowRunId: string,
  stepRunId: string | null,
  ctx: z.RefinementCtx,
): void {
  if (record.workflowRunId !== workflowRunId) {
    ctx.addIssue({ code: 'custom', path: ['workflowRunId'], message: 'workflow index must match stored event workflow run' })
  }

  if (record.stepRunId !== stepRunId) {
    ctx.addIssue({ code: 'custom', path: ['stepRunId'], message: 'step index must match stored event step run' })
  }
}

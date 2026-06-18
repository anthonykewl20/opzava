import { z } from 'zod'

import { isSecretReference } from '../admin-config/contracts'

export const RUNNER_CONTRACT_SCHEMA_VERSION = 1 as const

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]))

export const jobStatusSchema = z.enum([
  'queued',
  'leased',
  'succeeded',
  'failed',
  'dead-lettered',
  'cancelled',
])

export type JobStatus = z.infer<typeof jobStatusSchema>

const leaseSchema = z.object({
  workerId: z.string().min(1).max(120),
  leasedAt: z.string().min(1),
  expiresAt: z.string().min(1),
}).strict()

export const jobSchema = z.object({
  schemaVersion: z.literal(RUNNER_CONTRACT_SCHEMA_VERSION),
  jobId: z.string().min(1).max(120),
  workflowRunId: z.string().min(1).max(120),
  stepRunId: z.string().min(1).max(120).nullable(),
  status: jobStatusSchema,
  idempotencyKey: z.string().min(1).max(240),
  payload: jsonValueSchema,
  priority: z.number().int().min(0).max(100),
  scheduledAt: z.string().min(1),
  lease: leaseSchema.nullable(),
  attemptCount: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).max(20),
}).strict().superRefine((job, ctx) => {
  if (job.status === 'leased' && job.lease === null) {
    ctx.addIssue({ code: 'custom', path: ['lease'], message: 'leased jobs require lease metadata' })
  }

  if (job.status !== 'leased' && job.lease !== null) {
    ctx.addIssue({ code: 'custom', path: ['lease'], message: 'only leased jobs may carry lease metadata' })
  }

  if (job.attemptCount > job.maxAttempts) {
    ctx.addIssue({ code: 'custom', path: ['attemptCount'], message: 'attempt count cannot exceed max attempts' })
  }

  if (containsSecretReference(job.payload)) {
    ctx.addIssue({ code: 'custom', path: ['payload'], message: 'job payloads must not contain secret references' })
  }
})

export const retryDecisionSchema = z.object({
  action: z.enum(['retry', 'dead-letter', 'do-not-retry']),
  reason: z.string().min(1).max(500),
  scheduledAt: z.string().min(1).nullable(),
}).strict().superRefine((decision, ctx) => {
  if (decision.action === 'retry' && decision.scheduledAt === null) {
    ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'retry decisions require a scheduled retry time' })
  }

  if (decision.action !== 'retry' && decision.scheduledAt !== null) {
    ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'terminal retry decisions must not schedule another attempt' })
  }
})

export const attemptSchema = z.object({
  schemaVersion: z.literal(RUNNER_CONTRACT_SCHEMA_VERSION),
  attemptId: z.string().min(1).max(120),
  jobId: z.string().min(1).max(120),
  attemptNumber: z.number().int().min(1),
  status: z.enum(['running', 'succeeded', 'failed']),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1).nullable(),
  errorClass: z.enum(['none', 'timeout', 'provider-error', 'validation-error', 'permission-error', 'unknown']),
  retryDecision: retryDecisionSchema,
}).strict().superRefine((attempt, ctx) => {
  if (attempt.status === 'running' && attempt.finishedAt !== null) {
    ctx.addIssue({ code: 'custom', path: ['finishedAt'], message: 'running attempts must not have a finish time' })
  }

  if (attempt.status !== 'running' && attempt.finishedAt === null) {
    ctx.addIssue({ code: 'custom', path: ['finishedAt'], message: 'finished attempts require a finish time' })
  }
})

export const deadLetterSchema = z.object({
  schemaVersion: z.literal(RUNNER_CONTRACT_SCHEMA_VERSION),
  deadLetterId: z.string().min(1).max(120),
  jobId: z.string().min(1).max(120),
  workflowRunId: z.string().min(1).max(120),
  stepRunId: z.string().min(1).max(120).nullable(),
  finalError: z.object({
    class: z.enum(['timeout', 'provider-error', 'validation-error', 'permission-error', 'unknown']),
    message: z.string().min(1).max(1000),
  }).strict(),
  replay: z.object({
    eligible: z.boolean(),
    source: z.enum(['failed-step', 'manual-review', 'not-replayable']),
    reason: z.string().min(1).max(500),
  }).strict(),
  jobSnapshot: z.object({
    idempotencyKey: z.string().min(1).max(240),
    payload: jsonValueSchema,
  }).strict(),
  createdAt: z.string().min(1),
}).strict().superRefine((deadLetter, ctx) => {
  if (containsSecretReference(deadLetter.jobSnapshot.payload)) {
    ctx.addIssue({ code: 'custom', path: ['jobSnapshot', 'payload'], message: 'dead-letter snapshots must not contain secret references' })
  }

  if (!deadLetter.replay.eligible && deadLetter.replay.source !== 'not-replayable') {
    ctx.addIssue({ code: 'custom', path: ['replay', 'source'], message: 'ineligible dead letters must use not-replayable as replay source' })
  }
})

export type Job = Readonly<z.infer<typeof jobSchema>>
export type Attempt = Readonly<z.infer<typeof attemptSchema>>
export type DeadLetter = Readonly<z.infer<typeof deadLetterSchema>>
export type JobTransition = Readonly<{
  status: JobStatus
  lease: Job['lease']
}>

const jobTransitions = {
  queued: ['leased', 'cancelled'],
  leased: ['queued', 'succeeded', 'failed', 'dead-lettered'],
  succeeded: [],
  failed: ['queued', 'dead-lettered'],
  'dead-lettered': [],
  cancelled: [],
} satisfies Record<JobStatus, readonly JobStatus[]>

export function parseJob(input: unknown): Job {
  return Object.freeze(jobSchema.parse(input))
}

export function parseAttempt(input: unknown): Attempt {
  return Object.freeze(attemptSchema.parse(input))
}

export function parseDeadLetter(input: unknown): DeadLetter {
  return Object.freeze(deadLetterSchema.parse(input))
}

export function transitionJobStatus(job: Job, transition: JobTransition): Job {
  const allowedTransitions = jobTransitions[job.status] as readonly JobStatus[]

  if (!allowedTransitions.includes(transition.status)) {
    throw new Error(`invalid job transition: ${job.status} -> ${transition.status}`)
  }

  return parseJob({ ...job, status: transition.status, lease: transition.lease })
}

function containsSecretReference(value: JsonValue): boolean {
  if (isSecretReference(value)) {
    return true
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSecretReference(item))
  }

  if (typeof value !== 'object' || value === null) {
    return false
  }

  return Object.values(value).some((item) => containsSecretReference(item))
}

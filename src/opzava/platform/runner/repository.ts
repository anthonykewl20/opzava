import { createHash } from 'node:crypto'

import type Database from 'better-sqlite3'

import { parseAttempt, parseJob, transitionJobStatus, type Job } from './contracts'
import {
  applyOpzavaRunnerJobPrioritySchema,
  applyOpzavaRunnerRepositorySchema,
} from './migrations'
import {
  parseAttemptStorageRecord,
  parseDeadLetterStorageRecord,
  parseJobStorageRecord,
  parseOperationalEventStorageRecord,
  parseReplayQuery,
  parseRunnerRecoveryPlan,
  RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
  type AttemptStorageRecord,
  type DeadLetterStorageRecord,
  type JobStorageRecord,
  type OperationalEventStorageRecord,
  type ReplayQuery,
  type RunnerRecoveryPlan,
} from './repository-contracts'

type JsonRow = { record_json: string }
type RecoveryPlanInput = Readonly<{
  recoveryPlanId: string
  generatedAt: string
  workerId: string
  expiredLeaseCutoff: string
}>
type LeaseNextJobForAttemptInput = Readonly<{
  workerId: string
  attemptId: string
  leasedAt: string
  leaseExpiresAt: string
}>
type LeaseNextJobForAttemptResult = Readonly<{
  jobRecord: JobStorageRecord
  attemptRecord: AttemptStorageRecord
}>
type RecordAttemptSuccessInput = Readonly<{
  jobId: string
  attemptId: string
  finishedAt: string
}>
type RecordAttemptSuccessResult = Readonly<{
  jobRecord: JobStorageRecord
  attemptRecord: AttemptStorageRecord
}>
type RecordAttemptFailureInput = Readonly<{
  jobId: string
  attemptId: string
  finishedAt: string
  errorClass: 'timeout' | 'provider-error' | 'validation-error' | 'permission-error' | 'unknown'
  errorMessage: string
  retryScheduledAt: string | null
  deadLetterId: string | null
}>
type RecordAttemptFailureResult = Readonly<{
  jobRecord: JobStorageRecord
  attemptRecord: AttemptStorageRecord
  deadLetterRecord: DeadLetterStorageRecord | null
}>
type RunnerAuditSummary = Readonly<Record<string, string | number | boolean | null>>
type RunnerAuditInput = Readonly<{
  action: string
  actorId: string
  job: Job
  targetKind: string
  targetId: string
  occurredAt: string
  afterSummary: RunnerAuditSummary
}>
type ImmediateTransaction<T> = Readonly<{
  immediate: () => T
}>

// One immediate retry is a local contention guard, not proof of multi-worker safety.
const IMMEDIATE_TRANSACTION_MAX_ATTEMPTS = 2

export type RunnerRepository = Readonly<{
  ensureSchema: () => void
  saveJob: (record: JobStorageRecord) => void
  getJobById: (jobId: string) => JobStorageRecord | null
  getJobByIdempotencyKey: (idempotencyKey: string) => JobStorageRecord | null
  getAttemptById: (attemptId: string) => AttemptStorageRecord | null
  getDeadLetterById: (deadLetterId: string) => DeadLetterStorageRecord | null
  appendAttempt: (record: AttemptStorageRecord) => void
  appendDeadLetter: (record: DeadLetterStorageRecord) => void
  appendOperationalEvent: (record: OperationalEventStorageRecord) => void
  leaseNextJobForAttempt: (input: LeaseNextJobForAttemptInput) => LeaseNextJobForAttemptResult | null
  recordAttemptSuccess: (input: RecordAttemptSuccessInput) => RecordAttemptSuccessResult
  recordAttemptFailure: (input: RecordAttemptFailureInput) => RecordAttemptFailureResult
  listReplayableDeadLetters: (query: ReplayQuery) => DeadLetterStorageRecord[]
  listOperationalEventsForWorkflowRun: (workflowRunId: string) => OperationalEventStorageRecord[]
  planExpiredLeaseRecovery: (input: RecoveryPlanInput) => RunnerRecoveryPlan
  executeExpiredLeaseRecovery: (input: RecoveryPlanInput) => RunnerRecoveryPlan
}>

export function createRunnerRepository(db: Database.Database): RunnerRepository {
  let schemaReady = false

  function ensureSchema(): void {
    if (schemaReady) return

    applyOpzavaRunnerRepositorySchema(db)
    applyOpzavaRunnerJobPrioritySchema(db)
    schemaReady = true
  }

  function saveJob(input: JobStorageRecord): void {
    ensureSchema()
    const record = parseJobStorageRecord(input)
    const existing = getJobById(record.job.jobId)

    const tx = db.transaction(() => {
      if (existing && existing.job.status !== record.job.status) {
        transitionJobStatus(existing.job, {
          status: record.job.status,
          lease: record.job.lease,
        })
      }

      upsertJobRecord(record)
    })

    runImmediateTransaction(tx)
  }

  function getJobById(jobId: string): JobStorageRecord | null {
    ensureSchema()
    const row = db.prepare('SELECT record_json FROM opzava_runner_jobs WHERE job_id = ?').get(jobId) as JsonRow | undefined
    return row ? parseJobStorageRecord(JSON.parse(row.record_json)) : null
  }

  function getJobByIdempotencyKey(idempotencyKey: string): JobStorageRecord | null {
    ensureSchema()
    const row = db.prepare('SELECT record_json FROM opzava_runner_jobs WHERE idempotency_key = ?').get(idempotencyKey) as JsonRow | undefined
    return row ? parseJobStorageRecord(JSON.parse(row.record_json)) : null
  }

  function getAttemptById(attemptId: string): AttemptStorageRecord | null {
    ensureSchema()
    const row = db.prepare('SELECT record_json FROM opzava_runner_attempts WHERE attempt_id = ?').get(attemptId) as JsonRow | undefined
    return row ? parseAttemptStorageRecord(JSON.parse(row.record_json)) : null
  }

  function getDeadLetterById(deadLetterId: string): DeadLetterStorageRecord | null {
    ensureSchema()
    const row = db.prepare('SELECT record_json FROM opzava_runner_dead_letters WHERE dead_letter_id = ?').get(deadLetterId) as JsonRow | undefined
    return row ? parseDeadLetterStorageRecord(JSON.parse(row.record_json)) : null
  }

  function appendAttempt(input: AttemptStorageRecord): void {
    ensureSchema()
    const record = parseAttemptStorageRecord(input)

    db.prepare(`
      INSERT INTO opzava_runner_attempts (attempt_id, job_id, attempt_number, status, stored_at, record_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.attempt.attemptId,
      record.jobId,
      record.attemptNumber,
      record.attempt.status,
      record.storedAt,
      JSON.stringify(record),
    )
  }

  function appendDeadLetter(input: DeadLetterStorageRecord): void {
    ensureSchema()
    const record = parseDeadLetterStorageRecord(input)

    db.prepare(`
      INSERT INTO opzava_runner_dead_letters (
        dead_letter_id, job_id, workflow_run_id, step_run_id, replay_eligible, stored_at, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.deadLetter.deadLetterId,
      record.deadLetter.jobId,
      record.workflowRunId,
      record.stepRunId,
      record.replayEligible ? 1 : 0,
      record.storedAt,
      JSON.stringify(record),
    )
  }

  function appendOperationalEvent(input: OperationalEventStorageRecord): void {
    ensureSchema()
    const record = parseOperationalEventStorageRecord(input)

    insertOperationalEventRecord(record)
  }

  function leaseNextJobForAttempt(input: LeaseNextJobForAttemptInput): LeaseNextJobForAttemptResult | null {
    ensureSchema()

    const tx = db.transaction(() => {
      const rows = db.prepare(`
        SELECT record_json FROM opzava_runner_jobs
        WHERE status = 'queued' AND scheduled_at <= ?
        ORDER BY priority DESC, scheduled_at ASC, rowid ASC
        LIMIT 100
      `).all(input.leasedAt) as JsonRow[]

      for (const row of rows) {
        const existing = parseJobStorageRecord(JSON.parse(row.record_json))
        if (existing.job.attemptCount >= existing.job.maxAttempts) continue

        const transitioned = transitionJobStatus(existing.job, {
          status: 'leased',
          lease: {
            workerId: input.workerId,
            leasedAt: input.leasedAt,
            expiresAt: input.leaseExpiresAt,
          },
        })
        const leasedJob = parseJob({
          ...transitioned,
          attemptCount: transitioned.attemptCount + 1,
        })
        const attempt = parseAttempt({
          schemaVersion: 1,
          attemptId: input.attemptId,
          jobId: leasedJob.jobId,
          attemptNumber: leasedJob.attemptCount,
          status: 'running',
          startedAt: input.leasedAt,
          finishedAt: null,
          errorClass: 'none',
          retryDecision: {
            action: 'do-not-retry',
            reason: 'attempt outcome pending',
            scheduledAt: null,
          },
        })
        const jobRecord = parseJobStorageRecord({
          ...existing,
          updatedAt: input.leasedAt,
          statusIndex: leasedJob.status,
          job: leasedJob,
        })
        const attemptRecord = parseAttemptStorageRecord({
          schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
          recordId: `attempt_record_${attempt.attemptId}`,
          storedAt: input.leasedAt,
          jobId: attempt.jobId,
          attemptNumber: attempt.attemptNumber,
          attempt,
        })

        upsertJobRecord(jobRecord)
        insertAttemptRecord(attemptRecord)

        return Object.freeze({ jobRecord, attemptRecord })
      }

      return null
    })

    return runImmediateTransaction(tx)
  }

  function recordAttemptSuccess(input: RecordAttemptSuccessInput): RecordAttemptSuccessResult {
    ensureSchema()

    const tx = db.transaction(() => {
      const existingJob = requireJob(input.jobId)
      const existingAttempt = requireAttempt(input.attemptId)
      assertAttemptBelongsToJob(existingAttempt, existingJob.job.jobId)
      assertLeasedJobWithRunningAttempt(existingJob, existingAttempt)

      const succeededJob = transitionJobStatus(existingJob.job, { status: 'succeeded', lease: null })
      const succeededAttempt = parseAttempt({
        ...existingAttempt.attempt,
        status: 'succeeded',
        finishedAt: input.finishedAt,
        errorClass: 'none',
        retryDecision: {
          action: 'do-not-retry',
          reason: 'attempt succeeded',
          scheduledAt: null,
        },
      })
      const jobRecord = parseJobStorageRecord({
        ...existingJob,
        updatedAt: input.finishedAt,
        statusIndex: succeededJob.status,
        job: succeededJob,
      })
      const attemptRecord = parseAttemptStorageRecord({
        ...existingAttempt,
        storedAt: input.finishedAt,
        attempt: succeededAttempt,
      })

      upsertJobRecord(jobRecord)
      upsertAttemptRecord(attemptRecord)
      insertRunnerAuditEvent({
        action: 'runner.attempt.succeeded',
        actorId: existingJob.job.lease?.workerId ?? 'system:runner',
        job: succeededJob,
        targetKind: 'runner-attempt',
        targetId: succeededAttempt.attemptId,
        occurredAt: input.finishedAt,
        afterSummary: {
          jobId: succeededJob.jobId,
          attemptId: succeededAttempt.attemptId,
          attemptNumber: succeededAttempt.attemptNumber,
          status: succeededJob.status,
        },
      })

      return Object.freeze({ jobRecord, attemptRecord })
    })

    return runImmediateTransaction(tx)
  }

  function recordAttemptFailure(input: RecordAttemptFailureInput): RecordAttemptFailureResult {
    ensureSchema()

    const tx = db.transaction(() => {
      const existingJob = requireJob(input.jobId)
      const existingAttempt = requireAttempt(input.attemptId)
      assertAttemptBelongsToJob(existingAttempt, existingJob.job.jobId)
      assertLeasedJobWithRunningAttempt(existingJob, existingAttempt)

      if (existingJob.job.attemptCount < existingJob.job.maxAttempts) {
        if (input.retryScheduledAt === null) {
          throw new Error('retryable failures require retryScheduledAt')
        }
        if (input.retryScheduledAt <= input.finishedAt) {
          throw new Error('retry time must be after attempt finish time')
        }

        const queuedJob = transitionJobStatus(existingJob.job, { status: 'queued', lease: null })
        const retryJob = parseJob({
          ...queuedJob,
          scheduledAt: input.retryScheduledAt,
        })
        const failedAttempt = parseAttempt({
          ...existingAttempt.attempt,
          status: 'failed',
          finishedAt: input.finishedAt,
          errorClass: input.errorClass,
          retryDecision: {
            action: 'retry',
            reason: input.errorMessage,
            scheduledAt: input.retryScheduledAt,
          },
        })
        const jobRecord = parseJobStorageRecord({
          ...existingJob,
          updatedAt: input.finishedAt,
          statusIndex: retryJob.status,
          job: retryJob,
        })
        const attemptRecord = parseAttemptStorageRecord({
          ...existingAttempt,
          storedAt: input.finishedAt,
          attempt: failedAttempt,
        })

        upsertJobRecord(jobRecord)
        upsertAttemptRecord(attemptRecord)
        insertRunnerAuditEvent({
          action: 'runner.attempt.retry-scheduled',
          actorId: existingJob.job.lease?.workerId ?? 'system:runner',
          job: retryJob,
          targetKind: 'runner-attempt',
          targetId: failedAttempt.attemptId,
          occurredAt: input.finishedAt,
          afterSummary: {
            jobId: retryJob.jobId,
            attemptId: failedAttempt.attemptId,
            attemptNumber: failedAttempt.attemptNumber,
            errorClass: input.errorClass,
            retryScheduledAt: input.retryScheduledAt,
          },
        })

        return Object.freeze({ jobRecord, attemptRecord, deadLetterRecord: null })
      }

      if (input.deadLetterId === null) {
        throw new Error('exhausted failures require deadLetterId')
      }

      const terminalJob = transitionJobStatus(existingJob.job, { status: 'dead-lettered', lease: null })
      const failedAttempt = parseAttempt({
        ...existingAttempt.attempt,
        status: 'failed',
        finishedAt: input.finishedAt,
        errorClass: input.errorClass,
        retryDecision: {
          action: 'dead-letter',
          reason: input.errorMessage,
          scheduledAt: null,
        },
      })
      const deadLetterRecord = parseDeadLetterStorageRecord({
        schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
        recordId: `dead_letter_record_${input.deadLetterId}`,
        storedAt: input.finishedAt,
        workflowRunId: terminalJob.workflowRunId,
        stepRunId: terminalJob.stepRunId,
        replayEligible: true,
        deadLetter: {
          schemaVersion: 1,
          deadLetterId: input.deadLetterId,
          jobId: terminalJob.jobId,
          workflowRunId: terminalJob.workflowRunId,
          stepRunId: terminalJob.stepRunId,
          finalError: {
            class: input.errorClass,
            message: input.errorMessage,
          },
          replay: {
            eligible: true,
            source: 'failed-step',
            reason: 'retry budget exhausted and job payload is replayable',
          },
          jobSnapshot: {
            idempotencyKey: terminalJob.idempotencyKey,
            payload: terminalJob.payload,
          },
          createdAt: input.finishedAt,
        },
      })
      const jobRecord = parseJobStorageRecord({
        ...existingJob,
        updatedAt: input.finishedAt,
        statusIndex: terminalJob.status,
        job: terminalJob,
      })
      const attemptRecord = parseAttemptStorageRecord({
        ...existingAttempt,
        storedAt: input.finishedAt,
        attempt: failedAttempt,
      })

      upsertJobRecord(jobRecord)
      upsertAttemptRecord(attemptRecord)
      insertDeadLetterRecord(deadLetterRecord)
      insertRunnerAuditEvent({
        action: 'runner.attempt.dead-lettered',
        actorId: existingJob.job.lease?.workerId ?? 'system:runner',
        job: terminalJob,
        targetKind: 'runner-attempt',
        targetId: failedAttempt.attemptId,
        occurredAt: input.finishedAt,
        afterSummary: {
          jobId: terminalJob.jobId,
          attemptId: failedAttempt.attemptId,
          attemptNumber: failedAttempt.attemptNumber,
          deadLetterId: deadLetterRecord.deadLetter.deadLetterId,
          errorClass: input.errorClass,
        },
      })

      return Object.freeze({ jobRecord, attemptRecord, deadLetterRecord })
    })

    return runImmediateTransaction(tx)
  }

  function listReplayableDeadLetters(input: ReplayQuery): DeadLetterStorageRecord[] {
    ensureSchema()
    const query = parseReplayQuery(input)
    const params: Array<string | number | null> = [query.workflowRunId]
    const clauses = ['workflow_run_id = ?']

    if (query.stepRunId === null) {
      clauses.push('step_run_id IS NULL')
    } else {
      clauses.push('step_run_id = ?')
      params.push(query.stepRunId)
    }

    if (query.onlyEligible) {
      clauses.push('replay_eligible = 1')
    }

    if (query.cursor !== null) {
      clauses.push('dead_letter_id > ?')
      params.push(query.cursor)
    }

    params.push(query.limit)

    const rows = db.prepare(`
      SELECT record_json FROM opzava_runner_dead_letters
      WHERE ${clauses.join(' AND ')}
      ORDER BY stored_at ASC, dead_letter_id ASC
      LIMIT ?
    `).all(...params) as JsonRow[]

    return rows.map((row) => parseDeadLetterStorageRecord(JSON.parse(row.record_json)))
  }

  function listOperationalEventsForWorkflowRun(workflowRunId: string): OperationalEventStorageRecord[] {
    ensureSchema()
    const rows = db.prepare(`
      SELECT record_json FROM opzava_runner_operational_events
      WHERE workflow_run_id = ?
      ORDER BY occurred_at ASC, rowid ASC
    `).all(workflowRunId) as JsonRow[]

    return rows.map((row) => parseOperationalEventStorageRecord(JSON.parse(row.record_json)))
  }

  function planExpiredLeaseRecovery(input: RecoveryPlanInput): RunnerRecoveryPlan {
    ensureSchema()
    const rows = db.prepare(`
      SELECT record_json FROM opzava_runner_jobs
      WHERE status = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
      ORDER BY lease_expires_at ASC, job_id ASC
      LIMIT 1000
    `).all(input.expiredLeaseCutoff) as JsonRow[]
    const jobsToRequeue = rows.map((row) => {
      const record = parseJobStorageRecord(JSON.parse(row.record_json))

      return {
        jobId: record.job.jobId,
        idempotencyKey: record.idempotencyKey,
        reason: 'lease expired before attempt finished',
      }
    })

    return parseRunnerRecoveryPlan({
      schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
      recoveryPlanId: input.recoveryPlanId,
      generatedAt: input.generatedAt,
      workerId: input.workerId,
      expiredLeaseCutoff: input.expiredLeaseCutoff,
      jobsToRequeue,
      jobsToDeadLetter: [],
    })
  }

  function executeExpiredLeaseRecovery(input: RecoveryPlanInput): RunnerRecoveryPlan {
    ensureSchema()

    // Scan and mutation share BEGIN IMMEDIATE so concurrent recovery runs serialize.
    const tx = db.transaction(() => {
      const rows = db.prepare(`
        SELECT record_json FROM opzava_runner_jobs
        WHERE status = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
        ORDER BY lease_expires_at ASC, job_id ASC
        LIMIT 1000
      `).all(input.expiredLeaseCutoff) as JsonRow[]
      const jobsToRequeue: RunnerRecoveryPlan['jobsToRequeue'] = []
      const jobsToDeadLetter: RunnerRecoveryPlan['jobsToDeadLetter'] = []

      for (const row of rows) {
        const existingJob = parseJobStorageRecord(JSON.parse(row.record_json))
        const runningAttempt = getRunningAttemptForJob(existingJob.job.jobId)
        if (!runningAttempt) {
          insertRunnerAuditEvent({
            action: 'runner.recovery.orphaned-lease',
            actorId: input.workerId,
            job: existingJob.job,
            targetKind: 'runner-job',
            targetId: existingJob.job.jobId,
            occurredAt: input.generatedAt,
            afterSummary: {
              jobId: existingJob.job.jobId,
              recoveryPlanId: input.recoveryPlanId,
              leasedWorkerId: existingJob.job.lease?.workerId ?? null,
              reason: 'leased job has no running attempt',
            },
          })
          continue
        }

        if (existingJob.job.attemptCount < existingJob.job.maxAttempts) {
          const queuedJob = transitionJobStatus(existingJob.job, { status: 'queued', lease: null })
          const retryJob = parseJob({
            ...queuedJob,
            scheduledAt: input.generatedAt,
          })
          const failedAttempt = parseAttempt({
            ...runningAttempt.attempt,
            status: 'failed',
            finishedAt: input.generatedAt,
            errorClass: 'timeout',
            retryDecision: {
              action: 'retry',
              reason: 'lease expired before attempt finished',
              scheduledAt: input.generatedAt,
            },
          })
          const jobRecord = parseJobStorageRecord({
            ...existingJob,
            updatedAt: input.generatedAt,
            statusIndex: retryJob.status,
            job: retryJob,
          })
          const attemptRecord = parseAttemptStorageRecord({
            ...runningAttempt,
            storedAt: input.generatedAt,
            attempt: failedAttempt,
          })

          upsertJobRecord(jobRecord)
          upsertAttemptRecord(attemptRecord)
          insertRunnerAuditEvent({
            action: 'runner.recovery.requeued',
            actorId: input.workerId,
            job: retryJob,
            targetKind: 'runner-attempt',
            targetId: failedAttempt.attemptId,
            occurredAt: input.generatedAt,
            afterSummary: {
              jobId: retryJob.jobId,
              attemptId: failedAttempt.attemptId,
              recoveryPlanId: input.recoveryPlanId,
              retryScheduledAt: input.generatedAt,
              reason: 'lease expired before attempt finished',
            },
          })
          jobsToRequeue.push({
            jobId: existingJob.job.jobId,
            idempotencyKey: existingJob.idempotencyKey,
            reason: 'lease expired before attempt finished',
          })
          continue
        }

        const terminalJob = transitionJobStatus(existingJob.job, { status: 'dead-lettered', lease: null })
        const failedAttempt = parseAttempt({
          ...runningAttempt.attempt,
          status: 'failed',
          finishedAt: input.generatedAt,
          errorClass: 'timeout',
          retryDecision: {
            action: 'dead-letter',
            reason: 'lease expired and retry budget is exhausted',
            scheduledAt: null,
          },
        })
        const deadLetterId = recoveryDeadLetterId(runningAttempt.attempt.attemptId)
        const deadLetterRecord = parseDeadLetterStorageRecord({
          schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
          recordId: `dead_letter_record_${deadLetterId}`,
          storedAt: input.generatedAt,
          workflowRunId: terminalJob.workflowRunId,
          stepRunId: terminalJob.stepRunId,
          replayEligible: true,
          deadLetter: {
            schemaVersion: 1,
            deadLetterId,
            jobId: terminalJob.jobId,
            workflowRunId: terminalJob.workflowRunId,
            stepRunId: terminalJob.stepRunId,
            finalError: {
              class: 'timeout',
              message: 'Lease expired before attempt finished',
            },
            replay: {
              eligible: true,
              source: 'failed-step',
              reason: 'lease expired and retry budget is exhausted',
            },
            jobSnapshot: {
              idempotencyKey: terminalJob.idempotencyKey,
              payload: terminalJob.payload,
            },
            createdAt: input.generatedAt,
          },
        })
        const jobRecord = parseJobStorageRecord({
          ...existingJob,
          updatedAt: input.generatedAt,
          statusIndex: terminalJob.status,
          job: terminalJob,
        })
        const attemptRecord = parseAttemptStorageRecord({
          ...runningAttempt,
          storedAt: input.generatedAt,
          attempt: failedAttempt,
        })

        upsertJobRecord(jobRecord)
        upsertAttemptRecord(attemptRecord)
        insertDeadLetterRecord(deadLetterRecord)
        insertRunnerAuditEvent({
          action: 'runner.recovery.dead-lettered',
          actorId: input.workerId,
          job: terminalJob,
          targetKind: 'runner-attempt',
          targetId: failedAttempt.attemptId,
          occurredAt: input.generatedAt,
          afterSummary: {
            jobId: terminalJob.jobId,
            attemptId: failedAttempt.attemptId,
            recoveryPlanId: input.recoveryPlanId,
            deadLetterId: deadLetterRecord.deadLetter.deadLetterId,
            reason: 'lease expired and retry budget is exhausted',
          },
        })
        jobsToDeadLetter.push({
          jobId: existingJob.job.jobId,
          idempotencyKey: existingJob.idempotencyKey,
          reason: 'lease expired and retry budget is exhausted',
        })
      }

      return parseRunnerRecoveryPlan({
        schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
        recoveryPlanId: input.recoveryPlanId,
        generatedAt: input.generatedAt,
        workerId: input.workerId,
        expiredLeaseCutoff: input.expiredLeaseCutoff,
        jobsToRequeue,
        jobsToDeadLetter,
      })
    })

    return runImmediateTransaction(tx)
  }

  return Object.freeze({
    ensureSchema,
    saveJob,
    getJobById,
    getJobByIdempotencyKey,
    getAttemptById,
    getDeadLetterById,
    appendAttempt,
    appendDeadLetter,
    appendOperationalEvent,
    leaseNextJobForAttempt,
    recordAttemptSuccess,
    recordAttemptFailure,
    listReplayableDeadLetters,
    listOperationalEventsForWorkflowRun,
    planExpiredLeaseRecovery,
    executeExpiredLeaseRecovery,
  })

  function upsertJobRecord(record: JobStorageRecord): void {
    db.prepare(`
      INSERT INTO opzava_runner_jobs (
        job_id, workflow_run_id, step_run_id, status, priority, idempotency_key,
        scheduled_at, lease_expires_at, record_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(job_id) DO UPDATE SET
        workflow_run_id = excluded.workflow_run_id,
        step_run_id = excluded.step_run_id,
        status = excluded.status,
        priority = excluded.priority,
        idempotency_key = excluded.idempotency_key,
        scheduled_at = excluded.scheduled_at,
        lease_expires_at = excluded.lease_expires_at,
        record_json = excluded.record_json,
        updated_at = excluded.updated_at
    `).run(
      record.job.jobId,
      record.workflowRunId,
      record.stepRunId,
      record.statusIndex,
      record.job.priority,
      record.idempotencyKey,
      record.job.scheduledAt,
      record.job.lease?.expiresAt ?? null,
      JSON.stringify(record),
      record.storedAt,
      record.updatedAt,
    )
  }

  function insertAttemptRecord(record: AttemptStorageRecord): void {
    db.prepare(`
      INSERT INTO opzava_runner_attempts (attempt_id, job_id, attempt_number, status, stored_at, record_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.attempt.attemptId,
      record.jobId,
      record.attemptNumber,
      record.attempt.status,
      record.storedAt,
      JSON.stringify(record),
    )
  }

  function upsertAttemptRecord(record: AttemptStorageRecord): void {
    db.prepare(`
      INSERT INTO opzava_runner_attempts (attempt_id, job_id, attempt_number, status, stored_at, record_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(attempt_id) DO UPDATE SET
        job_id = excluded.job_id,
        attempt_number = excluded.attempt_number,
        status = excluded.status,
        stored_at = excluded.stored_at,
        record_json = excluded.record_json
    `).run(
      record.attempt.attemptId,
      record.jobId,
      record.attemptNumber,
      record.attempt.status,
      record.storedAt,
      JSON.stringify(record),
    )
  }

  function insertDeadLetterRecord(record: DeadLetterStorageRecord): void {
    db.prepare(`
      INSERT INTO opzava_runner_dead_letters (
        dead_letter_id, job_id, workflow_run_id, step_run_id, replay_eligible, stored_at, record_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.deadLetter.deadLetterId,
      record.deadLetter.jobId,
      record.workflowRunId,
      record.stepRunId,
      record.replayEligible ? 1 : 0,
      record.storedAt,
      JSON.stringify(record),
    )
  }

  function insertOperationalEventRecord(record: OperationalEventStorageRecord): void {
    db.prepare(`
      INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.recordId,
      record.kind,
      record.workflowRunId,
      record.stepRunId,
      record.occurredAt,
      JSON.stringify(record),
    )
  }

  function insertRunnerAuditEvent(input: RunnerAuditInput): void {
    const auditEventId = `audit_${shortDigest(`${input.action}:${input.targetId}:${input.occurredAt}`)}`
    const record = parseOperationalEventStorageRecord({
      schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
      recordId: `operational_event_${auditEventId}`,
      kind: 'audit',
      workflowRunId: input.job.workflowRunId,
      stepRunId: input.job.stepRunId,
      occurredAt: input.occurredAt,
      event: {
        schemaVersion: 1,
        auditEventId,
        actorId: input.actorId,
        action: input.action,
        target: {
          kind: input.targetKind,
          id: input.targetId,
        },
        beforeSummary: null,
        afterSummary: input.afterSummary,
        correlationId: input.job.workflowRunId,
        occurredAt: input.occurredAt,
      },
    })

    insertOperationalEventRecord(record)
  }

  function requireJob(jobId: string): JobStorageRecord {
    const job = getJobById(jobId)
    if (!job) throw new Error(`job not found: ${jobId}`)
    return job
  }

  function requireAttempt(attemptId: string): AttemptStorageRecord {
    const attempt = getAttemptById(attemptId)
    if (!attempt) throw new Error(`attempt not found: ${attemptId}`)
    return attempt
  }

  function getRunningAttemptForJob(jobId: string): AttemptStorageRecord | null {
    const row = db.prepare(`
      SELECT record_json FROM opzava_runner_attempts
      WHERE job_id = ? AND status = 'running'
      ORDER BY attempt_number DESC, rowid DESC
      LIMIT 1
    `).get(jobId) as JsonRow | undefined

    return row ? parseAttemptStorageRecord(JSON.parse(row.record_json)) : null
  }

  function assertAttemptBelongsToJob(attempt: AttemptStorageRecord, jobId: string): void {
    if (attempt.jobId !== jobId) {
      throw new Error(`attempt ${attempt.attempt.attemptId} does not belong to job ${jobId}`)
    }
  }

  function assertLeasedJobWithRunningAttempt(job: JobStorageRecord, attempt: AttemptStorageRecord): void {
    if (job.job.status !== 'leased') {
      throw new Error(`job ${job.job.jobId} is not leased`)
    }

    if (attempt.attempt.status !== 'running') {
      throw new Error(`attempt ${attempt.attempt.attemptId} is not running`)
    }
  }
}

function runImmediateTransaction<T>(tx: ImmediateTransaction<T>): T {
  let lastBusyError: unknown = null

  for (let attempt = 1; attempt <= IMMEDIATE_TRANSACTION_MAX_ATTEMPTS; attempt += 1) {
    try {
      return tx.immediate()
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt === IMMEDIATE_TRANSACTION_MAX_ATTEMPTS) {
        throw error
      }

      lastBusyError = error
    }
  }

  throw lastBusyError
}

function isSqliteBusyError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const code = 'code' in error ? error.code : null
  return code === 'SQLITE_BUSY'
}

function recoveryDeadLetterId(attemptId: string): string {
  return `dead_letter_${shortDigest(attemptId)}`
}

function shortDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

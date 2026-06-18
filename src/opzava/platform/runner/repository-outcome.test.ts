import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { parseJob, type Job } from './contracts'
import { parseJobStorageRecord } from './repository-contracts'
import { createRunnerRepository } from './repository'

describe('Opzava runner attempt outcomes', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function repository() {
    db = new Database(':memory:')
    return createRunnerRepository(db)
  }

  it('marks a running attempt and its leased job succeeded in one transaction', () => {
    const repo = repository()
    const job = baseJob({ jobId: 'job_success_001' })
    repo.saveJob(jobRecord(job))
    const lease = repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_success_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })

    const outcome = repo.recordAttemptSuccess({
      jobId: job.jobId,
      attemptId: 'attempt_success_001',
      finishedAt: '2026-06-15T00:02:00.000Z',
    })

    expect(lease?.attemptRecord.attempt.status).toBe('running')
    expect(outcome.jobRecord.job.status).toBe('succeeded')
    expect(outcome.jobRecord.job.lease).toBeNull()
    expect(outcome.attemptRecord.attempt.status).toBe('succeeded')
    expect(outcome.attemptRecord.attempt.finishedAt).toBe('2026-06-15T00:02:00.000Z')
    expect(repo.getJobById(job.jobId)?.job.status).toBe('succeeded')
    expect(repo.getAttemptById('attempt_success_001')?.attempt.status).toBe('succeeded')
  })

  it('records a retryable failure and requeues the job at the retry time', () => {
    const repo = repository()
    const job = baseJob({ jobId: 'job_retry_001' })
    repo.saveJob(jobRecord(job))
    repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_retry_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })

    const outcome = repo.recordAttemptFailure({
      jobId: job.jobId,
      attemptId: 'attempt_retry_001',
      finishedAt: '2026-06-15T00:02:00.000Z',
      errorClass: 'timeout',
      errorMessage: 'Provider timed out before returning a response',
      retryScheduledAt: '2026-06-15T00:07:00.000Z',
      deadLetterId: null,
    })

    expect(outcome.jobRecord.job.status).toBe('queued')
    expect(outcome.jobRecord.job.lease).toBeNull()
    expect(outcome.jobRecord.job.scheduledAt).toBe('2026-06-15T00:07:00.000Z')
    expect(outcome.attemptRecord.attempt.status).toBe('failed')
    expect(outcome.attemptRecord.attempt.retryDecision.action).toBe('retry')
    expect(outcome.deadLetterRecord).toBeNull()
  })

  it('records an exhausted failure, dead-letters the job, and preserves replay context', () => {
    const repo = repository()
    const job = parseJob({
      ...baseJob({ jobId: 'job_dead_letter_001' }),
      attemptCount: 2,
      maxAttempts: 3,
    })
    repo.saveJob(jobRecord(job))
    repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_dead_letter_003',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })

    const outcome = repo.recordAttemptFailure({
      jobId: job.jobId,
      attemptId: 'attempt_dead_letter_003',
      finishedAt: '2026-06-15T00:02:00.000Z',
      errorClass: 'provider-error',
      errorMessage: 'Provider returned a terminal failure',
      retryScheduledAt: null,
      deadLetterId: 'dead_letter_job_dead_letter_001',
    })

    expect(outcome.jobRecord.job.status).toBe('dead-lettered')
    expect(outcome.jobRecord.job.lease).toBeNull()
    expect(outcome.attemptRecord.attempt.retryDecision.action).toBe('dead-letter')
    expect(outcome.deadLetterRecord?.deadLetter.jobId).toBe(job.jobId)
    expect(outcome.deadLetterRecord?.deadLetter.jobSnapshot.idempotencyKey).toBe(job.idempotencyKey)
    expect(repo.getDeadLetterById('dead_letter_job_dead_letter_001')?.deadLetter.replay.eligible).toBe(true)
  })

  it('rejects duplicate success recording without mutating the completed attempt', () => {
    const repo = repository()
    const job = baseJob({ jobId: 'job_duplicate_success_001' })
    repo.saveJob(jobRecord(job))
    repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_duplicate_success_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })
    repo.recordAttemptSuccess({
      jobId: job.jobId,
      attemptId: 'attempt_duplicate_success_001',
      finishedAt: '2026-06-15T00:02:00.000Z',
    })

    expect(() => repo.recordAttemptSuccess({
      jobId: job.jobId,
      attemptId: 'attempt_duplicate_success_001',
      finishedAt: '2026-06-15T00:03:00.000Z',
    })).toThrow(/not leased|not running/i)
    expect(repo.getAttemptById('attempt_duplicate_success_001')?.attempt.finishedAt).toBe('2026-06-15T00:02:00.000Z')
    expect(repo.getJobById(job.jobId)?.job.status).toBe('succeeded')
  })

  it('rejects failure recording when the leased job and running attempt do not match', () => {
    const repo = repository()
    const first = baseJob({ jobId: 'job_stale_first_001', priority: 90 })
    const second = baseJob({ jobId: 'job_stale_second_001', priority: 80 })
    repo.saveJob(jobRecord(first))
    repo.saveJob(jobRecord(second))
    repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_stale_first_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })
    repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_stale_second_001',
      leasedAt: '2026-06-15T00:01:30.000Z',
      leaseExpiresAt: '2026-06-15T00:06:30.000Z',
    })

    expect(() => repo.recordAttemptFailure({
      jobId: second.jobId,
      attemptId: 'attempt_stale_first_001',
      finishedAt: '2026-06-15T00:02:00.000Z',
      errorClass: 'timeout',
      errorMessage: 'Mismatched stale attempt should not mutate another job',
      retryScheduledAt: '2026-06-15T00:07:00.000Z',
      deadLetterId: null,
    })).toThrow(/does not belong/i)
    expect(repo.getJobById(second.jobId)?.job.status).toBe('leased')
    expect(repo.getAttemptById('attempt_stale_first_001')?.attempt.status).toBe('running')
  })

  it('rejects retry scheduling at or before the failed attempt finish time', () => {
    const repo = repository()
    const job = baseJob({ jobId: 'job_invalid_retry_001' })
    repo.saveJob(jobRecord(job))
    repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_invalid_retry_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })

    expect(() => repo.recordAttemptFailure({
      jobId: job.jobId,
      attemptId: 'attempt_invalid_retry_001',
      finishedAt: '2026-06-15T00:02:00.000Z',
      errorClass: 'timeout',
      errorMessage: 'Retry cannot be scheduled in the past',
      retryScheduledAt: '2026-06-15T00:02:00.000Z',
      deadLetterId: null,
    })).toThrow(/retry time/i)
    expect(repo.getJobById(job.jobId)?.job.status).toBe('leased')
    expect(repo.getAttemptById('attempt_invalid_retry_001')?.attempt.status).toBe('running')
  })
})

function baseJob(overrides: Partial<Job> = {}): Job {
  return parseJob({
    schemaVersion: 1,
    jobId: 'job_content_seo_brief_001',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_seo_brief_001',
    status: 'queued',
    idempotencyKey: `workflow:run_001:step:${overrides.jobId ?? 'seo-brief'}:v1`,
    payload: {
      inputArtifactIds: ['artifact_idea_001'],
    },
    priority: 50,
    scheduledAt: '2026-06-15T00:00:00.000Z',
    lease: null,
    attemptCount: 0,
    maxAttempts: 3,
    ...overrides,
  })
}

function jobRecord(job: Job) {
  return parseJobStorageRecord({
    schemaVersion: 1,
    recordId: `job_record_${job.jobId}`,
    storedAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    statusIndex: job.status,
    workflowRunId: job.workflowRunId,
    stepRunId: job.stepRunId,
    idempotencyKey: job.idempotencyKey,
    job,
  })
}

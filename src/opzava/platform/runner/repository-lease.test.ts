import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { parseJob, type Job } from './contracts'
import { parseJobStorageRecord } from './repository-contracts'
import { createRunnerRepository } from './repository'

describe('Opzava runner lease acquisition', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function repository() {
    db = new Database(':memory:')
    return createRunnerRepository(db)
  }

  it('atomically leases the highest priority due job and creates a running attempt', () => {
    const repo = repository()
    const lowPriority = baseJob({ jobId: 'job_low_priority', priority: 10, scheduledAt: '2026-06-15T00:00:00.000Z' })
    const highPriority = baseJob({ jobId: 'job_high_priority', priority: 90, scheduledAt: '2026-06-15T00:00:00.000Z' })

    repo.saveJob(jobRecord(lowPriority))
    repo.saveJob(jobRecord(highPriority))

    const lease = repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_high_priority_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })

    expect(lease?.jobRecord.job.jobId).toBe(highPriority.jobId)
    expect(lease?.jobRecord.job.status).toBe('leased')
    expect(lease?.jobRecord.job.attemptCount).toBe(1)
    expect(lease?.attemptRecord.attempt.status).toBe('running')
    expect(lease?.attemptRecord.attempt.attemptNumber).toBe(1)
    expect(repo.getJobById(highPriority.jobId)?.job.lease?.workerId).toBe('worker:local:1')
    expect(repo.getJobById(lowPriority.jobId)?.job.status).toBe('queued')
  })

  it('does not lease future-scheduled jobs', () => {
    const repo = repository()
    const future = baseJob({
      jobId: 'job_future_scheduled',
      priority: 100,
      scheduledAt: '2026-06-15T01:00:00.000Z',
    })

    repo.saveJob(jobRecord(future))

    const lease = repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_future_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })

    expect(lease).toBeNull()
    expect(repo.getJobById(future.jobId)?.job.status).toBe('queued')
  })

  it('does not lease jobs that have exhausted their attempt budget', () => {
    const repo = repository()
    const exhausted = parseJob({
      ...baseJob({ jobId: 'job_exhausted' }),
      attemptCount: 3,
      maxAttempts: 3,
    })

    repo.saveJob(jobRecord(exhausted))

    const lease = repo.leaseNextJobForAttempt({
      workerId: 'worker:local:1',
      attemptId: 'attempt_exhausted_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:06:00.000Z',
    })

    expect(lease).toBeNull()
    expect(repo.getJobById(exhausted.jobId)?.job.status).toBe('queued')
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

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseJob, type Job } from './contracts'
import { parseJobStorageRecord } from './repository-contracts'
import { createRunnerRepository } from './repository'
import { createExponentialRetryPolicy } from './retry-policy'
import { createRunnerWorker, RunnerExecutionError } from './worker'

describe('Opzava runner worker boundary', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function repository() {
    db = new Database(':memory:')
    return createRunnerRepository(db)
  }

  it('returns idle without calling the executor when no job is due', async () => {
    const repo = repository()
    const execute = vi.fn(async () => undefined)
    const worker = createRunnerWorker({
      repository: repo,
      executor: { execute },
      ...workerOptions(),
    })

    const result = await worker.runNext()

    expect(result.status).toBe('idle')
    expect(execute).not.toHaveBeenCalled()
  })

  it('rejects execution timeouts that outlive the lease', () => {
    const repo = repository()

    expect(() => createRunnerWorker({
      repository: repo,
      executor: { execute: async () => undefined },
      ...workerOptions({ leaseDurationMs: 1_000, executionTimeoutMs: 2_000 }),
    })).toThrow(/executionTimeoutMs must not exceed leaseDurationMs/)
  })

  it('leases one due job, executes it, and records success', async () => {
    const repo = repository()
    const job = baseJob({ jobId: 'job_worker_success_001' })
    const execute = vi.fn(async () => undefined)
    repo.saveJob(jobRecord(job))
    const worker = createRunnerWorker({
      repository: repo,
      executor: { execute },
      ...workerOptions(),
    })

    const result = await worker.runNext()

    expect(result.status).toBe('succeeded')
    if (result.status !== 'succeeded') throw new Error('expected worker success')
    expect(result.jobId).toBe(job.jobId)
    expect(execute).toHaveBeenCalledOnce()
    expect(repo.getJobById(job.jobId)?.job.status).toBe('succeeded')
    expect(repo.getAttemptById('attempt_worker_001')?.attempt.status).toBe('succeeded')
    expect(auditActions(repo, job.workflowRunId)).toEqual(['runner.attempt.succeeded'])
  })

  it('records retryable execution failures and schedules retry through the injected retry policy', async () => {
    const repo = repository()
    const job = baseJob({ jobId: 'job_worker_retry_001' })
    repo.saveJob(jobRecord(job))
    const worker = createRunnerWorker({
      repository: repo,
      executor: {
        execute: async () => {
          throw new RunnerExecutionError('provider-error', 'provider rejected the request')
        },
      },
      ...workerOptions(),
    })

    const result = await worker.runNext()

    expect(result.status).toBe('failed-retry')
    expect(repo.getJobById(job.jobId)?.job.status).toBe('queued')
    // The retry policy applies per-call jitter (0..25% of base) on top of the deterministic
    // 2 min initial delay, so scheduledAt lands in [00:03:00, 00:03:30] rather than an exact instant.
    const scheduledAt = repo.getJobById(job.jobId)?.job.scheduledAt ?? ''
    expect(scheduledAt >= '2026-06-15T00:03:00.000Z').toBe(true)
    expect(scheduledAt <= '2026-06-15T00:03:30.000Z').toBe(true)
    expect(repo.getAttemptById('attempt_worker_001')?.attempt.errorClass).toBe('provider-error')
    expect(repo.getAttemptById('attempt_worker_001')?.attempt.retryDecision.action).toBe('retry')
    expect(auditActions(repo, job.workflowRunId)).toEqual(['runner.attempt.retry-scheduled'])
  })

  it('dead-letters execution failures when the leased attempt exhausts the retry budget', async () => {
    const repo = repository()
    const job = parseJob({
      ...baseJob({ jobId: 'job_worker_dead_letter_001' }),
      attemptCount: 2,
      maxAttempts: 3,
    })
    repo.saveJob(jobRecord(job))
    const worker = createRunnerWorker({
      repository: repo,
      executor: {
        execute: async () => {
          throw new RunnerExecutionError('provider-error', 'provider terminal failure')
        },
      },
      ...workerOptions(),
    })

    const result = await worker.runNext()

    expect(result.status).toBe('failed-dead-letter')
    expect(repo.getJobById(job.jobId)?.job.status).toBe('dead-lettered')
    expect(repo.getAttemptById('attempt_worker_001')?.attempt.retryDecision.action).toBe('dead-letter')
    expect(repo.getDeadLetterById('dead_letter_worker_001')?.deadLetter.jobSnapshot.idempotencyKey).toBe(job.idempotencyKey)
    expect(auditActions(repo, job.workflowRunId)).toEqual(['runner.attempt.dead-lettered'])
  })

  it('aborts timed-out execution and records a timeout failure', async () => {
    const repo = repository()
    const job = baseJob({ jobId: 'job_worker_timeout_001' })
    let aborted = false
    repo.saveJob(jobRecord(job))
    const worker = createRunnerWorker({
      repository: repo,
      executor: {
        execute: (_job, _attempt, signal) => {
          signal.addEventListener('abort', () => {
            aborted = true
          })
          return new Promise(() => undefined)
        },
      },
      ...workerOptions({ executionTimeoutMs: 5 }),
    })

    const result = await worker.runNext()

    expect(result.status).toBe('failed-retry')
    expect(aborted).toBe(true)
    expect(repo.getAttemptById('attempt_worker_001')?.attempt.errorClass).toBe('timeout')
    expect(auditActions(repo, job.workflowRunId)).toEqual(['runner.attempt.retry-scheduled'])
  })
})

function auditActions(repo: ReturnType<typeof createRunnerRepository>, workflowRunId: string): string[] {
  return repo.listOperationalEventsForWorkflowRun(workflowRunId).map((record) => {
    if (record.kind !== 'audit') throw new Error(`unexpected operational event kind: ${record.kind}`)
    return (record.event as { action: string }).action
  })
}

function workerOptions(overrides: Partial<Parameters<typeof createRunnerWorker>[0]> = {}) {
  return {
    workerId: 'worker:unit:1',
    leaseDurationMs: 5 * 60 * 1000,
    executionTimeoutMs: 30_000,
    retryPolicy: createExponentialRetryPolicy({
      initialDelayMs: 2 * 60_000,
      multiplier: 2,
      maxDelayMs: 10 * 60_000,
    }),
    clock: { now: () => new Date('2026-06-15T00:01:00.000Z') },
    ids: {
      attemptId: () => 'attempt_worker_001',
      deadLetterId: () => 'dead_letter_worker_001',
    },
    ...overrides,
  }
}

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

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { parseJob, type Job } from '../../../platform/runner/contracts'
import { parseJobStorageRecord } from '../../../platform/runner/repository-contracts'
import { createRunnerRepository } from '../../../platform/runner/repository'
import { createExponentialRetryPolicy } from '../../../platform/runner/retry-policy'
import { createRunnerWorker } from '../../../platform/runner/worker'
import { createContentStepExecutor } from './step-service'
import { ideaIntakeStepService } from './idea-intake-service'

let db: Database.Database | null = null

afterEach(() => {
  db?.close()
  db = null
})

function repository() {
  db = new Database(':memory:')
  return createRunnerRepository(db)
}

function workerOptions(overrides = {}) {
  return {
    workerId: 'worker:unit:1',
    leaseDurationMs: 5 * 60 * 1000,
    executionTimeoutMs: 30_000,
    retryPolicy: createExponentialRetryPolicy({
      initialDelayMs: 2 * 60_000,
      multiplier: 2,
      maxDelayMs: 10 * 60_000
    }),
    clock: { now: () => new Date('2026-06-15T00:01:00.000Z') },
    ids: {
      attemptId: () => 'attempt_worker_001',
      deadLetterId: () => 'dead_letter_worker_001'
    },
    ...overrides
  }
}

function baseJob(overrides: Partial<Job> = {}): Job {
  return parseJob({
    schemaVersion: 1,
    jobId: 'job_idea_intake_001',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_idea_intake_001',
    status: 'queued',
    idempotencyKey: 'workflow:run_001:step:idea-intake:v1',
    payload: { inputArtifactIds: [] },
    priority: 50,
    scheduledAt: '2026-06-15T00:00:00.000Z',
    lease: null,
    attemptCount: 0,
    maxAttempts: 3,
    ...overrides
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
    job
  })
}

const VALID_INPUT = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'A Topic',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
}

describe('createContentStepExecutor via the durable runner', () => {
  it('runs the idea-intake step through the durable runner and captures the intake record', async () => {
    const repo = repository()
    let captured: ReturnType<typeof ideaIntakeStepService.run> | null = null
    const job = baseJob({ payload: VALID_INPUT })
    repo.saveJob(jobRecord(job))

    const worker = createRunnerWorker({
      repository: repo,
      executor: createContentStepExecutor({
        service: ideaIntakeStepService,
        parseInput: (x) => x,
        onResult: (r) => { captured = r }
      }),
      ...workerOptions()
    })

    const result = await worker.runNext()

    expect(result.status).toBe('succeeded')
    expect(captured).not.toBeNull()
    expect(captured!.record).toEqual(VALID_INPUT)
    expect(captured!.output).toEqual({ kind: 'intake-record', recordType: 'idea-intake' })
    expect(repo.getJobById(job.jobId)?.job.status).toBe('succeeded')
  })

  it('fails the job when the manual input is malformed', async () => {
    const repo = repository()
    const job = baseJob({ jobId: 'job_idea_intake_bad_001', payload: { not: 'valid' } })
    repo.saveJob(jobRecord(job))

    const worker = createRunnerWorker({
      repository: repo,
      executor: createContentStepExecutor({
        service: ideaIntakeStepService,
        parseInput: (x) => x,
        onResult: () => {}
      }),
      ...workerOptions()
    })

    const result = await worker.runNext()

    expect(result.status).toBe('failed-retry')
    expect(repo.getJobById(job.jobId)?.job.status).toBe('queued')
  })
})

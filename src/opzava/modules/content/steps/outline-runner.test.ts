import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'
import { parseJob, type Job } from '../../../platform/runner/contracts'
import { parseJobStorageRecord } from '../../../platform/runner/repository-contracts'
import { createRunnerRepository } from '../../../platform/runner/repository'
import { createExponentialRetryPolicy } from '../../../platform/runner/retry-policy'
import { createRunnerWorker } from '../../../platform/runner/worker'
import { createContentStepExecutor } from './step-service'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { parseKeywordResearch } from '../contracts/keyword-research'
import { parseSourceCapture } from '../contracts/source-capture'
import { createKeywordResearchStepService } from './keyword-research-service'
import { createMockKeywordResearchProvider } from './keyword-research-provider'
import { createSourceCaptureStepService } from './source-capture-service'
import { createMockSourceCaptureProvider } from './source-capture-provider'
import { createSeoBriefStepService } from './seo-brief-service'
import { createMockSeoBriefProvider } from './seo-brief-provider'
import { createOutlineStepService, parseOutlineStepInput } from './outline-service'
import { createMockOutlineProvider } from './outline-provider'

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
    jobId: 'job_outline_001',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_outline_001',
    status: 'queued',
    idempotencyKey: 'workflow:run_001:step:outline:v1',
    payload: { inputArtifactIds: [] },
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

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  targetAudience: 'Coffee lovers',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z',
}

function briefRecord() {
  const idea = parseIdeaIntake(VALID_IDEA)
  let n = 0
  const kw = createKeywordResearchStepService({
    provider: createMockKeywordResearchProvider(),
    newId: () => `kw_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z',
  }).run({ idea, sourceStepRunId: 'sr_kw' })
  let m = 0
  const sc = createSourceCaptureStepService({
    provider: createMockSourceCaptureProvider(),
    newId: () => `sc_${++m}`,
    now: () => '2026-06-17T00:00:00.000Z',
  }).run({ idea, sourceStepRunId: 'sr_sc' })
  let b = 0
  return createSeoBriefStepService({
    provider: createMockSeoBriefProvider(),
    newId: () => `brief_${++b}`,
    now: () => '2026-06-17T00:00:00.000Z',
  }).run({
    idea,
    keywordResearchArtifact: kw.record,
    keywordResearch: parseKeywordResearch(kw.record.content),
    sourceCaptureArtifact: sc.record,
    sourceCapture: parseSourceCapture(sc.record.content),
    sourceStepRunId: 'sr_brief',
  }).record
}

function service() {
  let n = 0
  return createOutlineStepService({
    provider: createMockOutlineProvider(),
    newId: () => `outline_id_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z',
  })
}

describe('outline step runner', () => {
  it('runs outline through the durable runner and captures the artifact', async () => {
    const repo = repository()
    let captured: { record: { artifactType: string }; output: unknown } | null = null
    const job = baseJob({
      payload: {
        idea: VALID_IDEA,
        seoBriefArtifact: briefRecord(),
        sourceStepRunId: 'step_run_outline_001',
      },
    })
    repo.saveJob(jobRecord(job))
    const worker = createRunnerWorker({
      repository: repo,
      executor: createContentStepExecutor({
        service: service(),
        parseInput: parseOutlineStepInput,
        onResult: (r) => {
          captured = r as unknown as { record: { artifactType: string }; output: unknown }
        },
      }),
      ...workerOptions(),
    })
    const result = await worker.runNext()
    expect(result.status).toBe('succeeded')
    expect(captured).not.toBeNull()
    expect(captured!.record.artifactType).toBe('outline')
    expect(captured!.output).toEqual({ kind: 'artifact', artifactType: 'outline' })
    expect(repo.getJobById(job.jobId)?.job.status).toBe('succeeded')
  })

  it('fails the job when the upstream artifact is malformed', async () => {
    const repo = repository()
    const job = baseJob({
      jobId: 'job_outline_bad_001',
      payload: {
        idea: VALID_IDEA,
        seoBriefArtifact: { not: 'an artifact' },
        sourceStepRunId: 'step_run_outline_001',
      },
    })
    repo.saveJob(jobRecord(job))
    const worker = createRunnerWorker({
      repository: repo,
      executor: createContentStepExecutor({
        service: service(),
        parseInput: parseOutlineStepInput,
        onResult: () => {},
      }),
      ...workerOptions(),
    })
    const result = await worker.runNext()
    expect(result.status).toBe('failed-retry')
    expect(repo.getJobById(job.jobId)?.job.status).toBe('queued')
  })
})

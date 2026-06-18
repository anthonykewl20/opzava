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
import { parseSeoBrief } from '../contracts/seo-brief'
import { parseOutline } from '../contracts/outline'
import { createKeywordResearchStepService } from './keyword-research-service'
import { createMockKeywordResearchProvider } from './keyword-research-provider'
import { createSourceCaptureStepService } from './source-capture-service'
import { createMockSourceCaptureProvider } from './source-capture-provider'
import { createSeoBriefStepService } from './seo-brief-service'
import { createMockSeoBriefProvider } from './seo-brief-provider'
import { createOutlineStepService } from './outline-service'
import { createMockOutlineProvider } from './outline-provider'
import { createArticleDraftStepService } from './article-draft-service'
import { createMockArticleDraftProvider } from './article-draft-provider'
import { createFactCheckStepService, parseFactCheckStepInput } from './fact-check-service'
import { createMockFactCheckProvider } from './fact-check-provider'

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
    retryPolicy: createExponentialRetryPolicy({ initialDelayMs: 2 * 60_000, multiplier: 2, maxDelayMs: 10 * 60_000 }),
    clock: { now: () => new Date('2026-06-15T00:01:00.000Z') },
    ids: { attemptId: () => 'attempt_worker_001', deadLetterId: () => 'dead_letter_worker_001' },
    ...overrides
  }
}

function baseJob(overrides: Partial<Job> = {}): Job {
  return parseJob({
    schemaVersion: 1,
    jobId: 'job_fc_001',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_fc_001',
    status: 'queued',
    idempotencyKey: 'workflow:run_001:step:fact-check:v1',
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

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  targetAudience: 'Coffee lovers',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
}

function upstreamPayload() {
  const idea = parseIdeaIntake(VALID_IDEA)
  const now = () => '2026-06-17T00:00:00.000Z'
  let n = 0
  const kw = createKeywordResearchStepService({ provider: createMockKeywordResearchProvider(), newId: () => `kw_${++n}`, now }).run({ idea, sourceStepRunId: 'sr' })
  let m = 0
  const sc = createSourceCaptureStepService({ provider: createMockSourceCaptureProvider(), newId: () => `sc_${++m}`, now }).run({ idea, sourceStepRunId: 'sr' })
  let b = 0
  const brief = createSeoBriefStepService({ provider: createMockSeoBriefProvider(), newId: () => `brief_${++b}`, now }).run({ idea, keywordResearchArtifact: kw.record, keywordResearch: parseKeywordResearch(kw.record.content), sourceCaptureArtifact: sc.record, sourceCapture: parseSourceCapture(sc.record.content), sourceStepRunId: 'sr' })
  let o = 0
  const outline = createOutlineStepService({ provider: createMockOutlineProvider(), newId: () => `o_${++o}`, now }).run({ idea, seoBriefArtifact: brief.record, seoBrief: parseSeoBrief(brief.record.content), sourceStepRunId: 'sr' })
  let d = 0
  const draft = createArticleDraftStepService({ provider: createMockArticleDraftProvider(), newId: () => `d_${++d}`, now }).run({ idea, outlineArtifact: outline.record, outline: parseOutline(outline.record.content), sourceCaptureArtifact: sc.record, sourceCapture: parseSourceCapture(sc.record.content), sourceStepRunId: 'sr' })
  return { articleDraftArtifact: draft.record, sourceCaptureArtifact: sc.record, sourceStepRunId: 'step_run_fc_001' }
}

function service() {
  let n = 0
  return createFactCheckStepService({ provider: createMockFactCheckProvider(), newId: () => `fc_id_${++n}`, now: () => '2026-06-17T00:00:00.000Z' })
}

describe('fact-check-runner', () => {
  it('runs fact-check through the durable runner and captures the report', async () => {
    const repo = repository()
    let captured: { record: { artifactType: string }; output: unknown } | null = null
    const job = baseJob({ payload: upstreamPayload() })
    repo.saveJob(jobRecord(job))
    const worker = createRunnerWorker({
      repository: repo,
      executor: createContentStepExecutor({
        service: service(),
        parseInput: parseFactCheckStepInput,
        onResult: (r) => { captured = r as unknown as { record: { artifactType: string }; output: unknown } }
      }),
      ...workerOptions()
    })
    const result = await worker.runNext()
    expect(result.status).toBe('succeeded')
    expect(captured).not.toBeNull()
    expect(captured!.record.artifactType).toBe('fact-check-report')
    expect(captured!.output).toEqual({ kind: 'artifact', artifactType: 'fact-check-report' })
    expect(repo.getJobById(job.jobId)?.job.status).toBe('succeeded')
  })

  it('fails the job when an upstream artifact is malformed', async () => {
    const repo = repository()
    const job = baseJob({
      jobId: 'job_fc_bad_001',
      payload: {
        articleDraftArtifact: { not: 'an artifact' },
        sourceCaptureArtifact: { not: 'an artifact' },
        sourceStepRunId: 'step_run_fc_001'
      }
    })
    repo.saveJob(jobRecord(job))
    const worker = createRunnerWorker({
      repository: repo,
      executor: createContentStepExecutor({
        service: service(),
        parseInput: parseFactCheckStepInput,
        onResult: () => {}
      }),
      ...workerOptions()
    })
    const result = await worker.runNext()
    expect(result.status).toBe('failed-retry')
    expect(repo.getJobById(job.jobId)?.job.status).toBe('queued')
  })
})

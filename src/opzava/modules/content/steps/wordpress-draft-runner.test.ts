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
import { parseArticleDraft } from '../contracts/article-draft'
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
import { createFactCheckStepService } from './fact-check-service'
import { createMockFactCheckProvider } from './fact-check-provider'
import { createBrandReviewStepService } from './brand-review-service'
import { createMockBrandReviewProvider } from './brand-review-provider'
import { createAntiSlopReviewStepService } from './anti-slop-review-service'
import { createMockAntiSlopReviewProvider } from './anti-slop-review-provider'
import { createHumanApprovalStepService } from './human-approval-service'
import { createMockHumanApprovalProvider } from './human-approval-provider'
import { createWordpressDraftStepService, parseWordpressDraftStepInput } from './wordpress-draft-service'
import { createMockWordpressDraftProvider } from './wordpress-draft-provider'

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
    jobId: 'job_wp_001',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_wp_001',
    status: 'queued',
    idempotencyKey: 'workflow:run_001:step:wordpress-draft:v1',
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

function pipeline() {
  const idea = parseIdeaIntake(VALID_IDEA)
  const now = () => '2026-06-17T00:00:00.000Z'

  let n = 0
  const kw = createKeywordResearchStepService({
    provider: createMockKeywordResearchProvider(),
    newId: () => `kw_${++n}`,
    now,
  }).run({ idea, sourceStepRunId: 'sr' })

  let m = 0
  const sc = createSourceCaptureStepService({
    provider: createMockSourceCaptureProvider(),
    newId: () => `sc_${++m}`,
    now,
  }).run({ idea, sourceStepRunId: 'sr' })

  let b = 0
  const brief = createSeoBriefStepService({
    provider: createMockSeoBriefProvider(),
    newId: () => `brief_${++b}`,
    now,
  }).run({
    idea,
    keywordResearchArtifact: kw.record,
    keywordResearch: parseKeywordResearch(kw.record.content),
    sourceCaptureArtifact: sc.record,
    sourceCapture: parseSourceCapture(sc.record.content),
    sourceStepRunId: 'sr',
  })

  let o = 0
  const outline = createOutlineStepService({
    provider: createMockOutlineProvider(),
    newId: () => `o_${++o}`,
    now,
  }).run({
    idea,
    seoBriefArtifact: brief.record,
    seoBrief: parseSeoBrief(brief.record.content),
    sourceStepRunId: 'sr',
  })

  let d = 0
  const draft = createArticleDraftStepService({
    provider: createMockArticleDraftProvider(),
    newId: () => `d_${++d}`,
    now,
  }).run({
    idea,
    outlineArtifact: outline.record,
    outline: parseOutline(outline.record.content),
    sourceCaptureArtifact: sc.record,
    sourceCapture: parseSourceCapture(sc.record.content),
    sourceStepRunId: 'sr',
  })

  let f = 0
  const fc = createFactCheckStepService({
    provider: createMockFactCheckProvider(),
    newId: () => `fc_${++f}`,
    now,
  }).run({
    articleDraftArtifact: draft.record,
    articleDraft: parseArticleDraft(draft.record.content),
    sourceCaptureArtifact: sc.record,
    sourceCapture: parseSourceCapture(sc.record.content),
    sourceStepRunId: 'sr',
  })

  let br = 0
  const brand = createBrandReviewStepService({
    provider: createMockBrandReviewProvider(),
    newId: () => `brv_${++br}`,
    now,
  }).run({
    articleDraftArtifact: draft.record,
    articleDraft: parseArticleDraft(draft.record.content),
    sourceStepRunId: 'sr',
  })

  let as = 0
  const slop = createAntiSlopReviewStepService({
    provider: createMockAntiSlopReviewProvider(),
    newId: () => `as_${++as}`,
    now,
  }).run({
    articleDraftArtifact: draft.record,
    articleDraft: parseArticleDraft(draft.record.content),
    sourceStepRunId: 'sr',
  })

  let ap = 0
  const appr = createHumanApprovalStepService({
    provider: createMockHumanApprovalProvider(),
    newId: () => `appr_${++ap}`,
    now,
  }).run({
    articleDraftArtifact: draft.record,
    articleDraft: parseArticleDraft(draft.record.content),
    requesterId: 'system@opzava',
    sourceStepRunId: 'sr',
  })

  return {
    articleDraftArtifact: draft.record,
    sourceCaptureArtifact: sc.record,
    factCheckArtifact: fc.record,
    brandReviewArtifact: brand.record,
    antiSlopArtifact: slop.record,
    approval: appr.record,
  }
}

function payloadFrom(p: ReturnType<typeof pipeline>) {
  return {
    articleDraftArtifact: p.articleDraftArtifact,
    sourceCaptureArtifact: p.sourceCaptureArtifact,
    factCheckArtifact: p.factCheckArtifact,
    brandReviewArtifact: p.brandReviewArtifact,
    antiSlopArtifact: p.antiSlopArtifact,
    approval: p.approval,
    sourceStepRunId: 'step_run_wp_001',
  }
}

function service() {
  let n = 0
  return createWordpressDraftStepService({
    provider: createMockWordpressDraftProvider(),
    newId: () => `wp_id_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z',
  })
}

describe('wordpress-draft-runner', () => {
  it('runs wordpress-draft through the durable runner and captures the draft-only request', async () => {
    const repo = repository()
    let captured: { record: { status: string }; output: unknown } | null = null
    const p = pipeline()
    const job = baseJob({ payload: payloadFrom(p) })
    repo.saveJob(jobRecord(job))

    const worker = createRunnerWorker({
      repository: repo,
      executor: createContentStepExecutor({
        service: service(),
        parseInput: parseWordpressDraftStepInput,
        onResult: (r) => {
          captured = r as unknown as { record: { status: string }; output: unknown }
        },
      }),
      ...workerOptions(),
    })

    const result = await worker.runNext()

    expect(result.status).toBe('succeeded')
    expect(captured).not.toBeNull()
    expect(captured!.record.status).toBe('draft')
    expect(captured!.output).toEqual({
      kind: 'external-action',
      requestType: 'wordpress-draft-request',
    })
    expect(repo.getJobById(job.jobId)?.job.status).toBe('succeeded')
  })

  it('fails the job when the approval is not granted', async () => {
    const repo = repository()
    const p = pipeline()
    const ungranted = {
      ...p.approval,
      status: 'requested',
      approverId: null,
      decisionReason: null,
      decidedAt: null,
    }
    const job = baseJob({
      jobId: 'job_wp_bad_001',
      payload: { ...payloadFrom(p), approval: ungranted },
    })
    repo.saveJob(jobRecord(job))

    const worker = createRunnerWorker({
      repository: repo,
      executor: createContentStepExecutor({
        service: service(),
        parseInput: parseWordpressDraftStepInput,
        onResult: () => {},
      }),
      ...workerOptions(),
    })

    const result = await worker.runNext()

    expect(result.status).toBe('failed-retry')
    expect(repo.getJobById(job.jobId)?.job.status).toBe('queued')
  })
})

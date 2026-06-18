import { describe, expect, it } from 'vitest'
import { parseProviderAdapterRequest, createExternalCallRecordFromProviderAdapterResult } from '@/opzava/platform/providers/contracts'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { parseKeywordResearch } from '../contracts/keyword-research'
import { parseSourceCapture } from '../contracts/source-capture'
import { parseSeoBrief } from '../contracts/seo-brief'
import { parseOutline } from '../contracts/outline'
import { parseArticleDraft } from '../contracts/article-draft'
import { createKeywordResearchStepService } from '../steps/keyword-research-service'
import { createMockKeywordResearchProvider } from '../steps/keyword-research-provider'
import { createSourceCaptureStepService } from '../steps/source-capture-service'
import { createMockSourceCaptureProvider } from '../steps/source-capture-provider'
import { createSeoBriefStepService } from '../steps/seo-brief-service'
import { createMockSeoBriefProvider } from '../steps/seo-brief-provider'
import { createOutlineStepService } from '../steps/outline-service'
import { createMockOutlineProvider } from '../steps/outline-provider'
import { createArticleDraftStepService } from '../steps/article-draft-service'
import { createMockArticleDraftProvider } from '../steps/article-draft-provider'
import { createMockFactCheckProviderAdapter, createMockFactCheckProviderProfile, FACT_CHECK_OPERATION } from './fact-check-adapter'

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  targetAudience: 'Coffee lovers',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
}

function inputs() {
  const idea = parseIdeaIntake(VALID_IDEA)
  const now = () => '2026-06-17T00:00:00.000Z'

  let n = 0
  const kw = createKeywordResearchStepService({
    provider: createMockKeywordResearchProvider(),
    newId: () => `kw_${++n}`,
    now
  }).run({ idea, sourceStepRunId: 'sr' })

  let m = 0
  const sc = createSourceCaptureStepService({
    provider: createMockSourceCaptureProvider(),
    newId: () => `sc_${++m}`,
    now
  }).run({ idea, sourceStepRunId: 'sr' })

  let b = 0
  const brief = createSeoBriefStepService({
    provider: createMockSeoBriefProvider(),
    newId: () => `brief_${++b}`,
    now
  }).run({
    idea,
    keywordResearchArtifact: kw.record,
    keywordResearch: parseKeywordResearch(kw.record.content),
    sourceCaptureArtifact: sc.record,
    sourceCapture: parseSourceCapture(sc.record.content),
    sourceStepRunId: 'sr'
  })

  let o = 0
  const outline = createOutlineStepService({
    provider: createMockOutlineProvider(),
    newId: () => `o_${++o}`,
    now
  }).run({
    idea,
    seoBriefArtifact: brief.record,
    seoBrief: parseSeoBrief(brief.record.content),
    sourceStepRunId: 'sr'
  })

  let d = 0
  const draft = createArticleDraftStepService({
    provider: createMockArticleDraftProvider(),
    newId: () => `d_${++d}`,
    now
  }).run({
    idea,
    outlineArtifact: outline.record,
    outline: parseOutline(outline.record.content),
    sourceCaptureArtifact: sc.record,
    sourceCapture: parseSourceCapture(sc.record.content),
    sourceStepRunId: 'sr'
  })

  return {
    articleDraft: parseArticleDraft(draft.record.content),
    sourceCapture: parseSourceCapture(sc.record.content)
  }
}

function request() {
  const i = inputs()
  return parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: 'req_001',
    providerProfile: createMockFactCheckProviderProfile(),
    operation: FACT_CHECK_OPERATION,
    workflowRunId: 'run_001',
    stepRunId: 'step_run_fc_001',
    idempotencyKey: 'workflow:run_001:step:fact-check:v1',
    timeoutMs: 30_000,
    retry: { attemptNumber: 1, maxAttempts: 3 },
    input: { articleDraft: i.articleDraft, sourceCapture: i.sourceCapture },
    requestSummary: { draftId: i.articleDraft.draftId },
    startedAt: '2026-06-15T00:00:00.000Z'
  })
}

function adapter() {
  return createMockFactCheckProviderAdapter({ now: () => '2026-06-15T00:00:05.000Z' })
}

describe('fact-check-adapter', () => {
  it('executes the fact-check operation and returns a succeeded result', async () => {
    const result = await adapter().execute(request(), new AbortController().signal)
    expect(result.status).toBe('succeeded')
    expect(result.error).toBeNull()
    const output = result.output as { status: string; checks: unknown[] }
    expect(output.status).toBe('passed')
    expect(output.checks.length).toBeGreaterThan(0)
  })

  it('produces a valid external-call record', async () => {
    const req = request()
    const result = await adapter().execute(req, new AbortController().signal)
    const record = createExternalCallRecordFromProviderAdapterResult({
      externalCallId: 'ext_001',
      request: req,
      result
    })
    expect(record.providerId).toBe('mock-fact-check')
    expect(record.operation).toBe(FACT_CHECK_OPERATION)
    expect(record.status).toBe('succeeded')
  })

  it('builds an llm profile scoped to the fact-check operation', () => {
    const profile = createMockFactCheckProviderProfile()
    expect(profile.kind).toBe('llm')
    expect(profile.config.allowedOperations).toEqual([FACT_CHECK_OPERATION])
  })
})

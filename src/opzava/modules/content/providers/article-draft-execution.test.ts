import { describe, expect, it } from 'vitest'
import { parseProviderAdapterRequest, createExternalCallRecordFromProviderAdapterResult } from '@/opzava/platform/providers/contracts'
import type { OperationalEventStorageRecord } from '@/opzava/platform/runner/repository-contracts'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { parseKeywordResearch } from '../contracts/keyword-research'
import { parseSourceCapture } from '../contracts/source-capture'
import { parseSeoBrief } from '../contracts/seo-brief'
import { parseOutline } from '../contracts/outline'
import { createKeywordResearchStepService } from '../steps/keyword-research-service'
import { createMockKeywordResearchProvider } from '../steps/keyword-research-provider'
import { createSourceCaptureStepService } from '../steps/source-capture-service'
import { createMockSourceCaptureProvider } from '../steps/source-capture-provider'
import { createSeoBriefStepService } from '../steps/seo-brief-service'
import { createMockSeoBriefProvider } from '../steps/seo-brief-provider'
import { createOutlineStepService } from '../steps/outline-service'
import { createMockOutlineProvider } from '../steps/outline-provider'
import { createMockArticleDraftProviderAdapter } from './article-draft-adapter'
import { runArticleDraftProviderCall } from './article-draft-execution'

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

  return {
    idea: VALID_IDEA,
    outline: parseOutline(outline.record.content),
    sourceCapture: parseSourceCapture(sc.record.content)
  }
}

function sink() {
  const events: OperationalEventStorageRecord[] = []
  return {
    events,
    appendOperationalEvent: (r: OperationalEventStorageRecord) => {
      events.push(r)
    }
  }
}

function deps(s: ReturnType<typeof sink>) {
  let n = 0
  return {
    adapter: createMockArticleDraftProviderAdapter({ now: () => '2026-06-15T00:00:05.000Z' }),
    eventSink: s,
    newId: () => `id_${++n}`,
    now: () => '2026-06-15T00:00:00.000Z',
    actorId: 'system@opzava',
    clock: { now: () => new Date('2026-06-15T00:00:05.000Z') }
  }
}

describe('article-draft-execution', () => {
  it('routes the article-draft call through the platform execution path', async () => {
    const i = inputs()
    const idea = parseIdeaIntake(VALID_IDEA)
    const s = sink()
    const execution = await runArticleDraftProviderCall(deps(s), {
      idea,
      outline: i.outline,
      sourceCapture: i.sourceCapture,
      workflowRunId: 'run_001',
      stepRunId: 'step_run_ad_001'
    })
    expect(execution.result.status).toBe('succeeded')
    expect(execution.externalCallRecord.providerId).toBe('mock-article-draft')
  })

  it('emits external-call, cost, and audit operational events', async () => {
    const i = inputs()
    const idea = parseIdeaIntake(VALID_IDEA)
    const s = sink()
    await runArticleDraftProviderCall(deps(s), {
      idea,
      outline: i.outline,
      sourceCapture: i.sourceCapture,
      workflowRunId: 'run_001',
      stepRunId: 'step_run_ad_001'
    })
    const kinds = s.events.map((e) => e.kind)
    expect(kinds).toContain('external-call')
    expect(kinds).toContain('cost')
    expect(kinds).toContain('audit')
    expect(s.events.length).toBe(3)
  })
})

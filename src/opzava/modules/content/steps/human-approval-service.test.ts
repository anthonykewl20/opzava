import { describe, expect, it } from 'vitest'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { parseKeywordResearch } from '../contracts/keyword-research'
import { parseSourceCapture } from '../contracts/source-capture'
import { parseSeoBrief } from '../contracts/seo-brief'
import { parseOutline } from '../contracts/outline'
import { parseArticleDraft } from '../contracts/article-draft'
import { isApprovalGranted } from '@/opzava/core/approvals/contracts'
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
import { createHumanApprovalStepService, parseHumanApprovalStepInput } from './human-approval-service'
import { createMockHumanApprovalProvider } from './human-approval-provider'

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  targetAudience: 'Coffee lovers',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z',
}

function draftArtifact() {
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
  return createArticleDraftStepService({
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
  }).record
}

function service() {
  let n = 0
  return createHumanApprovalStepService({
    provider: createMockHumanApprovalProvider(),
    newId: () => `appr_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z',
  })
}

describe('human-approval-service', () => {
  it('produces an approved approval targeting the article-draft', () => {
    const da = draftArtifact()
    const r = service().run({
      articleDraftArtifact: da,
      articleDraft: parseArticleDraft(da.content),
      requesterId: 'system@opzava',
      sourceStepRunId: 'sr_appr',
    })

    expect(r.stepId).toBe('human-approval')
    expect(r.output).toEqual({ kind: 'approval' })
    expect(r.record.status).toBe('approved')
    expect(isApprovalGranted(r.record)).toBe(true)
    expect(r.record.target).toEqual({ kind: 'artifact', id: da.artifactId })
    expect(r.record.approverId).toBe('editor@opzava.test')
  })

  it('parses a valid step input', () => {
    const da = draftArtifact()
    const parsed = parseHumanApprovalStepInput({
      articleDraftArtifact: da,
      requesterId: 'system@opzava',
      sourceStepRunId: 's1',
    })

    expect(parsed.requesterId).toBe('system@opzava')
    expect(parsed.articleDraft.draftId).toBeTruthy()
  })

  it('rejects a non-article-draft upstream artifact', () => {
    const idea = parseIdeaIntake(VALID_IDEA)
    let m = 0
    const sc = createSourceCaptureStepService({
      provider: createMockSourceCaptureProvider(),
      newId: () => `sc_${++m}`,
      now: () => '2026-06-17T00:00:00.000Z',
    }).run({ idea, sourceStepRunId: 'sr' })

    expect(() =>
      parseHumanApprovalStepInput({
        articleDraftArtifact: sc.record,
        requesterId: 'system@opzava',
        sourceStepRunId: 's1',
      })
    ).toThrow()
  })
})

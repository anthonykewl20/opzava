import { describe, expect, it } from 'vitest'
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

function service() {
  let n = 0
  return createWordpressDraftStepService({
    provider: createMockWordpressDraftProvider(),
    newId: () => `wp_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z',
  })
}

function input(p: ReturnType<typeof pipeline>) {
  return {
    articleDraftArtifact: p.articleDraftArtifact,
    articleDraft: parseArticleDraft(p.articleDraftArtifact.content),
    sourceCaptureArtifact: p.sourceCaptureArtifact,
    factCheckArtifact: p.factCheckArtifact,
    brandReviewArtifact: p.brandReviewArtifact,
    antiSlopArtifact: p.antiSlopArtifact,
    approval: p.approval,
    sourceStepRunId: 'sr_wp',
  }
}

describe('wordpress-draft-service', () => {
  it('produces a draft-only wordpress request gated by approval and all four quality artifacts', () => {
    const p = pipeline()
    const r = service().run(input(p))

    expect(r.output).toEqual({
      kind: 'external-action',
      requestType: 'wordpress-draft-request',
    })

    const content = r.record as {
      status: string
      approvalId: string
      draftId: string
      gateArtifacts: {
        sourceCaptureId: string
        factCheckReportId: string
        brandReviewId: string
        antiSlopReviewId: string
      }
    }

    expect(content.status).toBe('draft')
    expect(content.approvalId).toBe(p.approval.approvalId)
    expect(content.draftId).toBe(p.articleDraftArtifact.artifactId)
    expect(content.gateArtifacts.factCheckReportId).toBe(p.factCheckArtifact.artifactId)
    expect(content.gateArtifacts.antiSlopReviewId).toBe(p.antiSlopArtifact.artifactId)
  })

  it('refuses to produce a draft when a quality verdict failed (F3)', () => {
    const p = pipeline()
    const failedFactCheck = {
      ...p.factCheckArtifact,
      content: {
        schemaVersion: 1,
        reportId: 'fc-failed',
        draftId: p.articleDraftArtifact.artifactId,
        ideaId: 'idea_001',
        status: 'failed',
        checks: [{ claim: 'unsupported claim', verdict: 'contradicted', sourceIds: [] }],
        checkedAt: '2026-06-17T00:00:00.000Z',
      },
    } as typeof p.factCheckArtifact
    const badInput = { ...input(p), factCheckArtifact: failedFactCheck }
    expect(() => service().run(badInput)).toThrow(/quality gates not passed/)
  })

  it('parses a valid full step input', () => {
    const p = pipeline()
    const parsed = parseWordpressDraftStepInput({
      articleDraftArtifact: p.articleDraftArtifact,
      sourceCaptureArtifact: p.sourceCaptureArtifact,
      factCheckArtifact: p.factCheckArtifact,
      brandReviewArtifact: p.brandReviewArtifact,
      antiSlopArtifact: p.antiSlopArtifact,
      approval: p.approval,
      sourceStepRunId: 's1',
    })

    expect(parsed.sourceStepRunId).toBe('s1')
    expect(parsed.approval.status).toBe('approved')
  })

  it('rejects when the approval is not granted', () => {
    const p = pipeline()
    const ungranted = {
      ...p.approval,
      status: 'requested',
      approverId: null,
      decisionReason: null,
      decidedAt: null,
    }

    expect(() =>
      parseWordpressDraftStepInput({
        articleDraftArtifact: p.articleDraftArtifact,
        sourceCaptureArtifact: p.sourceCaptureArtifact,
        factCheckArtifact: p.factCheckArtifact,
        brandReviewArtifact: p.brandReviewArtifact,
        antiSlopArtifact: p.antiSlopArtifact,
        approval: ungranted,
        sourceStepRunId: 's1',
      })
    ).toThrow(/granted approval/)
  })

  it('rejects a wrong gate artifact type', () => {
    const p = pipeline()

    expect(() =>
      parseWordpressDraftStepInput({
        articleDraftArtifact: p.articleDraftArtifact,
        sourceCaptureArtifact: p.factCheckArtifact,
        factCheckArtifact: p.factCheckArtifact,
        brandReviewArtifact: p.brandReviewArtifact,
        antiSlopArtifact: p.antiSlopArtifact,
        approval: p.approval,
        sourceStepRunId: 's1',
      })
    ).toThrow()
  })
})

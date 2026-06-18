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
import { createBrandReviewStepService, parseBrandReviewStepInput } from './brand-review-service'
import { createMockBrandReviewProvider } from './brand-review-provider'

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  targetAudience: 'Coffee lovers',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
}

function draftArtifact() {
  const idea = parseIdeaIntake(VALID_IDEA)
  const now = () => '2026-06-17T00:00:00.000Z'

  let n = 0
  const kw = createKeywordResearchStepService({ provider: createMockKeywordResearchProvider(), newId: () => `kw_${++n}`, now }).run({ idea, sourceStepRunId: 'sr' })

  let m = 0
  const sc = createSourceCaptureStepService({ provider: createMockSourceCaptureProvider(), newId: () => `sc_${++m}`, now }).run({ idea, sourceStepRunId: 'sr' })

  let b = 0
  const brief = createSeoBriefStepService({ provider: createMockSeoBriefProvider(), newId: () => `brief_${++b}`, now }).run({
    idea,
    keywordResearchArtifact: kw.record,
    keywordResearch: parseKeywordResearch(kw.record.content),
    sourceCaptureArtifact: sc.record,
    sourceCapture: parseSourceCapture(sc.record.content),
    sourceStepRunId: 'sr'
  })

  let o = 0
  const outline = createOutlineStepService({ provider: createMockOutlineProvider(), newId: () => `o_${++o}`, now }).run({
    idea,
    seoBriefArtifact: brief.record,
    seoBrief: parseSeoBrief(brief.record.content),
    sourceStepRunId: 'sr'
  })

  let d = 0
  return createArticleDraftStepService({ provider: createMockArticleDraftProvider(), newId: () => `d_${++d}`, now }).run({
    idea,
    outlineArtifact: outline.record,
    outline: parseOutline(outline.record.content),
    sourceCaptureArtifact: sc.record,
    sourceCapture: parseSourceCapture(sc.record.content),
    sourceStepRunId: 'sr'
  }).record
}

function service() {
  let n = 0
  return createBrandReviewStepService({
    provider: createMockBrandReviewProvider(),
    newId: () => `br_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z'
  })
}

describe('brand-review-service', () => {
  it('produces a passed brand-review across all dimensions', () => {
    const da = draftArtifact()
    const r = service().run({
      articleDraftArtifact: da,
      articleDraft: parseArticleDraft(da.content),
      sourceStepRunId: 'sr_br'
    })

    expect(r.output).toEqual({ kind: 'artifact', artifactType: 'brand-review' })
    expect(r.record.artifactType).toBe('brand-review')

    const content = r.record.content as { status: string; draftId: string; checks: { dimension: string; verdict: string }[] }
    expect(content.status).toBe('passed')
    expect(content.draftId).toBe(da.artifactId)
    expect(content.checks.length).toBe(5)
    expect(content.checks.every((c) => c.verdict === 'pass')).toBe(true)
    expect(r.record.lineage.inputArtifactIds).toContain(da.artifactId)
  })

  it('parses a valid step input', () => {
    const da = draftArtifact()
    const parsed = parseBrandReviewStepInput({
      articleDraftArtifact: da,
      sourceStepRunId: 's1'
    })

    expect(parsed.sourceStepRunId).toBe('s1')
    expect(parsed.articleDraft.draftId).toBeTruthy()
  })

  it('rejects a non-article-draft upstream artifact', () => {
    const idea = parseIdeaIntake(VALID_IDEA)
    let m = 0
    const sc = createSourceCaptureStepService({
      provider: createMockSourceCaptureProvider(),
      newId: () => `sc_${++m}`,
      now: () => '2026-06-17T00:00:00.000Z'
    }).run({ idea, sourceStepRunId: 'sr' })

    expect(() =>
      parseBrandReviewStepInput({
        articleDraftArtifact: sc.record,
        sourceStepRunId: 's1'
      })
    ).toThrow()
  })
})

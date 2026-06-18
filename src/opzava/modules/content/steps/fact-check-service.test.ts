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
import { createFactCheckStepService, parseFactCheckStepInput } from './fact-check-service'
import { createMockFactCheckProvider } from './fact-check-provider'

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  targetAudience: 'Coffee lovers',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
}

function upstream() {
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
  return { articleDraftArtifact: draft.record, sourceCaptureArtifact: sc.record }
}

function service() {
  let n = 0
  return createFactCheckStepService({ provider: createMockFactCheckProvider(), newId: () => `fc_${++n}`, now: () => '2026-06-17T00:00:00.000Z' })
}

describe('fact-check-service', () => {
  it('produces a passed fact-check-report where every check is supported', () => {
    const u = upstream()
    const r = service().run({
      articleDraftArtifact: u.articleDraftArtifact,
      articleDraft: parseArticleDraft(u.articleDraftArtifact.content),
      sourceCaptureArtifact: u.sourceCaptureArtifact,
      sourceCapture: parseSourceCapture(u.sourceCaptureArtifact.content),
      sourceStepRunId: 'sr_fc'
    })
    expect(r.output).toEqual({ kind: 'artifact', artifactType: 'fact-check-report' })
    expect(r.record.artifactType).toBe('fact-check-report')
    const content = r.record.content as { status: string; draftId: string; checks: { verdict: string; sourceIds: string[] }[] }
    expect(content.status).toBe('passed')
    expect(content.draftId).toBe(u.articleDraftArtifact.artifactId)
    expect(content.checks.every((c) => c.verdict === 'supported' && c.sourceIds.length >= 1)).toBe(true)
    expect(r.record.lineage.inputArtifactIds).toContain(u.articleDraftArtifact.artifactId)
  })

  it('parses a valid step input', () => {
    const u = upstream()
    const parsed = parseFactCheckStepInput({
      articleDraftArtifact: u.articleDraftArtifact,
      sourceCaptureArtifact: u.sourceCaptureArtifact,
      sourceStepRunId: 's1'
    })
    expect(parsed.sourceStepRunId).toBe('s1')
    expect(parsed.articleDraft.draftId).toBeTruthy()
  })

  it('rejects a wrong upstream artifact type', () => {
    const u = upstream()
    expect(() => parseFactCheckStepInput({
      articleDraftArtifact: u.sourceCaptureArtifact,
      sourceCaptureArtifact: u.sourceCaptureArtifact,
      sourceStepRunId: 's1'
    })).toThrow()
  })
})

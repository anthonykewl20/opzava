import { describe, expect, it } from 'vitest'
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
import { createArticleDraftStepService, parseArticleDraftStepInput } from './article-draft-service'
import { createMockArticleDraftProvider } from './article-draft-provider'

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
  let n = 0
  const kw = createKeywordResearchStepService({
    provider: createMockKeywordResearchProvider(),
    newId: () => `kw_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z'
  }).run({ idea, sourceStepRunId: 'sr' })

  let m = 0
  const sc = createSourceCaptureStepService({
    provider: createMockSourceCaptureProvider(),
    newId: () => `sc_${++m}`,
    now: () => '2026-06-17T00:00:00.000Z'
  }).run({ idea, sourceStepRunId: 'sr' })

  let b = 0
  const brief = createSeoBriefStepService({
    provider: createMockSeoBriefProvider(),
    newId: () => `brief_${++b}`,
    now: () => '2026-06-17T00:00:00.000Z'
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
    now: () => '2026-06-17T00:00:00.000Z'
  }).run({
    idea,
    seoBriefArtifact: brief.record,
    seoBrief: parseSeoBrief(brief.record.content),
    sourceStepRunId: 'sr'
  })

  return { idea, outlineArtifact: outline.record, sourceCaptureArtifact: sc.record }
}

function service() {
  let n = 0
  return createArticleDraftStepService({
    provider: createMockArticleDraftProvider(),
    newId: () => `draft_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z'
  })
}

describe('article-draft-service', () => {
  it('produces an article-draft artifact where every section cites a source', () => {
    const u = upstream()
    const r = service().run({
      idea: u.idea,
      outlineArtifact: u.outlineArtifact,
      outline: parseOutline(u.outlineArtifact.content),
      sourceCaptureArtifact: u.sourceCaptureArtifact,
      sourceCapture: parseSourceCapture(u.sourceCaptureArtifact.content),
      sourceStepRunId: 'sr_draft'
    })

    expect(r.output).toEqual({ kind: 'artifact', artifactType: 'article-draft' })
    expect(r.record.artifactType).toBe('article-draft')
    expect(r.record.lineage.inputArtifactIds).toContain(u.outlineArtifact.artifactId)
    expect(r.record.lineage.inputArtifactIds).toContain(u.sourceCaptureArtifact.artifactId)

    const content = r.record.content as {
      sections: { supportingSourceIds: string[] }[]
      outlineId: string
    }
    expect(content.outlineId).toBe(u.outlineArtifact.artifactId)
    expect(content.sections.every((s) => s.supportingSourceIds.length >= 1)).toBe(true)
  })

  it('parses a valid multi-artifact step input', () => {
    const u = upstream()
    const parsed = parseArticleDraftStepInput({
      idea: VALID_IDEA,
      outlineArtifact: u.outlineArtifact,
      sourceCaptureArtifact: u.sourceCaptureArtifact,
      sourceStepRunId: 's1'
    })

    expect(parsed.sourceStepRunId).toBe('s1')
    expect(parsed.outline.outlineId).toBeTruthy()
  })

  it('rejects a wrong upstream artifact type', () => {
    const u = upstream()
    expect(() =>
      parseArticleDraftStepInput({
        idea: VALID_IDEA,
        outlineArtifact: u.sourceCaptureArtifact,
        sourceCaptureArtifact: u.sourceCaptureArtifact,
        sourceStepRunId: 's1'
      })
    ).toThrow()
  })
})

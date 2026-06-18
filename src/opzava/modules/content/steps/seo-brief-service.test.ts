import { describe, expect, it } from 'vitest'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { parseKeywordResearch } from '../contracts/keyword-research'
import { parseSourceCapture } from '../contracts/source-capture'
import { createKeywordResearchStepService } from './keyword-research-service'
import { createMockKeywordResearchProvider } from './keyword-research-provider'
import { createSourceCaptureStepService } from './source-capture-service'
import { createMockSourceCaptureProvider } from './source-capture-provider'
import { createSeoBriefStepService, parseSeoBriefStepInput } from './seo-brief-service'
import { createMockSeoBriefProvider } from './seo-brief-provider'

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  targetAudience: 'Coffee lovers',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z',
}

function upstream() {
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
  return { idea, keywordResearchArtifact: kw.record, sourceCaptureArtifact: sc.record }
}

function service() {
  let n = 0
  return createSeoBriefStepService({
    provider: createMockSeoBriefProvider(),
    newId: () => `brief_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z',
  })
}

it('produces an seo-brief artifact composing three upstream lineage links', () => {
  const u = upstream()
  const r = service().run({
    idea: u.idea,
    keywordResearchArtifact: u.keywordResearchArtifact,
    keywordResearch: parseKeywordResearch(u.keywordResearchArtifact.content),
    sourceCaptureArtifact: u.sourceCaptureArtifact,
    sourceCapture: parseSourceCapture(u.sourceCaptureArtifact.content),
    sourceStepRunId: 'sr_brief',
  })
  expect(r.output).toEqual({ kind: 'artifact', artifactType: 'seo-brief' })
  expect(r.record.artifactType).toBe('seo-brief')
  expect(r.record.lineage.inputArtifactIds).toContain('idea_001')
  expect(r.record.lineage.inputArtifactIds).toContain(u.keywordResearchArtifact.artifactId)
  expect(r.record.lineage.inputArtifactIds).toContain(u.sourceCaptureArtifact.artifactId)
  expect((r.record.content as { keywordResearchId: string }).keywordResearchId).toBe(
    u.keywordResearchArtifact.artifactId,
  )
})

it('parses a valid multi-artifact step input via the runner payload shape', () => {
  const u = upstream()
  const parsed = parseSeoBriefStepInput({
    idea: VALID_IDEA,
    keywordResearchArtifact: u.keywordResearchArtifact,
    sourceCaptureArtifact: u.sourceCaptureArtifact,
    sourceStepRunId: 's1',
  })
  expect(parsed.sourceStepRunId).toBe('s1')
  expect(parsed.keywordResearch.primaryKeyword).toBeTruthy()
})

it('rejects a wrong upstream artifact type', () => {
  const u = upstream()
  expect(() =>
    parseSeoBriefStepInput({
      idea: VALID_IDEA,
      keywordResearchArtifact: u.sourceCaptureArtifact,
      sourceCaptureArtifact: u.sourceCaptureArtifact,
      sourceStepRunId: 's1',
    }),
  ).toThrow()
})

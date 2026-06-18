import { describe, expect, it } from 'vitest'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { parseSeoBrief } from '../contracts/seo-brief'
import { parseKeywordResearch } from '../contracts/keyword-research'
import { parseSourceCapture } from '../contracts/source-capture'
import { createKeywordResearchStepService } from './keyword-research-service'
import { createMockKeywordResearchProvider } from './keyword-research-provider'
import { createSourceCaptureStepService } from './source-capture-service'
import { createMockSourceCaptureProvider } from './source-capture-provider'
import { createSeoBriefStepService } from './seo-brief-service'
import { createMockSeoBriefProvider } from './seo-brief-provider'
import { createOutlineStepService, parseOutlineStepInput } from './outline-service'
import { createMockOutlineProvider } from './outline-provider'

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  targetAudience: 'Coffee lovers',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
}

function briefArtifact() {
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
  return brief.record
}

function service() {
  let n = 0
  return createOutlineStepService({
    provider: createMockOutlineProvider(),
    newId: () => `outline_${++n}`,
    now: () => '2026-06-17T00:00:00.000Z'
  })
}

describe('outline step service', () => {
  it('produces an outline artifact from the brief', () => {
    const idea = parseIdeaIntake(VALID_IDEA)
    const ba = briefArtifact()
    const r = service().run({
      idea,
      seoBriefArtifact: ba,
      seoBrief: parseSeoBrief(ba.content),
      sourceStepRunId: 'sr_outline'
    })
    expect(r.output).toEqual({ kind: 'artifact', artifactType: 'outline' })
    expect(r.record.artifactType).toBe('outline')
    expect(r.record.lineage.inputArtifactIds).toContain(ba.artifactId)
    expect(r.record.lineage.inputArtifactIds).toContain('idea_001')
    expect((r.record.content as { briefId: string }).briefId).toBe(ba.artifactId)
    expect((r.record.content as { sections: unknown[] }).sections.length).toBeGreaterThan(0)
  })

  it('parses a valid step input', () => {
    const ba = briefArtifact()
    const parsed = parseOutlineStepInput({ idea: VALID_IDEA, seoBriefArtifact: ba, sourceStepRunId: 's1' })
    expect(parsed.sourceStepRunId).toBe('s1')
    expect(parsed.seoBrief.briefId).toBeTruthy()
  })

  it('rejects a non-seo-brief upstream artifact', () => {
    const idea = parseIdeaIntake(VALID_IDEA)
    let m = 0
    const sc = createSourceCaptureStepService({
      provider: createMockSourceCaptureProvider(),
      newId: () => `sc_${++m}`,
      now: () => '2026-06-17T00:00:00.000Z'
    }).run({ idea, sourceStepRunId: 'sr' })
    expect(() =>
      parseOutlineStepInput({ idea: VALID_IDEA, seoBriefArtifact: sc.record, sourceStepRunId: 's1' })
    ).toThrow()
  })
})

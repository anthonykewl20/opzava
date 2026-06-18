import { describe, expect, it } from 'vitest'
import { parseIdeaIntake, type IdeaIntake } from '../contracts/idea-intake'
import {
  createSourceCaptureStepService,
  parseSourceCaptureStepInput,
} from './source-capture-service'
import { createMockSourceCaptureProvider } from './source-capture-provider'

const VALID_IDEA = {
  schemaVersion: 1 as const,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z',
}

describe('source-capture step service', () => {
  const idea: IdeaIntake = parseIdeaIntake(VALID_IDEA)
  let n = 0
  const newId = (): string => `id_${++n}`
  const now = (): string => '2026-06-17T00:00:00.000Z'
  const service = createSourceCaptureStepService({
    provider: createMockSourceCaptureProvider(),
    newId,
    now,
  })

  it('produces a source-capture artifact from the idea', () => {
    const r = service.run({ idea, sourceStepRunId: 'step_run_sc_001' })
    expect(r.stepId).toBe('source-capture')
    expect(r.output).toEqual({ kind: 'artifact', artifactType: 'source-capture' })
    expect(r.record.artifactType).toBe('source-capture')
    expect(r.record.lineage.inputArtifactIds).toContain('idea_001')
    expect((r.record.content as { ideaId: string }).ideaId).toBe('idea_001')
    expect((r.record.content as { sources: unknown[] }).sources.length).toBe(2)
    expect(r.record.validation.status).toBe('valid')
  })

  it('parses a valid step input', () => {
    expect(
      parseSourceCaptureStepInput({ idea: VALID_IDEA, sourceStepRunId: 's1' }).sourceStepRunId,
    ).toBe('s1')
  })

  it('rejects malformed step input', () => {
    expect(() => parseSourceCaptureStepInput({ idea: {}, sourceStepRunId: 's1' })).toThrow()
    expect(() => parseSourceCaptureStepInput({ sourceStepRunId: 's1' })).toThrow()
  })
})

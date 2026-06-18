import { describe, expect, it } from 'vitest'
import { parseIdeaIntake, type IdeaIntake } from '../contracts/idea-intake'
import {
  createKeywordResearchStepService,
  parseKeywordResearchStepInput
} from './keyword-research-service'
import { createMockKeywordResearchProvider } from './keyword-research-provider'

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
}

describe('keyword-research step service', () => {
  it('produces a keyword-research artifact from the idea', () => {
    const idea: IdeaIntake = parseIdeaIntake(VALID_IDEA)
    let n = 0
    const newId = () => `id_${++n}`
    const now = () => '2026-06-17T00:00:00.000Z'
    const service = createKeywordResearchStepService({
      provider: createMockKeywordResearchProvider(),
      newId,
      now
    })

    const r = service.run({ idea, sourceStepRunId: 'step_run_kw_001' })

    expect(r.stepId).toBe('keyword-research')
    expect(r.output).toEqual({ kind: 'artifact', artifactType: 'keyword-research' })
    expect(r.record.artifactType).toBe('keyword-research')
    expect(r.record.lineage.inputArtifactIds).toContain('idea_001')
    expect((r.record.content as { ideaId: string }).ideaId).toBe('idea_001')
    expect(r.record.validation.status).toBe('valid')
  })

  it('parses a valid step input', () => {
    const parsed = parseKeywordResearchStepInput({
      idea: VALID_IDEA,
      sourceStepRunId: 's1'
    })
    expect(parsed.sourceStepRunId).toBe('s1')
  })

  it('rejects malformed step input', () => {
    expect(() =>
      parseKeywordResearchStepInput({ idea: {}, sourceStepRunId: 's1' })
    ).toThrow()
    expect(() =>
      parseKeywordResearchStepInput({ sourceStepRunId: 's1' })
    ).toThrow()
  })
})

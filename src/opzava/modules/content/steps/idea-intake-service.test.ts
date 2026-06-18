import { describe, expect, it } from 'vitest'
import { ideaIntakeStepService } from './idea-intake-service'

const VALID_INPUT = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'A Topic',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
}

describe('ideaIntakeStepService', () => {
  it('returns the validated record + intake-record output', () => {
    const r = ideaIntakeStepService.run(VALID_INPUT)
    expect(r.stepId).toBe('idea-intake')
    expect(r.output).toEqual({ kind: 'intake-record', recordType: 'idea-intake' })
    expect(r.record).toEqual(VALID_INPUT)
  })

  it('throws on invalid input', () => {
    expect(() => ideaIntakeStepService.run({})).toThrow()
  })
})

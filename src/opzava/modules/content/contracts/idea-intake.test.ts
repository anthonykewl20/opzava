import { describe, expect, it } from 'vitest'

import { IDEA_INTAKE_SCHEMA_VERSION, parseIdeaIntake } from './idea-intake'

describe('Opzava content idea-intake contract', () => {
  it('parses a fully specified idea intake', () => {
    const parsed = parseIdeaIntake(validIdea())

    expect(parsed.schemaVersion).toBe(IDEA_INTAKE_SCHEMA_VERSION)
    expect(parsed.ideaId).toBe('idea_001')
    expect(parsed.title).toBe('How to self-host an AI ops control plane')
    expect(parsed.topic).toBe('self-hosted AI operations')
    expect(parsed.targetKeyword).toBe('self-hosted ai ops')
    expect(parsed.requestedBy).toBe('operator:1')
  })

  it('parses an idea intake without the optional targeting fields', () => {
    const { targetKeyword, targetAudience, ...required } = validIdea()
    void targetKeyword
    void targetAudience

    const parsed = parseIdeaIntake(required)

    expect(parsed.targetKeyword).toBeUndefined()
    expect(parsed.targetAudience).toBeUndefined()
  })

  it('rejects a missing required field', () => {
    const { topic, ...withoutTopic } = validIdea()
    void topic

    expect(() => parseIdeaIntake(withoutTopic)).toThrow()
  })

  it('rejects an unknown field', () => {
    expect(() => parseIdeaIntake({ ...validIdea(), priority: 'high' })).toThrow()
  })

  it('rejects an unexpected schema version', () => {
    expect(() => parseIdeaIntake({ ...validIdea(), schemaVersion: 2 })).toThrow()
  })

  it('rejects an empty title', () => {
    expect(() => parseIdeaIntake({ ...validIdea(), title: '' })).toThrow()
  })

  it('returns a frozen, deterministic result', () => {
    const parsed = parseIdeaIntake(validIdea())

    expect(Object.isFrozen(parsed)).toBe(true)
    expect(parseIdeaIntake(validIdea())).toEqual(parsed)
  })
})

function validIdea() {
  return {
    schemaVersion: IDEA_INTAKE_SCHEMA_VERSION,
    ideaId: 'idea_001',
    title: 'How to self-host an AI ops control plane',
    topic: 'self-hosted AI operations',
    targetKeyword: 'self-hosted ai ops',
    targetAudience: 'technical founders running small teams',
    requestedBy: 'operator:1',
    createdAt: '2026-06-16T00:00:00.000Z',
  }
}

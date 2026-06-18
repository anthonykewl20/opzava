import { describe, expect, it } from 'vitest'

import { createContentArtifact, type CreateContentArtifactInput } from './content-artifact'

describe('Opzava content artifact envelope', () => {
  it('wraps a validated keyword-research payload as a generic Artifact', () => {
    const input = validInput()
    const artifact = createContentArtifact(input)

    expect(artifact.artifactType).toBe('keyword-research')
    expect(artifact.sourceStepRunId).toBe(input.sourceStepRunId)
    expect(artifact.content).toEqual(input.content)
    expect(artifact.validation.status).toBe('valid')
    expect(artifact.validation.checkedAt).toBe(input.validatedAt)
    expect(artifact.lineage.inputArtifactIds).toEqual(input.inputArtifactIds)
  })

  it('rejects the root intake record type (idea-intake is not a derived artifact)', () => {
    expect(() => createContentArtifact({ ...validInput(), artifactType: 'idea-intake' as never })).toThrow()
  })

  it('rejects an unknown artifact type', () => {
    expect(() => createContentArtifact({ ...validInput(), artifactType: 'nonsense' as never })).toThrow(
      /unknown content artifact type/,
    )
  })

  it('rejects empty inputArtifactIds (derived artifacts require lineage inputs)', () => {
    expect(() => createContentArtifact({ ...validInput(), inputArtifactIds: [] })).toThrow()
  })

  it('rejects content that smuggles a secret reference', () => {
    const secretRef = {
      kind: 'SecretReference',
      id: 'cred_1',
      scope: 'provider-credential',
      purpose: 'api-key',
    }
    expect(() => createContentArtifact({ ...validInput(), content: { leak: secretRef } })).toThrow()
  })

  it('returns a frozen Artifact', () => {
    const artifact = createContentArtifact(validInput())

    expect(Object.isFrozen(artifact)).toBe(true)
  })

  it('is deterministic for identical input', () => {
    const first = createContentArtifact(validInput())
    const second = createContentArtifact(validInput())

    expect(second).toEqual(first)
  })
})

function validInput(): CreateContentArtifactInput {
  return {
    artifactId: 'art_kw_001',
    artifactType: 'keyword-research',
    sourceStepRunId: 'steprun_kw_001',
    content: {
      researchId: 'kwr_001',
      primaryKeyword: 'self-hosted ai ops',
      candidates: [
        { term: 'self-hosted ai ops', searchVolume: 1200 },
        { term: 'ai operations dashboard' },
      ],
    },
    inputArtifactIds: ['intake_001'],
    validatedAt: '2026-06-16T00:00:00.000Z',
  }
}

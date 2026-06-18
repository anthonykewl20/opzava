import { describe, it, expect } from 'vitest'
import { createSocialArtifact, SOCIAL_ARTIFACT_TYPES } from './social-artifact'

describe('createSocialArtifact', () => {
  it('wraps a valid social-post-draft into a frozen Artifact', () => {
    const a = createSocialArtifact({
      artifactId: 'soc-1',
      artifactType: 'social-post-draft',
      sourceStepRunId: 'step-1',
      content: { text: 'Hello world', platform: 'x' },
      inputArtifactIds: ['brief-1'],
      validatedAt: '2026-07-01T00:00:00.000Z',
    })
    expect(a.artifactType).toBe('social-post-draft')
    expect(a.validation.status).toBe('valid')
    expect(a.lineage.inputArtifactIds).toEqual(['brief-1'])
    expect(a.content).toEqual({ text: 'Hello world', platform: 'x' })
    expect(Object.isFrozen(a)).toBe(true)
  })

  it('rejects an unknown social artifact type', () => {
    expect(() =>
      createSocialArtifact({
        artifactId: 'x',
        artifactType: 'not-social' as any,
        sourceStepRunId: 's',
        content: {},
        inputArtifactIds: ['i'],
        validatedAt: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow(/unknown social artifact type/)
  })

  it('rejects empty lineage (via parseArtifact)', () => {
    expect(() =>
      createSocialArtifact({
        artifactId: 'x',
        artifactType: 'social-brief',
        sourceStepRunId: 's',
        content: {},
        inputArtifactIds: [],
        validatedAt: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow()
  })

  it('SOCIAL_ARTIFACT_TYPES contains the four social steps', () => {
    expect(SOCIAL_ARTIFACT_TYPES).toEqual([
      'social-brief',
      'social-post-draft',
      'social-review',
      'social-schedule-request',
    ])
  })

  it('supports each social-brief and social-schedule-request type', () => {
    const types = ['social-brief', 'social-schedule-request'] as const
    for (const artifactType of types) {
      const a = createSocialArtifact({
        artifactId: `soc-${artifactType}`,
        artifactType,
        sourceStepRunId: 's',
        content: {},
        inputArtifactIds: ['parent-1'],
        validatedAt: '2026-07-01T00:00:00.000Z',
      })
      expect(a.artifactType).toBe(artifactType)
    }
  })
})

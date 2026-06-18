import { describe, it, expect } from 'vitest'
import { createGeneralVaArtifact, GENERAL_VA_ARTIFACT_TYPES } from './general-va-artifact'

describe('general-va-artifact', () => {
  it('wraps a valid va-task-draft into a frozen Artifact', () => {
    const a = createGeneralVaArtifact({
      artifactId: 'va-1',
      artifactType: 'va-task-draft',
      sourceStepRunId: 'step-1',
      content: { summary: 'Book travel' },
      inputArtifactIds: ['intake-1'],
      validatedAt: '2026-07-01T00:00:00.000Z',
    })
    expect(a.artifactType).toBe('va-task-draft')
    expect(a.validation.status).toBe('valid')
    expect(a.lineage.inputArtifactIds).toEqual(['intake-1'])
    expect(Object.isFrozen(a)).toBe(true)
  })

  it('rejects an unknown VA artifact type', () => {
    expect(() =>
      createGeneralVaArtifact({
        artifactId: 'x',
        artifactType: 'not-va' as any,
        sourceStepRunId: 's',
        content: {},
        inputArtifactIds: ['i'],
        validatedAt: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow(/unknown general VA artifact type/)
  })

  it('rejects empty lineage (via parseArtifact)', () => {
    expect(() =>
      createGeneralVaArtifact({
        artifactId: 'x',
        artifactType: 'va-task-intake',
        sourceStepRunId: 's',
        content: {},
        inputArtifactIds: [],
        validatedAt: '2026-07-01T00:00:00.000Z',
      }),
    ).toThrow()
  })

  it('GENERAL_VA_ARTIFACT_TYPES lists the three VA steps', () => {
    expect(GENERAL_VA_ARTIFACT_TYPES).toEqual(['va-task-intake', 'va-task-draft', 'va-task-review'])
  })

  it('supports va-task-intake and va-task-review types', () => {
    const intake = createGeneralVaArtifact({
      artifactId: 'va-2',
      artifactType: 'va-task-intake',
      sourceStepRunId: 'step-2',
      content: { task: 'schedule meeting' },
      inputArtifactIds: ['prev-1'],
      validatedAt: '2026-07-01T00:00:00.000Z',
    })
    expect(intake.artifactType).toBe('va-task-intake')

    const review = createGeneralVaArtifact({
      artifactId: 'va-3',
      artifactType: 'va-task-review',
      sourceStepRunId: 'step-3',
      content: { verdict: 'approved' },
      inputArtifactIds: ['prev-2'],
      validatedAt: '2026-07-01T00:00:00.000Z',
    })
    expect(review.artifactType).toBe('va-task-review')
  })
})

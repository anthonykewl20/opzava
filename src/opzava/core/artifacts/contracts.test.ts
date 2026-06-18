import { describe, expect, it } from 'vitest'

import { createSecretReference } from '../../platform/admin-config/contracts'
import { parseArtifact } from './contracts'

describe('Opzava artifact contracts', () => {
  it('accepts versioned artifacts with validation status and lineage', () => {
    const artifact = parseArtifact({
      schemaVersion: 1,
      artifactId: 'artifact_seo_brief_001',
      artifactType: 'content.seoBrief',
      sourceStepRunId: 'step_run_seo_brief_001',
      content: {
        title: 'Example SEO Brief',
        primaryKeyword: 'self-hosted ai operations',
      },
      validation: {
        status: 'valid',
        checkedAt: '2026-06-15T00:00:00.000Z',
      },
      lineage: {
        inputArtifactIds: ['artifact_idea_001', 'artifact_sources_001'],
      },
    })

    expect(artifact.artifactType).toBe('content.seoBrief')
    expect(artifact.lineage.inputArtifactIds).toEqual(['artifact_idea_001', 'artifact_sources_001'])
  })

  it('rejects derived artifacts without lineage inputs', () => {
    expect(() =>
      parseArtifact({
        schemaVersion: 1,
        artifactId: 'artifact_draft_001',
        artifactType: 'content.articleDraft',
        sourceStepRunId: 'step_run_draft_001',
        content: {
          title: 'Draft without source lineage',
        },
        validation: {
          status: 'pending',
          checkedAt: null,
        },
        lineage: {
          inputArtifactIds: [],
        },
      }),
    ).toThrow(/lineage/i)
  })

  it('rejects secret references inside artifact content payloads', () => {
    expect(() =>
      parseArtifact({
        schemaVersion: 1,
        artifactId: 'artifact_bad_secret_001',
        artifactType: 'content.seoBrief',
        sourceStepRunId: 'step_run_seo_brief_001',
        content: {
          credential: createSecretReference({
            id: 'secret_provider_key',
            scope: 'provider-credential',
            purpose: 'provider-api-key',
          }),
        },
        validation: {
          status: 'invalid',
          checkedAt: '2026-06-15T00:00:00.000Z',
          message: 'Secret reference must not be stored in artifacts',
        },
        lineage: {
          inputArtifactIds: ['artifact_idea_001'],
        },
      }),
    ).toThrow(/secret/i)
  })
})

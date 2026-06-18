// Wraps an already-validated derived content payload as a generic Artifact (validation 'valid').
// `idea-intake` is excluded by design (ARD 0003): it is the root intake record, not a derived artifact.
// parseArtifact still enforces the non-empty-lineage and no-secret-reference invariants.
import {
  ARTIFACT_CONTRACT_SCHEMA_VERSION,
  parseArtifact,
  type Artifact,
} from '@/opzava/core/artifacts/contracts'

export const CONTENT_ARTIFACT_TYPES = [
  'keyword-research',
  'source-capture',
  'seo-brief',
  'outline',
  'article-draft',
  'fact-check-report',
  'brand-review',
  'anti-slop-review',
  'wordpress-draft-request',
] as const

export type ContentArtifactType = (typeof CONTENT_ARTIFACT_TYPES)[number]

export type CreateContentArtifactInput = Readonly<{
  artifactId: string
  artifactType: ContentArtifactType
  sourceStepRunId: string
  content: unknown
  inputArtifactIds: readonly string[]
  validatedAt: string
}>

export function createContentArtifact(input: CreateContentArtifactInput): Artifact {
  if (!CONTENT_ARTIFACT_TYPES.includes(input.artifactType)) {
    throw new Error(`unknown content artifact type: ${input.artifactType}`)
  }

  return parseArtifact({
    schemaVersion: ARTIFACT_CONTRACT_SCHEMA_VERSION,
    artifactId: input.artifactId,
    artifactType: input.artifactType,
    sourceStepRunId: input.sourceStepRunId,
    content: input.content,
    validation: { status: 'valid', checkedAt: input.validatedAt },
    lineage: { inputArtifactIds: [...input.inputArtifactIds] },
  })
}

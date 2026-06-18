import { ARTIFACT_CONTRACT_SCHEMA_VERSION, parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'

export const SOCIAL_ARTIFACT_TYPES = [
  'social-brief',
  'social-post-draft',
  'social-review',
  'social-schedule-request',
] as const

export type SocialArtifactType = (typeof SOCIAL_ARTIFACT_TYPES)[number]

export type CreateSocialArtifactInput = Readonly<{
  artifactId: string
  artifactType: SocialArtifactType
  sourceStepRunId: string
  content: unknown
  inputArtifactIds: readonly string[]
  validatedAt: string
}>

export function createSocialArtifact(input: CreateSocialArtifactInput): Artifact {
  if (!SOCIAL_ARTIFACT_TYPES.includes(input.artifactType)) {
    throw new Error(`unknown social artifact type: ${input.artifactType}`)
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

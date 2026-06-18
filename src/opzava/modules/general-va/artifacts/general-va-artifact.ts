import { ARTIFACT_CONTRACT_SCHEMA_VERSION, parseArtifact, type Artifact } from '@/opzava/core/artifacts/contracts'

export const GENERAL_VA_ARTIFACT_TYPES = ['va-task-intake', 'va-task-draft', 'va-task-review'] as const

export type GeneralVaArtifactType = (typeof GENERAL_VA_ARTIFACT_TYPES)[number]

export type CreateGeneralVaArtifactInput = Readonly<{
  artifactId: string
  artifactType: GeneralVaArtifactType
  sourceStepRunId: string
  content: unknown
  inputArtifactIds: readonly string[]
  validatedAt: string
}>

export function createGeneralVaArtifact(input: CreateGeneralVaArtifactInput): Artifact {
  if (!GENERAL_VA_ARTIFACT_TYPES.includes(input.artifactType)) {
    throw new Error(`unknown general VA artifact type: ${input.artifactType}`)
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

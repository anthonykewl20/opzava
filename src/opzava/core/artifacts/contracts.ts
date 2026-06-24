import { z } from 'zod'

import { isSecretReference } from '../secrets/contracts'

export const ARTIFACT_CONTRACT_SCHEMA_VERSION = 1 as const

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]))

export const artifactSchema = z.object({
  schemaVersion: z.literal(ARTIFACT_CONTRACT_SCHEMA_VERSION),
  artifactId: z.string().min(1).max(120),
  artifactType: z.string().min(1).max(120),
  sourceStepRunId: z.string().min(1).max(120),
  content: jsonValueSchema,
  validation: z.object({
    status: z.enum(['pending', 'valid', 'invalid']),
    checkedAt: z.string().min(1).nullable(),
    message: z.string().min(1).max(500).optional(),
  }).strict(),
  lineage: z.object({
    inputArtifactIds: z.array(z.string().min(1).max(120)),
  }).strict(),
}).strict().superRefine((artifact, ctx) => {
  if (artifact.lineage.inputArtifactIds.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['lineage', 'inputArtifactIds'], message: 'derived artifacts require lineage inputs' })
  }

  if (containsSecretReference(artifact.content)) {
    ctx.addIssue({ code: 'custom', path: ['content'], message: 'artifact content must not contain secret references' })
  }
})

export type Artifact = Readonly<z.infer<typeof artifactSchema>>

export function parseArtifact(input: unknown): Artifact {
  return Object.freeze(artifactSchema.parse(input))
}

function containsSecretReference(value: JsonValue): boolean {
  if (isSecretReference(value)) {
    return true
  }

  if (Array.isArray(value)) {
    return value.some((item) => containsSecretReference(item))
  }

  if (typeof value !== 'object' || value === null) {
    return false
  }

  return Object.values(value).some((item) => containsSecretReference(item))
}

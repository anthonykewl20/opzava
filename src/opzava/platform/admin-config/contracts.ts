import { z } from 'zod'

export const SECRET_REFERENCE_KIND = 'SecretReference' as const
export const ADMIN_CONFIG_SCHEMA_VERSION = 1 as const

export const secretReferenceSchema = z.object({
  kind: z.literal(SECRET_REFERENCE_KIND),
  id: z.string().min(1),
  scope: z.enum(['provider-credential', 'webhook-secret', 'gateway-credential', 'operator-secret']),
  purpose: z.string().min(1).max(200),
}).strict()

export type SecretReference = Readonly<z.infer<typeof secretReferenceSchema>>

export const secretResolutionFailureSchema = z.object({
  kind: z.literal('SecretResolutionFailure'),
  code: z.enum(['not-found', 'permission-denied', 'unavailable', 'invalid-reference']),
  reference: secretReferenceSchema,
  message: z.string().min(1).max(500),
}).strict()

export type SecretResolutionFailure = Readonly<z.infer<typeof secretResolutionFailureSchema>>
export type AuditSafeSecretResolutionFailure = Omit<SecretResolutionFailure, 'reference'> & {
  reference: `[secret-reference:${SecretReference['scope']}]`
}

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }
export type AdminConfigValue = JsonValue | SecretReference

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number().finite(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]))

const adminConfigValueSchema = z.union([jsonValueSchema, secretReferenceSchema])

export const adminConfigRecordSchema = z.object({
  schemaVersion: z.literal(ADMIN_CONFIG_SCHEMA_VERSION),
  key: z.string().min(1).max(200),
  owner: z.string().min(1).max(100),
  sensitivity: z.enum(['public', 'internal', 'secret']),
  value: adminConfigValueSchema,
  validation: z.object({
    status: z.enum(['pending', 'valid', 'invalid']),
    checkedAt: z.string().min(1),
    message: z.string().min(1).max(500).optional(),
  }).strict(),
  audit: z.object({
    actorId: z.string().min(1).max(200),
    reason: z.string().min(1).max(500),
    updatedAt: z.string().min(1),
  }).strict(),
}).strict().superRefine((record, ctx) => {
  if (record.sensitivity === 'secret' && !isSecretReference(record.value)) {
    ctx.addIssue({
      code: 'custom',
      path: ['value'],
      message: 'secret config records must store a SecretReference value',
    })
  }
})

export type AdminConfigRecord = Readonly<z.infer<typeof adminConfigRecordSchema>>
export type AuditSafeAdminConfigRecord = Omit<AdminConfigRecord, 'value'> & {
  value: Exclude<AdminConfigValue, SecretReference> | `[secret-reference:${SecretReference['scope']}]`
}

export function createSecretReference(input: Omit<SecretReference, 'kind'>): SecretReference {
  return Object.freeze(secretReferenceSchema.parse({
    kind: SECRET_REFERENCE_KIND,
    ...input,
  }))
}

export function isSecretReference(value: unknown): value is SecretReference {
  return secretReferenceSchema.safeParse(value).success
}

export function parseAdminConfigRecord(input: unknown): AdminConfigRecord {
  const record = adminConfigRecordSchema.parse(input)
  return Object.freeze(record)
}

export function parseSecretResolutionFailure(input: unknown): SecretResolutionFailure {
  const failure = secretResolutionFailureSchema.parse(input)
  return Object.freeze(failure)
}

export function redactAdminConfigRecordForAudit(record: AdminConfigRecord): AuditSafeAdminConfigRecord {
  if (isSecretReference(record.value)) {
    return {
      ...record,
      value: `[secret-reference:${record.value.scope}]`,
    }
  }

  return record
}

export function redactSecretResolutionFailureForAudit(
  failure: SecretResolutionFailure,
): AuditSafeSecretResolutionFailure {
  return {
    ...failure,
    reference: `[secret-reference:${failure.reference.scope}]`,
  }
}

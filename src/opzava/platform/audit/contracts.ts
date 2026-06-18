import { z } from 'zod'

import { isSecretReference } from '../admin-config/contracts'

export const AUDIT_EVENT_SCHEMA_VERSION = 1 as const

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

const auditSummarySchema = jsonValueSchema.nullable()

export const auditEventSchema = z.object({
  schemaVersion: z.literal(AUDIT_EVENT_SCHEMA_VERSION),
  auditEventId: z.string().min(1).max(120),
  actorId: z.string().min(1).max(200),
  action: z.string().min(1).max(160),
  target: z.object({
    kind: z.string().min(1).max(120),
    id: z.string().min(1).max(120),
  }).strict(),
  beforeSummary: auditSummarySchema,
  afterSummary: auditSummarySchema,
  correlationId: z.string().min(1).max(160),
  occurredAt: z.string().min(1),
}).strict().superRefine((event, ctx) => {
  if (containsSecretReference(event.beforeSummary) || containsSecretReference(event.afterSummary)) {
    ctx.addIssue({ code: 'custom', path: ['afterSummary'], message: 'audit summaries must not contain secret references' })
  }
})

export type AuditEvent = Readonly<z.infer<typeof auditEventSchema>>

export function parseAuditEvent(input: unknown): AuditEvent {
  return Object.freeze(auditEventSchema.parse(input))
}

function containsSecretReference(value: JsonValue | null): boolean {
  if (value === null) return false
  if (isSecretReference(value)) return true

  if (Array.isArray(value)) {
    return value.some((item) => containsSecretReference(item))
  }

  if (typeof value !== 'object') {
    return false
  }

  return Object.values(value).some((item) => containsSecretReference(item))
}

import { z } from 'zod'

import {
  isSecretReference,
  secretReferenceSchema,
  type SecretReference,
} from '../admin-config/contracts'

export const PROVIDER_PROFILE_SCHEMA_VERSION = 1 as const
export const EXTERNAL_CALL_SCHEMA_VERSION = 1 as const
export const PROVIDER_ADAPTER_REQUEST_SCHEMA_VERSION = 1 as const
export const PROVIDER_ADAPTER_RESULT_SCHEMA_VERSION = 1 as const

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

const providerProfileInputSchema = z.object({
  schemaVersion: z.literal(PROVIDER_PROFILE_SCHEMA_VERSION),
  providerId: z.string().min(1).max(100),
  displayName: z.string().min(1).max(120),
  kind: z.enum(['llm', 'publishing', 'search', 'email', 'gateway']),
  mode: z.enum(['mock', 'live']),
  credentialRef: z.unknown().optional(),
  config: z.record(z.string(), jsonValueSchema).default({}),
}).strict().superRefine((profile, ctx) => {
  if (profile.credentialRef !== undefined && !isSecretReference(profile.credentialRef)) {
    ctx.addIssue({
      code: 'custom',
      path: ['credentialRef'],
      message: 'provider credentials must be represented as a SecretReference',
    })
  }

  if (profile.mode === 'live' && !isSecretReference(profile.credentialRef)) {
    ctx.addIssue({
      code: 'custom',
      path: ['credentialRef'],
      message: 'live provider profiles require a SecretReference credentialRef',
    })
  }
})

export type ProviderProfile = Readonly<{
  schemaVersion: typeof PROVIDER_PROFILE_SCHEMA_VERSION
  providerId: string
  displayName: string
  kind: 'llm' | 'publishing' | 'search' | 'email' | 'gateway'
  mode: 'mock' | 'live'
  credentialRef?: SecretReference
  config: Record<string, JsonValue>
}>

export type AuditSafeProviderProfile = Omit<ProviderProfile, 'credentialRef'> & {
  credentialRef?: `[secret-reference:${SecretReference['scope']}]`
}

const retrySchema = z.object({
  attemptNumber: z.number().int().min(1),
  maxAttempts: z.number().int().min(1).max(20),
}).strict().superRefine((retry, ctx) => {
  if (retry.attemptNumber > retry.maxAttempts) {
    ctx.addIssue({ code: 'custom', path: ['attemptNumber'], message: 'attempt number cannot exceed max attempts' })
  }
})

const providerAdapterRequestInputSchema = z.object({
  schemaVersion: z.literal(PROVIDER_ADAPTER_REQUEST_SCHEMA_VERSION),
  requestId: z.string().min(1).max(120),
  providerProfile: providerProfileInputSchema,
  operation: z.string().min(1).max(120),
  workflowRunId: z.string().min(1).max(120),
  stepRunId: z.string().min(1).max(120).nullable(),
  idempotencyKey: z.string().min(1).max(240),
  timeoutMs: z.number().int().min(1).max(3_600_000),
  retry: retrySchema,
  input: jsonValueSchema,
  requestSummary: jsonValueSchema,
  startedAt: z.string().min(1),
}).strict().superRefine((request, ctx) => {
  if (containsSecretReference(request.input) || containsSecretReference(request.requestSummary)) {
    ctx.addIssue({ code: 'custom', path: ['input'], message: 'provider adapter inputs and summaries must not contain secret references' })
  }

  const allowedOperations = getAllowedOperations(request.providerProfile.config)
  if (!allowedOperations) {
    ctx.addIssue({ code: 'custom', path: ['providerProfile', 'config', 'allowedOperations'], message: 'provider adapter profiles require an allowedOperations list' })
    return
  }

  if (!allowedOperations.includes(request.operation)) {
    ctx.addIssue({ code: 'custom', path: ['operation'], message: 'operation is not allowed for this provider profile' })
  }
})

const providerAdapterResultSchema = z.object({
  schemaVersion: z.literal(PROVIDER_ADAPTER_RESULT_SCHEMA_VERSION),
  requestId: z.string().min(1).max(120),
  status: z.enum(['succeeded', 'failed', 'timed-out']),
  output: jsonValueSchema.nullable(),
  outputSummary: jsonValueSchema.nullable(),
  error: z.object({
    class: z.enum(['timeout', 'provider-error', 'validation-error', 'permission-error', 'unknown']),
    message: z.string().min(1).max(500),
  }).strict().nullable(),
  finishedAt: z.string().min(1),
}).strict().superRefine((result, ctx) => {
  if (containsSecretReference(result.output) || containsSecretReference(result.outputSummary)) {
    ctx.addIssue({ code: 'custom', path: ['outputSummary'], message: 'provider adapter outputs and summaries must not contain secret references' })
  }

  if (result.status === 'succeeded' && result.error !== null) {
    ctx.addIssue({ code: 'custom', path: ['error'], message: 'succeeded provider results must not carry an error summary' })
  }

  if (result.status !== 'succeeded' && result.error === null) {
    ctx.addIssue({ code: 'custom', path: ['error'], message: 'failed provider results require an error summary' })
  }
})

export const externalCallRecordSchema = z.object({
  schemaVersion: z.literal(EXTERNAL_CALL_SCHEMA_VERSION),
  externalCallId: z.string().min(1).max(120),
  providerId: z.string().min(1).max(100),
  operation: z.string().min(1).max(120),
  workflowRunId: z.string().min(1).max(120),
  stepRunId: z.string().min(1).max(120).nullable(),
  status: z.enum(['pending', 'succeeded', 'failed', 'timed-out']),
  idempotencyKey: z.string().min(1).max(240),
  timeoutMs: z.number().int().min(1).max(3_600_000),
  retry: z.object({
    attemptNumber: z.number().int().min(1),
    maxAttempts: z.number().int().min(1).max(20),
  }).strict(),
  requestSummary: jsonValueSchema,
  responseSummary: jsonValueSchema.nullable(),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1).nullable(),
}).strict().superRefine((record, ctx) => {
  if (record.retry.attemptNumber > record.retry.maxAttempts) {
    ctx.addIssue({ code: 'custom', path: ['retry', 'attemptNumber'], message: 'attempt number cannot exceed max attempts' })
  }

  if (record.status === 'pending' && record.finishedAt !== null) {
    ctx.addIssue({ code: 'custom', path: ['finishedAt'], message: 'pending external calls must not have a finish time' })
  }

  if (record.status !== 'pending' && record.finishedAt === null) {
    ctx.addIssue({ code: 'custom', path: ['finishedAt'], message: 'completed external calls require a finish time' })
  }

  if (containsSecretReference(record.requestSummary) || containsSecretReference(record.responseSummary)) {
    ctx.addIssue({ code: 'custom', path: ['requestSummary'], message: 'external-call summaries must not contain secret references' })
  }
})

export type ExternalCallRecord = Readonly<z.infer<typeof externalCallRecordSchema>>
export type ProviderAdapterRequest = Readonly<Omit<z.infer<typeof providerAdapterRequestInputSchema>, 'providerProfile'> & {
  providerProfile: ProviderProfile
}>
export type AuditSafeProviderAdapterRequest = Omit<ProviderAdapterRequest, 'providerProfile'> & {
  providerProfile: AuditSafeProviderProfile
}
export type ProviderAdapterResult = Readonly<z.infer<typeof providerAdapterResultSchema>>
export type ProviderAdapter = Readonly<{
  execute: (request: ProviderAdapterRequest, signal: AbortSignal) => Promise<ProviderAdapterResult>
}>

export function parseProviderProfile(input: unknown): ProviderProfile {
  const profile = providerProfileInputSchema.parse(input)
  const credentialRef = profile.credentialRef === undefined
    ? undefined
    : secretReferenceSchema.parse(profile.credentialRef)

  return Object.freeze({
    ...profile,
    credentialRef,
  })
}

export function parseExternalCallRecord(input: unknown): ExternalCallRecord {
  return Object.freeze(externalCallRecordSchema.parse(input))
}

export function parseProviderAdapterRequest(input: unknown): ProviderAdapterRequest {
  const request = providerAdapterRequestInputSchema.parse(input)

  return Object.freeze({
    ...request,
    providerProfile: parseProviderProfile(request.providerProfile),
  })
}

export function parseProviderAdapterResult(input: unknown): ProviderAdapterResult {
  return Object.freeze(providerAdapterResultSchema.parse(input))
}

export function createExternalCallRecordFromProviderAdapterResult(input: Readonly<{
  externalCallId: string
  request: ProviderAdapterRequest
  result: ProviderAdapterResult
}>): ExternalCallRecord {
  if (input.request.requestId !== input.result.requestId) {
    throw new Error('provider adapter result requestId must match the request')
  }

  return parseExternalCallRecord({
    schemaVersion: EXTERNAL_CALL_SCHEMA_VERSION,
    externalCallId: input.externalCallId,
    providerId: input.request.providerProfile.providerId,
    operation: input.request.operation,
    workflowRunId: input.request.workflowRunId,
    stepRunId: input.request.stepRunId,
    status: input.result.status,
    idempotencyKey: input.request.idempotencyKey,
    timeoutMs: input.request.timeoutMs,
    retry: input.request.retry,
    requestSummary: input.request.requestSummary,
    responseSummary: input.result.status === 'succeeded'
      ? input.result.outputSummary
      : { errorClass: input.result.error?.class ?? input.result.status },
    startedAt: input.request.startedAt,
    finishedAt: input.result.finishedAt,
  })
}

export function redactProviderAdapterRequestForAudit(request: ProviderAdapterRequest): AuditSafeProviderAdapterRequest {
  return {
    ...request,
    providerProfile: redactProviderProfileForAudit(request.providerProfile),
  }
}

export function redactProviderProfileForAudit(profile: ProviderProfile): AuditSafeProviderProfile {
  if (!profile.credentialRef) {
    const { credentialRef: _credentialRef, ...auditProfile } = profile
    return auditProfile
  }

  return {
    ...profile,
    credentialRef: `[secret-reference:${profile.credentialRef.scope}]`,
  }
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

function getAllowedOperations(config: Record<string, JsonValue>): string[] | null {
  const allowedOperations = config.allowedOperations
  if (!Array.isArray(allowedOperations) || allowedOperations.length === 0) return null
  const operations = allowedOperations.filter((operation): operation is string => typeof operation === 'string' && operation.length > 0)
  if (operations.length !== allowedOperations.length) return null

  return operations
}

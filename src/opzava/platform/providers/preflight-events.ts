import { AUDIT_EVENT_SCHEMA_VERSION, parseAuditEvent } from '../audit/contracts'
import {
  redactSecretResolutionFailureForAudit,
  type SecretResolutionFailure,
} from '../admin-config/contracts'
import type { RuntimeSettingsUnavailable } from '../admin-config/runtime-loader'
import {
  parseOperationalEventStorageRecord,
  RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
  type OperationalEventStorageRecord,
} from '../runner/repository-contracts'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export type ProviderPreflightFailureEventError =
  | Readonly<{ kind: 'runtime-settings-unavailable', cause: RuntimeSettingsUnavailable }>
  | Readonly<{ kind: 'secret-resolution-failed', cause: SecretResolutionFailure }>

export type ProviderPreflightFailureEventInput = Readonly<{
  recordId: string
  auditEventId: string
  actorId: string
  requestId: string
  providerId: string
  operation: string
  workflowRunId: string
  stepRunId: string | null
  occurredAt: string
  error: ProviderPreflightFailureEventError
}>

export function createProviderPreflightFailureOperationalEvent(
  input: ProviderPreflightFailureEventInput,
): OperationalEventStorageRecord {
  const event = parseAuditEvent({
    schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
    auditEventId: input.auditEventId,
    actorId: input.actorId,
    action: 'provider.preflight.blocked',
    target: {
      kind: 'provider',
      id: input.providerId,
    },
    beforeSummary: null,
    afterSummary: createAfterSummary(input),
    correlationId: input.requestId,
    occurredAt: input.occurredAt,
  })

  return parseOperationalEventStorageRecord({
    schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
    recordId: input.recordId,
    kind: 'audit',
    workflowRunId: input.workflowRunId,
    stepRunId: input.stepRunId,
    occurredAt: input.occurredAt,
    event,
  })
}

function createAfterSummary(input: ProviderPreflightFailureEventInput): JsonValue {
  return {
    requestId: input.requestId,
    providerId: input.providerId,
    operation: input.operation,
    errorKind: input.error.kind,
    cause: createSafeCause(input.error),
  }
}

function createSafeCause(error: ProviderPreflightFailureEventError): JsonValue {
  if (error.kind === 'runtime-settings-unavailable') {
    return {
      kind: error.kind,
      reason: error.cause.reason,
    }
  }

  const redacted = redactSecretResolutionFailureForAudit(error.cause)

  return {
    kind: error.kind,
    code: error.cause.code,
    reference: redacted.reference,
  }
}

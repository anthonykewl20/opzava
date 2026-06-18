import { AUDIT_EVENT_SCHEMA_VERSION, parseAuditEvent } from '../audit/contracts'
import {
  parseOperationalEventStorageRecord,
  RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
} from '../runner/repository-contracts'

export type ProviderExecutionRecordedStatus = 'succeeded' | 'failed' | 'timed-out'

export type ProviderExecutionAuditEventInput = Readonly<{
  recordId: string
  auditEventId: string
  actorId: string
  occurredAt: string
  requestId: string
  providerId: string
  operation: string
  workflowRunId: string
  stepRunId: string | null
  externalCallId: string
  status: ProviderExecutionRecordedStatus
}>

export function createProviderExecutionAuditOperationalEvent(
  input: ProviderExecutionAuditEventInput,
) {
  const event = parseAuditEvent({
    schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
    auditEventId: input.auditEventId,
    actorId: input.actorId,
    action: 'provider.execution.recorded',
    target: {
      kind: 'provider',
      id: input.providerId,
    },
    beforeSummary: null,
    afterSummary: createRecordedSummary(input),
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

// A fresh allow-listed summary. No payloads, prompts, credentials, or secret references
// can be recorded here even if the caller supplies extra fields.
function createRecordedSummary(input: ProviderExecutionAuditEventInput) {
  return Object.freeze({
    requestId: input.requestId,
    providerId: input.providerId,
    operation: input.operation,
    externalCallId: input.externalCallId,
    status: input.status,
    outcome: 'executed',
  })
}

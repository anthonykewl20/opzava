import { AUDIT_EVENT_SCHEMA_VERSION, parseAuditEvent } from '../audit/contracts'
import {
  parseOperationalEventStorageRecord,
  RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
} from '../runner/repository-contracts'
import type { ProviderExecutionApprovalDecision, ProviderExecutionApprovalError } from './approval-runtime'

export type ProviderExecutionApprovalEventInput = Readonly<{
  recordId: string
  auditEventId: string
  actorId: string
  occurredAt: string
  requestId: string
  providerId: string
  operation: string
  workflowRunId: string
  stepRunId: string | null
  decision: ProviderExecutionApprovalDecision
}>

export function createProviderExecutionApprovalOperationalEvent(
  input: ProviderExecutionApprovalEventInput,
) {
  const action = input.decision.ok
    ? 'provider.execution.approval.allowed'
    : 'provider.execution.approval.denied'
  const event = parseAuditEvent({
    schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
    auditEventId: input.auditEventId,
    actorId: input.actorId,
    action,
    target: {
      kind: 'provider',
      id: input.providerId,
    },
    beforeSummary: null,
    afterSummary: input.decision.ok
      ? createAllowedSummary(input)
      : createDeniedSummary(input, input.decision.error),
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

function createAllowedSummary(input: ProviderExecutionApprovalEventInput) {
  if (!input.decision.ok) throw new TypeError('approval decision must be allowed')

  return Object.freeze({
    requestId: input.requestId,
    providerId: input.providerId,
    operation: input.operation,
    outcome: 'allowed',
    approvalId: input.decision.value.approvalId,
    expiresAt: input.decision.value.expiresAt,
  })
}

function createDeniedSummary(
  input: ProviderExecutionApprovalEventInput,
  error: ProviderExecutionApprovalError,
) {
  const approvalId = getApprovalId(error)
  const summary = {
    requestId: input.requestId,
    providerId: input.providerId,
    operation: input.operation,
    outcome: 'denied',
    reason: error.kind,
    ...(approvalId === null ? {} : { approvalId }),
  }

  return Object.freeze(summary)
}

function getApprovalId(error: ProviderExecutionApprovalError): string | null {
  if ('approvalId' in error) {
    return error.approvalId
  }

  return null
}

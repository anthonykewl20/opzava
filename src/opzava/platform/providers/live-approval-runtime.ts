import type { Approval } from '../../core/approvals/contracts'
import type { ExternalCallRecord, ProviderAdapter } from './contracts'
import { createProviderExecutionApprovalOperationalEvent } from './approval-events'
import { createProviderExecutionAuditOperationalEvent } from './audit-events'
import { evaluateProviderExecutionApproval, type ProviderExecutionApprovalError } from './approval-runtime'
import type { ProviderExecutionClock, ProviderExecutionEventSink, ProviderExecutionResult } from './execution'
import {
  executeApprovedLiveProviderActionOnce,
  type ApprovedLiveProviderExecutionResult,
  type ExistingExternalCallLookup,
} from './live-execution-runtime'
import { createProviderPreflightFailureOperationalEvent } from './preflight-events'
import { createProviderExecutionPreflight, type ProviderExecutionPreflightError, type ProviderExecutionPreflightOptions } from './preflight-runtime'

type ApprovedLiveProviderExecutionError = Extract<ApprovedLiveProviderExecutionResult, { ok: false }>['error']

export type LiveProviderExecutionGuardError =
  | Readonly<{ kind: 'preflight-failed', cause: ProviderExecutionPreflightError }>
  | Readonly<{ kind: 'unexpected-mock-profile', providerId: string, mode: 'mock' }>
  | Readonly<{ kind: 'approval-denied', cause: ProviderExecutionApprovalError }>
  | Readonly<{ kind: 'live-execution-disabled', providerId: string, approvalId: string, expiresAt: string }>
  | Readonly<{ kind: 'live-execution-grant-mismatch', cause: ApprovedLiveProviderExecutionError }>

export type LiveProviderExecutionGuardResult =
  | Readonly<{ ok: false, error: LiveProviderExecutionGuardError }>
  | Readonly<{ ok: true, outcome: 'executed', externalCallRecord: ExternalCallRecord, result: ProviderExecutionResult }>
  | Readonly<{ ok: true, outcome: 'already-executed', externalCallRecord: ExternalCallRecord }>
  | Readonly<{ ok: true, outcome: 'reserved-elsewhere' }>

// Caller-supplied identity for the durable audit receipt emitted when a live action executes.
export type LiveProviderExecutionAuditIdentity = Readonly<{
  recordId: string
  auditEventId: string
  actorId: string
  occurredAt: string
}>

// Optional live-execution dependencies. When supplied, a granted approval hands off to the
// idempotent execution boundary instead of stopping at `live-execution-disabled`.
export type LiveProviderExecutionHandoff = Readonly<{
  adapter: ProviderAdapter
  idempotency: ExistingExternalCallLookup
  externalCallId: string
  signal: AbortSignal
  clock?: ProviderExecutionClock
  recordedAudit?: LiveProviderExecutionAuditIdentity
}>

export type LiveProviderExecutionGuardOptions = ProviderExecutionPreflightOptions & Readonly<{
  approval: Approval | null
  approvalTargetId: string
  requestedAction: string
  now: Date
  eventSink: ProviderExecutionEventSink
  blockedEvent: Readonly<{
    recordId: string
    auditEventId: string
    actorId: string
    occurredAt: string
  }>
  liveExecution?: LiveProviderExecutionHandoff
}>

export async function guardLiveProviderExecutionAfterPreflight(
  options: LiveProviderExecutionGuardOptions,
): Promise<LiveProviderExecutionGuardResult> {
  const preflight = await createProviderExecutionPreflight(options)
  if (!preflight.ok) {
    options.eventSink.appendOperationalEvent(createProviderPreflightFailureOperationalEvent({
      ...options.blockedEvent,
      requestId: options.requestId,
      providerId: options.providerProfile.providerId,
      operation: options.operation,
      workflowRunId: options.workflowRunId,
      stepRunId: options.stepRunId,
      error: preflight.error,
    }))

    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'preflight-failed',
        cause: preflight.error,
      }),
    })
  }

  const request = preflight.value.request
  if (request.providerProfile.mode === 'mock') {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'unexpected-mock-profile',
        providerId: request.providerProfile.providerId,
        mode: 'mock',
      }),
    })
  }

  const decision = evaluateProviderExecutionApproval({
    request,
    approval: options.approval,
    approvalTargetId: options.approvalTargetId,
    requestedAction: options.requestedAction,
    now: options.now,
  })

  options.eventSink.appendOperationalEvent(createProviderExecutionApprovalOperationalEvent({
    ...options.blockedEvent,
    requestId: request.requestId,
    providerId: request.providerProfile.providerId,
    operation: request.operation,
    workflowRunId: request.workflowRunId,
    stepRunId: request.stepRunId,
    decision,
  }))

  if (!decision.ok) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'approval-denied',
        cause: decision.error,
      }),
    })
  }

  // Without live-execution dependencies the guard stays a pure decision and stops here.
  if (options.liveExecution === undefined) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'live-execution-disabled',
        providerId: request.providerProfile.providerId,
        approvalId: decision.value.approvalId,
        expiresAt: decision.value.expiresAt,
      }),
    })
  }

  const execution = await executeApprovedLiveProviderActionOnce({
    grant: decision.value,
    adapter: options.liveExecution.adapter,
    request,
    externalCallId: options.liveExecution.externalCallId,
    eventSink: options.eventSink,
    signal: options.liveExecution.signal,
    idempotency: options.liveExecution.idempotency,
    clock: options.liveExecution.clock,
  })

  if (!execution.ok) {
    // The grant is derived from this exact request, so a mismatch is unreachable in practice.
    // Surface it explicitly rather than treating a non-execution as success.
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'live-execution-grant-mismatch',
        cause: execution.error,
      }),
    })
  }

  if (execution.outcome === 'already-executed') {
    return Object.freeze({
      ok: true,
      outcome: 'already-executed',
      externalCallRecord: execution.externalCallRecord,
    })
  }

  // Unreachable while the guard injects no reservation, but forwarded so a future slice can wire
  // reservation into the guard without changing this mapping.
  if (execution.outcome === 'reserved-elsewhere') {
    return Object.freeze({ ok: true, outcome: 'reserved-elsewhere' })
  }

  // A freshly executed live action gets a durable, redacted audit receipt when the caller
  // supplies its identity. Already-executed actions are skipped: their receipt was minted before.
  const recordedAudit = options.liveExecution.recordedAudit
  if (recordedAudit !== undefined) {
    options.eventSink.appendOperationalEvent(createProviderExecutionAuditOperationalEvent({
      ...recordedAudit,
      requestId: request.requestId,
      providerId: request.providerProfile.providerId,
      operation: request.operation,
      workflowRunId: request.workflowRunId,
      stepRunId: request.stepRunId,
      externalCallId: execution.value.externalCallRecord.externalCallId,
      status: execution.value.result.status,
    }))
  }

  return Object.freeze({
    ok: true,
    outcome: 'executed',
    externalCallRecord: execution.value.externalCallRecord,
    result: execution.value,
  })
}

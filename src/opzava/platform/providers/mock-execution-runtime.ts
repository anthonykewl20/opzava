import { AUDIT_EVENT_SCHEMA_VERSION, parseAuditEvent } from '../audit/contracts'
import {
  parseOperationalEventStorageRecord,
  RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
} from '../runner/repository-contracts'
import { executeProviderAdapterWithEvents, type ProviderExecutionClock, type ProviderExecutionEventSink, type ProviderExecutionResult } from './execution'
import { createProviderPreflightFailureOperationalEvent } from './preflight-events'
import { createProviderExecutionPreflight, type ProviderExecutionPreflightError, type ProviderExecutionPreflightOptions } from './preflight-runtime'
import type { ProviderAdapter } from './contracts'

export type MockProviderExecutionError =
  | Readonly<{ kind: 'preflight-failed', cause: ProviderExecutionPreflightError }>
  | Readonly<{ kind: 'execution-blocked-non-mock-profile', providerId: string, mode: 'live' }>
  | Readonly<{ kind: 'invalid-external-call-id', reason: 'empty' | 'too-long' }>

export type MockProviderExecutionResult =
  | Readonly<{ ok: true, value: ProviderExecutionResult }>
  | Readonly<{ ok: false, error: MockProviderExecutionError }>

export type MockProviderExecutionBlockedEventOptions = Readonly<{
  recordId: string
  auditEventId: string
  actorId: string
  occurredAt: string
}>

export type MockProviderExecutionOptions = ProviderExecutionPreflightOptions & Readonly<{
  adapter: ProviderAdapter
  eventSink: ProviderExecutionEventSink
  signal: AbortSignal
  externalCallId: string
  blockedEvent: MockProviderExecutionBlockedEventOptions
  clock?: ProviderExecutionClock
}>

export async function executeMockProviderAfterPreflight(
  options: MockProviderExecutionOptions,
): Promise<MockProviderExecutionResult> {
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
  if (request.providerProfile.mode !== 'mock') {
    options.eventSink.appendOperationalEvent(createLiveProviderBlockedOperationalEvent({
      ...options.blockedEvent,
      requestId: request.requestId,
      providerId: request.providerProfile.providerId,
      operation: request.operation,
      workflowRunId: request.workflowRunId,
      stepRunId: request.stepRunId,
    }))

    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'execution-blocked-non-mock-profile',
        providerId: request.providerProfile.providerId,
        mode: request.providerProfile.mode,
      }),
    })
  }

  const externalCallIdValidation = validateExternalCallId(options.externalCallId)
  if (!externalCallIdValidation.ok) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'invalid-external-call-id',
        reason: externalCallIdValidation.reason,
      }),
    })
  }

  return Object.freeze({
    ok: true,
    value: await executeProviderAdapterWithEvents({
      adapter: options.adapter,
      request,
      externalCallId: options.externalCallId,
      eventSink: options.eventSink,
      signal: options.signal,
      clock: options.clock,
    }),
  })
}

type ExternalCallIdValidation =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false, reason: 'empty' | 'too-long' }>

function validateExternalCallId(externalCallId: string): ExternalCallIdValidation {
  if (externalCallId.length === 0) {
    return Object.freeze({ ok: false, reason: 'empty' })
  }

  if (externalCallId.length > 120) {
    return Object.freeze({ ok: false, reason: 'too-long' })
  }

  return Object.freeze({ ok: true })
}

type LiveProviderBlockedEventInput = MockProviderExecutionBlockedEventOptions & Readonly<{
  requestId: string
  providerId: string
  operation: string
  workflowRunId: string
  stepRunId: string | null
}>

function createLiveProviderBlockedOperationalEvent(input: LiveProviderBlockedEventInput) {
  const event = parseAuditEvent({
    schemaVersion: AUDIT_EVENT_SCHEMA_VERSION,
    auditEventId: input.auditEventId,
    actorId: input.actorId,
    action: 'provider.execution.blocked.live-profile',
    target: {
      kind: 'provider',
      id: input.providerId,
    },
    beforeSummary: null,
    afterSummary: {
      requestId: input.requestId,
      providerId: input.providerId,
      operation: input.operation,
      reason: 'live-provider-not-approved',
    },
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

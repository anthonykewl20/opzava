import type { ExternalCallRecord, ProviderAdapter, ProviderAdapterRequest } from './contracts'
import type { ProviderExecutionApprovalGrant } from './approval-runtime'
import type { ExternalCallReservation } from './external-call-reservation'
import {
  executeProviderAdapterWithEvents,
  type ProviderExecutionClock,
  type ProviderExecutionEventSink,
  type ProviderExecutionResult,
} from './execution'

// Injected port for idempotency. This boundary never persists or looks up records itself;
// the caller supplies how to find a prior external call for a given idempotency key.
export type ExistingExternalCallLookup = Readonly<{
  findExistingExternalCall: (idempotencyKey: string) => ExternalCallRecord | null
}>

export type ApprovedLiveProviderExecutionOptions = Readonly<{
  grant: ProviderExecutionApprovalGrant
  adapter: ProviderAdapter
  request: ProviderAdapterRequest
  externalCallId: string
  eventSink: ProviderExecutionEventSink
  signal: AbortSignal
  idempotency: ExistingExternalCallLookup
  // Optional atomic reservation. When supplied, the boundary reserves the idempotency key before
  // executing; losing the reservation means another caller owns the key and the adapter never runs.
  reservation?: Readonly<{
    reserve: ExternalCallReservation
    reservedAt: string
  }>
  clock?: ProviderExecutionClock
}>

export type ApprovedLiveProviderExecutionResult =
  | Readonly<{ ok: true, outcome: 'already-executed', externalCallRecord: ExternalCallRecord }>
  | Readonly<{ ok: true, outcome: 'reserved-elsewhere' }>
  | Readonly<{ ok: true, outcome: 'executed', value: ProviderExecutionResult }>
  | Readonly<{ ok: false, error: Readonly<{ kind: 'grant-provider-mismatch', grantProviderId: string, requestProviderId: string }> }>
  | Readonly<{ ok: false, error: Readonly<{ kind: 'grant-operation-mismatch', grantOperation: string, requestOperation: string }> }>

export async function executeApprovedLiveProviderActionOnce(
  options: ApprovedLiveProviderExecutionOptions,
): Promise<ApprovedLiveProviderExecutionResult> {
  // The grant must authorize the exact provider and operation being executed.
  const requestProviderId = options.request.providerProfile.providerId
  if (options.grant.providerId !== requestProviderId) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'grant-provider-mismatch',
        grantProviderId: options.grant.providerId,
        requestProviderId,
      }),
    })
  }

  if (options.grant.operation !== options.request.operation) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'grant-operation-mismatch',
        grantOperation: options.grant.operation,
        requestOperation: options.request.operation,
      }),
    })
  }

  // Fast path: a completed external call for this key means the live action already happened.
  const existing = options.idempotency.findExistingExternalCall(options.request.idempotencyKey)
  if (existing !== null) {
    return Object.freeze({
      ok: true,
      outcome: 'already-executed',
      externalCallRecord: existing,
    })
  }

  // Atomic reservation: when supplied, reserve the idempotency key before executing so two
  // concurrent callers cannot both run the action. Losing the reservation means another caller
  // owns this key; the adapter never runs in that case.
  if (options.reservation !== undefined) {
    const reserved = options.reservation.reserve.reserveExternalCall({
      idempotencyKey: options.request.idempotencyKey,
      externalCallId: options.externalCallId,
      reservedAt: options.reservation.reservedAt,
    })

    if (reserved.outcome === 'already-reserved') {
      // The winner may have completed between the fast-path lookup and our reservation attempt.
      const completed = options.idempotency.findExistingExternalCall(options.request.idempotencyKey)
      if (completed !== null) {
        return Object.freeze({
          ok: true,
          outcome: 'already-executed',
          externalCallRecord: completed,
        })
      }

      return Object.freeze({ ok: true, outcome: 'reserved-elsewhere' })
    }
  }

  let value: ProviderExecutionResult
  try {
    value = await executeProviderAdapterWithEvents({
      adapter: options.adapter,
      request: options.request,
      externalCallId: options.externalCallId,
      eventSink: options.eventSink,
      signal: options.signal,
      clock: options.clock,
    })
  } catch (error) {
    // A thrown execution (for example an event-sink write failure) leaves the action's outcome
    // unknown; release the reservation so the key is not poisoned and a retry can win again.
    if (options.reservation !== undefined) {
      options.reservation.reserve.releaseExternalCall(options.request.idempotencyKey)
    }
    throw error
  }

  // A reserved action that did not succeed releases its reservation so a later retry can win the
  // key again. A successful action keeps the reservation so genuine duplicates still lose.
  if (options.reservation !== undefined && value.result.status !== 'succeeded') {
    options.reservation.reserve.releaseExternalCall(options.request.idempotencyKey)
  }

  return Object.freeze({
    ok: true,
    outcome: 'executed',
    value,
  })
}

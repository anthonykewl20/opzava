import { RunnerExecutionError, type RunnerExecutor } from '@/opzava/platform/runner/worker'
import { type Job, type Attempt } from '@/opzava/platform/runner/contracts'
import type { Approval } from '@/opzava/core/approvals/contracts'
import type { ProviderAdapter, ProviderProfile } from '@/opzava/platform/providers/contracts'
import type { ExistingExternalCallLookup } from '@/opzava/platform/providers/live-execution-runtime'
import type { ExternalCallReservation } from '@/opzava/platform/providers/external-call-reservation'
import type { ProviderExecutionEventSink } from '@/opzava/platform/providers/execution'
import type { RuntimeSettingsLoader } from '@/opzava/platform/admin-config/runtime-loader'
import type { SecretResolver } from '@/opzava/platform/providers/credentials-runtime'
import {
  guardLiveProviderExecutionAfterPreflight,
  type LiveProviderExecutionGuardError,
} from '@/opzava/platform/providers/live-approval-runtime'
import { RESEND_LIVE_OPERATION } from '@/opzava/modules/content/providers/resend-live-adapter'
import { type CampaignEmailMessage } from './email-campaign'

/**
 * F1b — the per-message campaign send routed through the live-provider guard.
 *
 * The plain `createCampaignSendExecutor` calls the email sender directly, so a send leaves no
 * provider-level receipt and has no provider-level exactly-once. This executor instead hands each
 * job to `guardLiveProviderExecutionAfterPreflight`, which (given a granted approval) executes the
 * Resend adapter through the idempotent boundary: it emits an external-call receipt + a redacted
 * audit event, and refuses to run the adapter a second time when a succeeded external call already
 * exists for the job's idempotency key. The send therefore happens at most once and is always
 * recorded.
 *
 * Approval is still required: a denied/absent approval surfaces as a permission error and the
 * adapter never runs — the F1 gate holds at the provider layer too.
 */

// Identity for a durable operational/audit event the guard mints. The caller supplies fresh ids
// per job so each receipt is uniquely addressable.
export type GuardedSendEventIdentity = Readonly<{
  recordId: string
  auditEventId: string
  actorId: string
  occurredAt: string
}>

export type GuardedCampaignSendExecutorDeps = Readonly<{
  loader: RuntimeSettingsLoader
  resolver: SecretResolver
  /** Live Resend adapter, built from the secret-resolved connection (never a cleartext key). */
  adapter: ProviderAdapter
  /** `createLiveResendProviderProfile(credentialId)` — names the env secret, not its value. */
  providerProfile: ProviderProfile
  /** Repository-backed lookup so exactly-once survives across worker restarts. */
  idempotency: ExistingExternalCallLookup
  /** Optional atomic reserve-before-execute for true concurrent exactly-once (defence beyond the lease). */
  reservation?: ExternalCallReservation
  eventSink: ProviderExecutionEventSink
  /** The persisted, granted campaign-send approval (F1). */
  approval: Approval | null
  /** Campaign id — the approval's external-action target. */
  campaignId: string
  /** The exact requested action the approval must authorize. */
  requestedAction: string
  clock: Readonly<{ now: () => Date; nowIso: () => string }>
  ids: Readonly<{
    requestId: () => string
    externalCallId: () => string
    blockedEvent: () => GuardedSendEventIdentity
    recordedAudit: () => GuardedSendEventIdentity
  }>
  onSent?: (info: Readonly<{ jobId: string; to: string; externalCallId: string }>) => void
}>

function isCampaignEmailMessage(value: unknown): value is CampaignEmailMessage {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.to === 'string' && typeof v.subject === 'string' && typeof v.html === 'string'
}

// A guard refusal that is not a real send maps to a runner error class so the job's lifecycle
// (retry vs dead-letter vs permission stop) stays correct.
function toRunnerError(jobId: string, error: LiveProviderExecutionGuardError): RunnerExecutionError {
  switch (error.kind) {
    case 'approval-denied':
      return new RunnerExecutionError('permission-error', `campaign-send job ${jobId} denied: ${error.cause.kind}`)
    case 'live-execution-disabled':
      return new RunnerExecutionError('permission-error', `campaign-send job ${jobId} has live execution disabled`)
    case 'unexpected-mock-profile':
      return new RunnerExecutionError('validation-error', `campaign-send job ${jobId} resolved a mock provider profile`)
    case 'preflight-failed':
      return new RunnerExecutionError('provider-error', `campaign-send job ${jobId} preflight failed: ${error.cause.kind}`)
    case 'live-execution-grant-mismatch':
      return new RunnerExecutionError('provider-error', `campaign-send job ${jobId} grant mismatch: ${error.cause.kind}`)
  }
}

export function createGuardedCampaignSendExecutor(deps: GuardedCampaignSendExecutorDeps): RunnerExecutor {
  return {
    async execute(job: Job, attempt: Attempt, signal: AbortSignal): Promise<void> {
      if (!isCampaignEmailMessage(job.payload)) {
        throw new RunnerExecutionError('validation-error', `campaign-send job ${job.jobId} has an invalid payload`)
      }
      const message: CampaignEmailMessage = {
        to: job.payload.to,
        subject: job.payload.subject,
        html: job.payload.html,
      }

      const result = await guardLiveProviderExecutionAfterPreflight({
        loader: deps.loader,
        resolver: deps.resolver,
        requestId: deps.ids.requestId(),
        providerProfile: deps.providerProfile,
        operation: RESEND_LIVE_OPERATION,
        workflowRunId: job.workflowRunId,
        stepRunId: job.jobId,
        idempotencyKey: job.idempotencyKey,
        attemptNumber: attempt.attemptNumber,
        input: message,
        // Summary is stored on the receipt — keep it to the routing field, never the body.
        requestSummary: { to: message.to },
        startedAt: deps.clock.nowIso(),
        approval: deps.approval,
        approvalTargetId: deps.campaignId,
        requestedAction: deps.requestedAction,
        now: deps.clock.now(),
        eventSink: deps.eventSink,
        blockedEvent: deps.ids.blockedEvent(),
        liveExecution: {
          adapter: deps.adapter,
          idempotency: deps.idempotency,
          externalCallId: deps.ids.externalCallId(),
          signal,
          recordedAudit: deps.ids.recordedAudit(),
          ...(deps.reservation
            ? { reservation: { reserve: deps.reservation, reservedAt: deps.clock.nowIso() } }
            : {}),
        },
      })

      if (!result.ok) {
        throw toRunnerError(job.jobId, result.error)
      }

      // A prior succeeded external call for this key means the message already went out — succeed
      // without re-sending (provider-level exactly-once).
      if (result.outcome === 'already-executed') {
        deps.onSent?.({ jobId: job.jobId, to: message.to, externalCallId: result.externalCallRecord.externalCallId })
        return
      }

      // The reservation slice IS wired: the runtime factory (createExternalCallReservation)
      // supplies `deps.reservation`, which is passed into the guard's reserve-before-execute
      // boundary above. 'reserved-elsewhere' is therefore a real concurrent-contention outcome —
      // another caller already holds the atomic reservation for this idempotency key — handled
      // conservatively as a retryable provider error rather than a silent success.
      if (result.outcome === 'reserved-elsewhere') {
        throw new RunnerExecutionError('provider-error', `campaign-send job ${job.jobId} reserved elsewhere`)
      }

      // Executed: the adapter ran. A non-succeeded provider status (e.g. Resend rejected the send)
      // must fail the job so it retries, even though the call itself was recorded.
      if (result.result.result.status !== 'succeeded') {
        throw new RunnerExecutionError('provider-error', `campaign-send job ${job.jobId} failed to send`)
      }

      deps.onSent?.({ jobId: job.jobId, to: message.to, externalCallId: result.externalCallRecord.externalCallId })
    },
  }
}

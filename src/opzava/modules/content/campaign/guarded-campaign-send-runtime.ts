import Database from 'better-sqlite3'

import type { RunnerExecutor } from '@/opzava/platform/runner/worker'
import { createRunnerRepository } from '@/opzava/platform/runner/repository'
import { applyOpzavaExternalCallReservationSchema } from '@/opzava/platform/runner/migrations'
import { createDefaultingRuntimeSettingsLoader } from '@/opzava/platform/admin-config/runtime-loader'
import { createAdminSettingsRepository } from '@/opzava/platform/admin-config/repository'
import { createExternalCallIdempotencyLookup } from '@/opzava/platform/providers/external-call-lookup'
import { createExternalCallReservation } from '@/opzava/platform/providers/external-call-reservation'
import { createProviderLimitExecutor } from '@/opzava/platform/providers/provider-limit-executor'
import { createProviderUsageReader } from '@/opzava/platform/providers/provider-usage-reader'
import type { ProviderAdapter, ProviderProfile } from '@/opzava/platform/providers/contracts'
import type { SecretResolver } from '@/opzava/platform/providers/credentials-runtime'
import type { Approval } from '@/opzava/core/approvals/contracts'
import {
  createGuardedCampaignSendExecutor,
  type GuardedSendEventIdentity,
} from '../workflow/guarded-campaign-send-executor'
import { CAMPAIGN_SEND_REQUESTED_ACTION } from './campaign-send-approval'

/**
 * F1b composition — assemble the guarded campaign-send executor from a live request's pieces, so the
 * campaign worker drains through the receipt + provider-level exactly-once boundary instead of the raw
 * adapter. Everything is read from the same DB: the runtime settings loader (admin settings repo), the
 * idempotency lookup and the operational-event sink (runner repo). The granted, bounded approval is
 * matched against `campaign.send` for this campaign id (defence in depth — the run path already checked).
 */

export type GuardedCampaignSendRuntimeDeps = Readonly<{
  db: Database.Database
  adapter: ProviderAdapter
  profile: ProviderProfile
  resolver: SecretResolver
  approval: Approval | null
  campaignId: string
  /** Stable id generator (e.g. randomUUID) for request/external-call/event ids. */
  newId: () => string
  clock: Readonly<{ now: () => Date; nowIso: () => string }>
  onSent?: (info: Readonly<{ jobId: string; to: string; externalCallId: string }>) => void
}>

const GUARDED_SEND_ACTOR_ID = 'runner:campaign-send'

export function createGuardedCampaignSendExecutorForCampaign(
  deps: GuardedCampaignSendRuntimeDeps,
): RunnerExecutor {
  const repository = createRunnerRepository(deps.db)
  repository.ensureSchema()
  // The reservation table is added by a later runner migration; ensure it here too so the guarded
  // path is self-contained (the atomic reserve-before-execute needs it) wherever it is assembled.
  applyOpzavaExternalCallReservationSchema(deps.db)
  const loader = createDefaultingRuntimeSettingsLoader({ repository: createAdminSettingsRepository(deps.db) })
  const idempotency = createExternalCallIdempotencyLookup(deps.db)
  // Atomic reserve-before-execute closes the lookup's race (two callers both reading null): the
  // reservation table PK admits exactly one writer per idempotency key.
  const reservation = createExternalCallReservation(deps.db)

  const eventIdentity = (): GuardedSendEventIdentity => ({
    recordId: deps.newId(),
    auditEventId: deps.newId(),
    actorId: GUARDED_SEND_ACTOR_ID,
    occurredAt: deps.clock.nowIso(),
  })

  const guarded = createGuardedCampaignSendExecutor({
    loader,
    resolver: deps.resolver,
    adapter: deps.adapter,
    providerProfile: deps.profile,
    idempotency,
    reservation,
    eventSink: { appendOperationalEvent: repository.appendOperationalEvent },
    approval: deps.approval,
    campaignId: deps.campaignId,
    requestedAction: CAMPAIGN_SEND_REQUESTED_ACTION,
    clock: deps.clock,
    ids: {
      requestId: deps.newId,
      externalCallId: deps.newId,
      blockedEvent: eventIdentity,
      recordedAudit: eventIdentity,
    },
    onSent: deps.onSent,
  })

  // F6b: enforce the operator's rate/cost ceilings before each live send. Limits come from the same
  // (defaulting) runtime loader; usage is read live from the operational-event store.
  const usage = createProviderUsageReader(deps.db, { now: deps.clock.now })
  return createProviderLimitExecutor({
    inner: guarded,
    loadLimits: async () => {
      const result = await loader.loadRuntimeSettings()
      if (!result.ok) {
        throw new Error('runtime settings unavailable for limit enforcement')
      }
      return result.value.options.limits
    },
    readUsage: usage,
  })
}

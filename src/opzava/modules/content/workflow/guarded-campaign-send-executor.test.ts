import { describe, expect, it, vi } from 'vitest'

import { parseApproval, type Approval } from '@/opzava/core/approvals/contracts'
import type { OperationalEventStorageRecord } from '@/opzava/platform/runner/repository-contracts'
import {
  createExternalCallRecordFromProviderAdapterResult,
  parseProviderAdapterRequest,
  parseProviderAdapterResult,
  type ExternalCallRecord,
  type ProviderAdapterRequest,
} from '@/opzava/platform/providers/contracts'
import type { RuntimeSettingsLoader } from '@/opzava/platform/admin-config/runtime-loader'
import type { OpzavaRuntimeOptionsProjection } from '@/opzava/platform/admin-config/runtime-options'
import type { SecretResolver } from '@/opzava/platform/providers/credentials-runtime'
import {
  createLiveResendProviderProfile,
  RESEND_LIVE_OPERATION,
} from '@/opzava/modules/content/providers/resend-live-adapter'
import { createSecretReference } from '@/opzava/platform/admin-config/contracts'
import { type Job, type Attempt } from '@/opzava/platform/runner/contracts'
import { createGuardedCampaignSendExecutor, type GuardedCampaignSendExecutorDeps } from './guarded-campaign-send-executor'

const CAMPAIGN_ID = 'camp-1'
const CREDENTIAL_ID = 'RESEND_API_KEY'
const REQUESTED_ACTION = `provider:live-resend:${RESEND_LIVE_OPERATION}`
const NOW = new Date('2026-07-05T00:00:00.000Z')
const NOW_ISO = '2026-07-05T00:00:00.000Z'

function grantedApproval(): Approval {
  return parseApproval({
    schemaVersion: 1,
    approvalId: 'approval_campaign_send_camp-1',
    requestedAction: REQUESTED_ACTION,
    target: { kind: 'external-action', id: CAMPAIGN_ID },
    status: 'approved',
    requesterId: 'operator:1',
    approverId: 'operator:2',
    decisionReason: 'send approved',
    requestedAt: '2026-07-04T00:00:00.000Z',
    decidedAt: '2026-07-04T01:00:00.000Z',
    expiresAt: '2026-07-06T00:00:00.000Z',
  })
}

function succeedingAdapter() {
  const execute = vi.fn(async (request: ProviderAdapterRequest) =>
    parseProviderAdapterResult({
      schemaVersion: 1,
      requestId: request.requestId,
      status: 'succeeded',
      output: { messageId: 'resend-msg-1' },
      outputSummary: { messageId: 'resend-msg-1' },
      error: null,
      finishedAt: NOW_ISO,
    }),
  )
  return { execute }
}

function failingAdapter() {
  const execute = vi.fn(async (request: ProviderAdapterRequest) =>
    parseProviderAdapterResult({
      schemaVersion: 1,
      requestId: request.requestId,
      status: 'failed',
      output: null,
      outputSummary: { messageId: null },
      error: { class: 'provider-error', message: 'resend rejected' },
      finishedAt: NOW_ISO,
    }),
  )
  return { execute }
}

function priorExternalCall(idempotencyKey: string): ExternalCallRecord {
  return createExternalCallRecordFromProviderAdapterResult({
    externalCallId: 'external_call_prior_send_001',
    request: parseProviderAdapterRequest({
      schemaVersion: 1,
      requestId: 'provider_request_prior_001',
      providerProfile: createLiveResendProviderProfile(CREDENTIAL_ID),
      operation: RESEND_LIVE_OPERATION,
      workflowRunId: 'wf-1',
      stepRunId: 'job-1',
      idempotencyKey,
      timeoutMs: 30_000,
      retry: { attemptNumber: 1, maxAttempts: 3 },
      input: { to: 'a@x.com', subject: 'Hi', html: '<p>1</p>' },
      requestSummary: { to: 'a@x.com' },
      startedAt: '2026-07-04T00:00:00.000Z',
    }),
    result: parseProviderAdapterResult({
      schemaVersion: 1,
      requestId: 'provider_request_prior_001',
      status: 'succeeded',
      output: { messageId: 'resend-msg-prior' },
      outputSummary: { messageId: 'resend-msg-prior' },
      error: null,
      finishedAt: '2026-07-04T00:00:01.000Z',
    }),
  })
}

function idempotencyLookup(existing: ExternalCallRecord | null) {
  return { findExistingExternalCall: vi.fn((_key: string) => existing) }
}

function eventSink() {
  const records: OperationalEventStorageRecord[] = []
  return {
    records,
    appendOperationalEvent: vi.fn((record: OperationalEventStorageRecord) => {
      records.push(record)
    }),
  }
}

function fakeResolver(): SecretResolver {
  return {
    resolveSecret: vi.fn(async () => ({
      ok: true as const,
      value: {
        reference: createSecretReference({ id: CREDENTIAL_ID, scope: 'provider-credential', purpose: 'Resend API key' }),
        secretValue: 're_live_secret',
      },
    })),
  }
}

function fakeRuntimeOptions(): OpzavaRuntimeOptionsProjection {
  return {
    runner: { idleDelayMs: 100, errorDelayMs: 500 },
    retry: { initialDelayMs: 1_000, multiplier: 2, maxDelayMs: 60_000 },
    provider: { timeoutMs: 30_000, retry: { maxAttempts: 3 } },
    limits: { requestsPerMinute: 60, burst: 90, usdPerHourLimit: 100, usdPerDayLimit: 1_000 },
  }
}

function fakeLoader(): RuntimeSettingsLoader {
  return {
    loadRuntimeSettings: vi.fn(async () => ({
      ok: true as const,
      value: { version: 7, updatedAt: NOW_ISO, updatedBy: 'admin:1', options: fakeRuntimeOptions() },
    })),
  }
}

function makeIds() {
  let n = 0
  const next = () => (n += 1)
  return {
    requestId: () => `req-${next()}`,
    externalCallId: () => `ext-${next()}`,
    blockedEvent: () => ({ recordId: `rec-b-${next()}`, auditEventId: `aud-b-${next()}`, actorId: 'runner:campaign', occurredAt: NOW_ISO }),
    recordedAudit: () => ({ recordId: `rec-a-${next()}`, auditEventId: `aud-a-${next()}`, actorId: 'runner:campaign', occurredAt: NOW_ISO }),
  }
}

function makeDeps(overrides: Partial<GuardedCampaignSendExecutorDeps> = {}): GuardedCampaignSendExecutorDeps {
  return {
    loader: fakeLoader(),
    resolver: fakeResolver(),
    adapter: succeedingAdapter(),
    providerProfile: createLiveResendProviderProfile(CREDENTIAL_ID),
    idempotency: idempotencyLookup(null),
    eventSink: eventSink(),
    approval: grantedApproval(),
    campaignId: CAMPAIGN_ID,
    requestedAction: REQUESTED_ACTION,
    clock: { now: () => NOW, nowIso: () => NOW_ISO },
    ids: makeIds(),
    ...overrides,
  }
}

function job(idempotencyKey = 'wf-1:step:s1:to:a@x.com'): Job {
  return {
    jobId: 'job-1',
    workflowRunId: 'wf-1',
    idempotencyKey,
    payload: { to: 'a@x.com', subject: 'Hi', html: '<p>1</p>' },
  } as unknown as Job
}

const attempt = { attemptNumber: 1 } as unknown as Attempt

describe('createGuardedCampaignSendExecutor', () => {
  it('sends once through the guard and emits an external-call receipt + audit (F1b)', async () => {
    const sink = eventSink()
    const adapter = succeedingAdapter()
    const onSent = vi.fn()
    const deps = makeDeps({ eventSink: sink, adapter, onSent })

    await createGuardedCampaignSendExecutor(deps).execute(job(), attempt, new AbortController().signal)

    expect(adapter.execute).toHaveBeenCalledTimes(1)
    // approval.allowed audit + external-call receipt + execution.recorded audit
    expect(sink.records.map((r) => r.kind)).toEqual(['audit', 'external-call', 'audit'])
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1', to: 'a@x.com' }))
  })

  it('does not re-send when a prior succeeded external call exists for the key (exactly-once)', async () => {
    const key = 'wf-1:step:s1:to:a@x.com'
    const adapter = succeedingAdapter()
    const sink = eventSink()
    const onSent = vi.fn()
    const deps = makeDeps({ adapter, eventSink: sink, onSent, idempotency: idempotencyLookup(priorExternalCall(key)) })

    await createGuardedCampaignSendExecutor(deps).execute(job(key), attempt, new AbortController().signal)

    expect(adapter.execute).toHaveBeenCalledTimes(0) // the message already went out
    expect(sink.records.map((r) => r.kind)).toEqual(['audit']) // only the approval decision, no new receipt
    // already-executed still reports the prior receipt's external-call id to onSent
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1', externalCallId: 'external_call_prior_send_001' }))
  })

  it('never runs the adapter when the campaign send approval is absent (F1 holds at the provider layer)', async () => {
    const adapter = succeedingAdapter()
    const deps = makeDeps({ adapter, approval: null })

    await expect(
      createGuardedCampaignSendExecutor(deps).execute(job(), attempt, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'RunnerExecutionError', errorClass: 'permission-error', message: expect.stringMatching(/denied/) })
    expect(adapter.execute).toHaveBeenCalledTimes(0)
  })

  it('fails the job (retryable) when the provider send is rejected', async () => {
    const adapter = failingAdapter()
    const deps = makeDeps({ adapter })

    await expect(
      createGuardedCampaignSendExecutor(deps).execute(job(), attempt, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'RunnerExecutionError', errorClass: 'provider-error' })
    expect(adapter.execute).toHaveBeenCalledTimes(1) // it ran, but the send failed
  })

  it('executes when it wins the reservation', async () => {
    const adapter = succeedingAdapter()
    const reserve = { reserveExternalCall: vi.fn(() => ({ ok: true as const, outcome: 'reserved' as const })), releaseExternalCall: vi.fn() }
    await createGuardedCampaignSendExecutor(makeDeps({ adapter, reservation: reserve })).execute(job(), attempt, new AbortController().signal)
    expect(reserve.reserveExternalCall).toHaveBeenCalledTimes(1)
    expect(adapter.execute).toHaveBeenCalledTimes(1)
  })

  it('does not send (retryable) when another caller already holds the reservation', async () => {
    const adapter = succeedingAdapter()
    // already-reserved + no completed external call ⇒ reserved-elsewhere ⇒ the adapter never runs here
    const reserve = { reserveExternalCall: vi.fn(() => ({ ok: true as const, outcome: 'already-reserved' as const })), releaseExternalCall: vi.fn() }
    await expect(
      createGuardedCampaignSendExecutor(makeDeps({ adapter, reservation: reserve, idempotency: idempotencyLookup(null) })).execute(
        job(),
        attempt,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ name: 'RunnerExecutionError', errorClass: 'provider-error', message: expect.stringMatching(/reserved/) })
    expect(adapter.execute).toHaveBeenCalledTimes(0)
  })

  it('rejects an invalid payload as a validation error', async () => {
    const deps = makeDeps()
    const badJob = { jobId: 'job-x', workflowRunId: 'wf-1', idempotencyKey: 'k', payload: { not: 'a message' } } as unknown as Job

    await expect(
      createGuardedCampaignSendExecutor(deps).execute(badJob, attempt, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'RunnerExecutionError', errorClass: 'validation-error' })
  })

  it.each([
    ['missing to', { subject: 'S', html: 'H' }],
    ['missing subject', { to: 'a@x.com', html: 'H' }],
    ['missing html', { to: 'a@x.com', subject: 'S' }],
    ['null', null],
  ])('rejects a payload %s as a validation error', async (_label, payload) => {
    const badJob = { jobId: 'j', workflowRunId: 'wf-1', idempotencyKey: 'k', payload } as unknown as Job
    await expect(
      createGuardedCampaignSendExecutor(makeDeps()).execute(badJob, attempt, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'RunnerExecutionError', errorClass: 'validation-error' })
  })

  it('maps a preflight failure (unresolvable secret) to a retryable provider-error', async () => {
    const resolver: SecretResolver = {
      resolveSecret: vi.fn(async () => ({
        ok: false as const,
        error: {
          kind: 'SecretResolutionFailure' as const,
          code: 'not-found' as const,
          reference: createSecretReference({ id: CREDENTIAL_ID, scope: 'provider-credential', purpose: 'Resend API key' }),
          message: 'no secret',
        },
      })),
    }
    const adapter = succeedingAdapter()
    await expect(
      createGuardedCampaignSendExecutor(makeDeps({ resolver, adapter })).execute(job(), attempt, new AbortController().signal),
    ).rejects.toMatchObject({ name: 'RunnerExecutionError', errorClass: 'provider-error', message: expect.stringMatching(/preflight failed/) })
    expect(adapter.execute).toHaveBeenCalledTimes(0) // never reached the adapter
  })
})

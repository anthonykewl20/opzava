import { describe, expect, it, vi } from 'vitest'

import { createSecretReference, type SecretReference } from '../admin-config/contracts'
import type { RuntimeSettingsLoader } from '../admin-config/runtime-loader'
import type { OpzavaRuntimeOptionsProjection } from '../admin-config/runtime-options'
import { parseApproval, type Approval } from '../../core/approvals/contracts'
import type { OperationalEventStorageRecord } from '../runner/repository-contracts'
import {
  createExternalCallRecordFromProviderAdapterResult,
  parseProviderAdapterRequest,
  parseProviderAdapterResult,
  parseProviderProfile,
  type ExternalCallRecord,
  type ProviderAdapterRequest,
  type ProviderProfile,
} from './contracts'
import type { SecretResolver } from './credentials-runtime'
import { guardLiveProviderExecutionAfterPreflight } from './live-approval-runtime'

describe('Opzava live provider approval guard wired to the execution boundary', () => {
  it('executes the approved action exactly once through the boundary on a granted approval', async () => {
    const sink = eventSink()
    const adapter = succeedingAdapter()

    const result = await guardLiveProviderExecutionAfterPreflight(
      guardInput({ eventSink: sink, approval: grantedApproval(), adapter, idempotency: idempotencyLookup(null) }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok || result.outcome !== 'executed') throw new Error('expected executed outcome')
    expect(result.result.result.status).toBe('succeeded')
    expect(adapter.execute).toHaveBeenCalledTimes(1)
    // one approval.allowed audit event + one external-call event from the boundary
    expect(sink.records).toHaveLength(2)
    expect(sink.records.map((r) => r.kind)).toEqual(['audit', 'external-call'])
  })

  it('refuses to run the adapter again when a prior external call exists for the idempotency key', async () => {
    const sink = eventSink()
    const adapter = succeedingAdapter()
    const prior = existingExternalCall()

    const result = await guardLiveProviderExecutionAfterPreflight(
      guardInput({ eventSink: sink, approval: grantedApproval(), adapter, idempotency: idempotencyLookup(prior) }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok || result.outcome !== 'already-executed') throw new Error('expected already-executed outcome')
    expect(result.externalCallRecord).toEqual(prior)
    expect(adapter.execute).toHaveBeenCalledTimes(0)
    // only the approval.allowed audit event; the boundary appends nothing when skipping
    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]?.kind).toBe('audit')
  })

  it('does not execute when no live-execution dependencies are supplied (backward compatible)', async () => {
    const sink = eventSink()

    const result = await guardLiveProviderExecutionAfterPreflight(
      guardInput({ eventSink: sink, approval: grantedApproval() }),
    )

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'live-execution-disabled',
        providerId: 'live-llm',
        approvalId: 'approval_live_llm_generate_001',
        expiresAt: '2026-06-16T00:00:00.000Z',
      },
    })
  })

  it('never executes the adapter when the approval is denied even if dependencies are supplied', async () => {
    const sink = eventSink()
    const adapter = succeedingAdapter()

    const result = await guardLiveProviderExecutionAfterPreflight(
      guardInput({ eventSink: sink, approval: null, adapter, idempotency: idempotencyLookup(null) }),
    )

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected denial')
    expect(result.error.kind).toBe('approval-denied')
    expect(adapter.execute).toHaveBeenCalledTimes(0)
  })

  it('also appends a provider.execution.recorded audit event on an executed action when recordedAudit is supplied', async () => {
    const sink = eventSink()
    const adapter = succeedingAdapter()

    const result = await guardLiveProviderExecutionAfterPreflight(
      guardInput({
        eventSink: sink,
        approval: grantedApproval(),
        adapter,
        idempotency: idempotencyLookup(null),
        recordedAudit: recordedAudit(),
      }),
    )

    expect(result.ok).toBe(true)
    expect(adapter.execute).toHaveBeenCalledTimes(1)
    expect(sink.records.map((r) => r.kind)).toEqual(['audit', 'external-call', 'audit'])
    const auditRecord = sink.records[2]
    expect((auditRecord?.event as { action: string }).action).toBe('provider.execution.recorded')
    expect((auditRecord?.event as unknown as { afterSummary: { status: string } }).afterSummary.status).toBe('succeeded')
  })

  it('does not append the execution audit event when the action was already executed', async () => {
    const sink = eventSink()
    const adapter = succeedingAdapter()

    const result = await guardLiveProviderExecutionAfterPreflight(
      guardInput({
        eventSink: sink,
        approval: grantedApproval(),
        adapter,
        idempotency: idempotencyLookup(existingExternalCall()),
        recordedAudit: recordedAudit(),
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok || result.outcome !== 'already-executed') throw new Error('expected already-executed')
    expect(adapter.execute).toHaveBeenCalledTimes(0)
    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]?.kind).toBe('audit')
  })
})

function recordedAudit() {
  return {
    recordId: 'operational_event_provider_exec_audit_001',
    auditEventId: 'audit_provider_exec_001',
    actorId: 'runner:live-provider',
    occurredAt: '2026-06-15T00:00:03.000Z',
  }
}

type GuardInput = Parameters<typeof guardLiveProviderExecutionAfterPreflight>[0]

function guardInput(overrides: {
  eventSink?: ReturnType<typeof eventSink>
  approval?: Approval | null
  adapter?: ReturnType<typeof succeedingAdapter>
  idempotency?: ReturnType<typeof idempotencyLookup>
  recordedAudit?: { recordId: string; auditEventId: string; actorId: string; occurredAt: string }
} = {}): GuardInput {
  const liveExecution = overrides.adapter && overrides.idempotency
    ? {
        adapter: overrides.adapter,
        idempotency: overrides.idempotency,
        externalCallId: 'external_call_live_action_001',
        signal: new AbortController().signal,
        ...(overrides.recordedAudit ? { recordedAudit: overrides.recordedAudit } : {}),
      }
    : undefined

  return {
    loader: fakeLoader(runtimeSettings(fakeRuntimeOptions())),
    resolver: fakeResolver(),
    requestId: 'provider_request_live_approval_001',
    providerProfile: liveProfile(credentialReference()),
    operation: 'generate-seo-brief',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_seo_brief_001',
    idempotencyKey: 'workflow:run_001:step:seo-brief:provider:v1',
    attemptNumber: 1,
    input: { promptArtifactId: 'artifact_prompt_001' },
    requestSummary: { promptArtifactId: 'artifact_prompt_001' },
    startedAt: '2026-06-15T00:00:00.000Z',
    approval: overrides.approval ?? null,
    approvalTargetId: 'external_action_live_llm_generate_001',
    requestedAction: 'provider:live-llm:generate-seo-brief',
    now: new Date('2026-06-15T00:00:02.000Z'),
    eventSink: overrides.eventSink ?? eventSink(),
    blockedEvent: {
      recordId: 'operational_event_live_approval_001',
      auditEventId: 'audit_live_approval_001',
      actorId: 'runner:live-provider-approval',
      occurredAt: '2026-06-15T00:00:02.000Z',
    },
    ...(liveExecution ? { liveExecution } : {}),
  } as GuardInput
}

function grantedApproval(): Approval {
  return parseApproval({
    schemaVersion: 1,
    approvalId: 'approval_live_llm_generate_001',
    requestedAction: 'provider:live-llm:generate-seo-brief',
    target: { kind: 'external-action', id: 'external_action_live_llm_generate_001' },
    status: 'approved',
    requesterId: 'operator:1',
    approverId: 'operator:2',
    decisionReason: 'live generation approved',
    requestedAt: '2026-06-15T00:00:00.000Z',
    decidedAt: '2026-06-15T00:00:01.000Z',
    expiresAt: '2026-06-16T00:00:00.000Z',
  })
}

function succeedingAdapter() {
  const execute = vi.fn(async (request: ProviderAdapterRequest) => parseProviderAdapterResult({
    schemaVersion: 1,
    requestId: request.requestId,
    status: 'succeeded',
    output: { outputArtifactId: 'artifact_seo_brief_001' },
    outputSummary: { outputArtifactId: 'artifact_seo_brief_001' },
    error: null,
    finishedAt: '2026-06-15T00:00:03.000Z',
  }))
  return { execute }
}

function existingExternalCall(): ExternalCallRecord {
  return createExternalCallRecordFromProviderAdapterResult({
    externalCallId: 'external_call_live_action_prior_001',
    request: liveAdapterRequest(),
    result: parseProviderAdapterResult({
      schemaVersion: 1,
      requestId: 'provider_request_live_approval_001',
      status: 'succeeded',
      output: { outputArtifactId: 'artifact_seo_brief_prior_001' },
      outputSummary: { outputArtifactId: 'artifact_seo_brief_prior_001' },
      error: null,
      finishedAt: '2026-06-15T00:00:02.000Z',
    }),
  })
}

function liveAdapterRequest(): ProviderAdapterRequest {
  return parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: 'provider_request_live_approval_001',
    providerProfile: {
      schemaVersion: 1,
      providerId: 'live-llm',
      displayName: 'Live LLM',
      kind: 'llm',
      mode: 'live',
      credentialRef: credentialReference(),
      config: { modelRef: 'operator-managed-model', allowedOperations: ['generate-seo-brief'] },
    },
    operation: 'generate-seo-brief',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_seo_brief_001',
    idempotencyKey: 'workflow:run_001:step:seo-brief:provider:v1',
    timeoutMs: 30_000,
    retry: { attemptNumber: 1, maxAttempts: 3 },
    input: { promptArtifactId: 'artifact_prompt_001' },
    requestSummary: { promptArtifactId: 'artifact_prompt_001' },
    startedAt: '2026-06-15T00:00:00.000Z',
  })
}

function idempotencyLookup(existing: ExternalCallRecord | null) {
  return {
    findExistingExternalCall: vi.fn((_idempotencyKey: string) => existing),
  }
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

function fakeResolver(
  result: Awaited<ReturnType<SecretResolver['resolveSecret']>> = {
    ok: true,
    value: { reference: credentialReference(), secretValue: 'default-secret-value' },
  },
): SecretResolver {
  return { resolveSecret: vi.fn(async () => result) }
}

function fakeLoader(result: Awaited<ReturnType<RuntimeSettingsLoader['loadRuntimeSettings']>>): RuntimeSettingsLoader {
  return { loadRuntimeSettings: vi.fn(async () => result) }
}

function runtimeSettings(options: OpzavaRuntimeOptionsProjection): Awaited<ReturnType<RuntimeSettingsLoader['loadRuntimeSettings']>> {
  return {
    ok: true,
    value: { version: 7, updatedAt: '2026-06-15T00:00:00.000Z', updatedBy: 'admin:1', options },
  }
}

function fakeRuntimeOptions(): OpzavaRuntimeOptionsProjection {
  return {
    runner: { idleDelayMs: 100, errorDelayMs: 500 },
    retry: { initialDelayMs: 1_000, multiplier: 2, maxDelayMs: 60_000 },
    provider: { timeoutMs: 30_000, retry: { maxAttempts: 3 } },
  }
}

function liveProfile(reference: SecretReference): ProviderProfile {
  return parseProviderProfile({
    schemaVersion: 1,
    providerId: 'live-llm',
    displayName: 'Live LLM',
    kind: 'llm',
    mode: 'live',
    credentialRef: reference,
    config: { modelRef: 'operator-managed-model', allowedOperations: ['generate-seo-brief'] },
  })
}

function credentialReference(): SecretReference {
  return createSecretReference({
    id: 'secret_live_llm_key',
    scope: 'provider-credential',
    purpose: 'llm-provider-api-key',
  })
}

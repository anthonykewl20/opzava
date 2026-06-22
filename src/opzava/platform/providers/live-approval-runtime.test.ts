import { readFile } from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

import { createSecretReference, type SecretReference } from '../admin-config/contracts'
import type { RuntimeSettingsLoader } from '../admin-config/runtime-loader'
import type { OpzavaRuntimeOptionsProjection } from '../admin-config/runtime-options'
import { parseApproval, type Approval } from '../../core/approvals/contracts'
import type { OperationalEventStorageRecord } from '../runner/repository-contracts'
import { parseProviderProfile, type ProviderProfile } from './contracts'
import type { SecretResolver } from './credentials-runtime'
import { guardLiveProviderExecutionAfterPreflight } from './live-approval-runtime'

describe('Opzava live provider execution approval guard', () => {
  it('returns a preflight failure, appends one preflight blocked event, and never reaches approval evaluation', async () => {
    const sink = eventSink()
    const loader = fakeLoader({
      ok: false,
      error: {
        kind: 'unavailable',
        reason: 'not_persisted',
      },
    })

    const result = await guardLiveProviderExecutionAfterPreflight({
      ...guardInput({ loader, eventSink: sink }),
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'preflight-failed',
        cause: {
          kind: 'runtime-settings-unavailable',
          cause: {
            kind: 'unavailable',
            reason: 'not_persisted',
          },
        },
      },
    })
    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]).toMatchObject({
      recordId: 'operational_event_live_approval_001',
      kind: 'audit',
      event: {
        auditEventId: 'audit_live_approval_001',
        action: 'provider.preflight.blocked',
      },
    })
    expect(JSON.stringify(sink.records)).not.toContain('provider.execution.approval')
  })

  it('rejects mock profiles after a successful preflight without appending any operational event', async () => {
    const sink = eventSink()

    const result = await guardLiveProviderExecutionAfterPreflight({
      ...guardInput({ eventSink: sink, providerProfile: mockProfile() }),
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'unexpected-mock-profile',
        providerId: 'mock-llm',
        mode: 'mock',
      },
    })
    expect(sink.records).toHaveLength(0)
  })

  it('denies live execution when the approval is missing and appends one denied approval event', async () => {
    const sink = eventSink()

    const result = await guardLiveProviderExecutionAfterPreflight({
      ...guardInput({ eventSink: sink, approval: null }),
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'approval-denied',
        cause: {
          kind: 'approval-missing',
          providerId: 'live-llm',
          operation: 'generate-seo-brief',
        },
      },
    })
    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]).toMatchObject({
      recordId: 'operational_event_live_approval_001',
      kind: 'audit',
      event: {
        auditEventId: 'audit_live_approval_001',
        action: 'provider.execution.approval.denied',
      },
    })
  })

  it('still refuses to execute a live adapter after a granted approval, recording one allowed approval event', async () => {
    const sink = eventSink()

    const result = await guardLiveProviderExecutionAfterPreflight({
      ...guardInput({ eventSink: sink, approval: grantedApproval() }),
    })

    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected live execution to remain disabled')
    expect(result.error).toEqual({
      kind: 'live-execution-disabled',
      providerId: 'live-llm',
      approvalId: 'approval_live_llm_generate_001',
      expiresAt: '2026-06-16T00:00:00.000Z',
    })
    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]).toMatchObject({
      recordId: 'operational_event_live_approval_001',
      kind: 'audit',
      event: {
        auditEventId: 'audit_live_approval_001',
        action: 'provider.execution.approval.allowed',
      },
    })
  })

  it('returns deeply equal results for identical inputs', async () => {
    const first = await guardLiveProviderExecutionAfterPreflight(
      guardInput({ approval: grantedApproval() }),
    )
    const second = await guardLiveProviderExecutionAfterPreflight(
      guardInput({ approval: grantedApproval() }),
    )

    expect(first).toEqual(second)
  })

  it('does not execute adapters, read files, read env, generate IDs, or use nondeterministic time', async () => {
    const source = await readFile('src/opzava/platform/providers/live-approval-runtime.ts', 'utf8')

    expect(source).not.toContain('executeProviderAdapterWithEvents')
    expect(source).not.toContain('mock-execution-runtime')
    expect(source).not.toContain('Date.now')
    expect(source).not.toContain('crypto')
    expect(source).not.toContain('process.env')
    expect(source).not.toContain('require(\'fs\')')
    expect(source).not.toContain('from \'fs\'')
    expect(source).not.toContain('fetch(')
  })
})

function guardInput(overrides: Partial<LiveProviderExecutionGuardInput> = {}): LiveProviderExecutionGuardInput {
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
    input: {
      promptArtifactId: 'artifact_prompt_001',
    },
    requestSummary: {
      promptArtifactId: 'artifact_prompt_001',
    },
    startedAt: '2026-06-15T00:00:00.000Z',
    approval: null,
    approvalTargetId: 'external_action_live_llm_generate_001',
    requestedAction: 'provider:live-llm:generate-seo-brief',
    now: new Date('2026-06-15T00:00:02.000Z'),
    eventSink: eventSink(),
    blockedEvent: {
      recordId: 'operational_event_live_approval_001',
      auditEventId: 'audit_live_approval_001',
      actorId: 'runner:live-provider-approval',
      occurredAt: '2026-06-15T00:00:02.000Z',
    },
    ...overrides,
  }
}

function grantedApproval(): Approval {
  return parseApproval({
    schemaVersion: 1,
    approvalId: 'approval_live_llm_generate_001',
    requestedAction: 'provider:live-llm:generate-seo-brief',
    target: {
      kind: 'external-action',
      id: 'external_action_live_llm_generate_001',
    },
    status: 'approved',
    requesterId: 'operator:1',
    approverId: 'operator:2',
    decisionReason: 'live generation approved',
    requestedAt: '2026-06-15T00:00:00.000Z',
    decidedAt: '2026-06-15T00:00:01.000Z',
    expiresAt: '2026-06-16T00:00:00.000Z',
  })
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
    value: {
      reference: credentialReference(),
      secretValue: 'default-secret-value',
    },
  },
): SecretResolver {
  return {
    resolveSecret: vi.fn(async () => result),
  }
}

function fakeLoader(result: Awaited<ReturnType<RuntimeSettingsLoader['loadRuntimeSettings']>>): RuntimeSettingsLoader {
  return {
    loadRuntimeSettings: vi.fn(async () => result),
  }
}

function runtimeSettings(options: OpzavaRuntimeOptionsProjection): Awaited<ReturnType<RuntimeSettingsLoader['loadRuntimeSettings']>> {
  return {
    ok: true,
    value: {
      version: 7,
      updatedAt: '2026-06-15T00:00:00.000Z',
      updatedBy: 'admin:1',
      options,
    },
  }
}

function fakeRuntimeOptions(
  overrides: Partial<OpzavaRuntimeOptionsProjection> = {},
): OpzavaRuntimeOptionsProjection {
  return {
    runner: {
      idleDelayMs: 100,
      errorDelayMs: 500,
    },
    retry: {
      initialDelayMs: 1_000,
      multiplier: 2,
      maxDelayMs: 60_000,
    },
    limits: { requestsPerMinute: 60, burst: 90, usdPerHourLimit: 100, usdPerDayLimit: 1_000 },
    provider: {
      timeoutMs: 30_000,
      retry: {
        maxAttempts: 3,
      },
    },
    ...overrides,
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
    config: {
      modelRef: 'operator-managed-model',
      allowedOperations: ['generate-seo-brief'],
    },
  })
}

function mockProfile(): ProviderProfile {
  return parseProviderProfile({
    schemaVersion: 1,
    providerId: 'mock-llm',
    displayName: 'Mock LLM',
    kind: 'llm',
    mode: 'mock',
    config: {
      fixtureSet: 'content-workflow-basic',
      allowedOperations: ['generate-seo-brief'],
    },
  })
}

function credentialReference(): SecretReference {
  return createSecretReference({
    id: 'secret_live_llm_key',
    scope: 'provider-credential',
    purpose: 'llm-provider-api-key',
  })
}

type LiveProviderExecutionGuardInput = Parameters<typeof guardLiveProviderExecutionAfterPreflight>[0]

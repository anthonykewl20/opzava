import { readFile } from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

import { createSecretReference, type SecretReference, type SecretResolutionFailure } from '../admin-config/contracts'
import type { RuntimeSettingsLoader } from '../admin-config/runtime-loader'
import type { OpzavaRuntimeOptionsProjection } from '../admin-config/runtime-options'
import type { OperationalEventStorageRecord } from '../runner/repository-contracts'
import { parseProviderAdapterResult, parseProviderProfile, type ProviderAdapter, type ProviderProfile } from './contracts'
import type { SecretResolver } from './credentials-runtime'
import { executeMockProviderAfterPreflight } from './mock-execution-runtime'

describe('Opzava mock-only provider execution runtime', () => {
  it('appends a redacted audit event and skips the adapter when preflight settings are unavailable', async () => {
    const sink = eventSink()
    const adapter = fakeAdapter()
    const loader = fakeLoader({
      ok: false,
      error: {
        kind: 'unavailable',
        reason: 'not_persisted',
      },
    })

    const result = await executeMockProviderAfterPreflight({
      ...executionInput({ loader, eventSink: sink, adapter }),
      providerProfile: liveProfile(credentialReference()),
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
    expect(adapter.execute).not.toHaveBeenCalled()
    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]).toMatchObject({
      recordId: 'operational_event_provider_blocked_001',
      kind: 'audit',
      event: {
        auditEventId: 'audit_provider_blocked_001',
        action: 'provider.preflight.blocked',
      },
    })
  })

  it('preserves secret preflight failure causes while redacting the appended audit event', async () => {
    const reference = credentialReference()
    const failure: SecretResolutionFailure = {
      kind: 'SecretResolutionFailure',
      code: 'permission-denied',
      reference,
      message: 'raw resolver detail must stay out of audit events',
    }
    const sink = eventSink()
    const adapter = fakeAdapter()

    const result = await executeMockProviderAfterPreflight({
      ...executionInput({
        eventSink: sink,
        adapter,
        providerProfile: liveProfile(reference),
        resolver: fakeResolver({ ok: false, error: failure }),
      }),
    })
    const serializedEvent = JSON.stringify(sink.records[0])

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'preflight-failed',
        cause: {
          kind: 'secret-resolution-failed',
          cause: failure,
        },
      },
    })
    expect(adapter.execute).not.toHaveBeenCalled()
    expect(serializedEvent).toContain('[secret-reference:provider-credential]')
    expect(serializedEvent).not.toContain(reference.id)
    expect(serializedEvent).not.toContain(reference.purpose)
    expect(serializedEvent).not.toContain(failure.message)
  })

  it('blocks live profiles after successful preflight and before adapter execution', async () => {
    const sink = eventSink()
    const adapter = fakeAdapter()

    const result = await executeMockProviderAfterPreflight({
      ...executionInput({
        eventSink: sink,
        adapter,
        providerProfile: liveProfile(credentialReference()),
      }),
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'execution-blocked-non-mock-profile',
        providerId: 'live-llm',
        mode: 'live',
      },
    })
    expect(adapter.execute).not.toHaveBeenCalled()
    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]).toMatchObject({
      recordId: 'operational_event_provider_blocked_001',
      kind: 'audit',
      event: {
        auditEventId: 'audit_provider_blocked_001',
        action: 'provider.execution.blocked.live-profile',
        afterSummary: {
          requestId: 'provider_request_mock_execution_001',
          providerId: 'live-llm',
          operation: 'generate-seo-brief',
          reason: 'live-provider-not-approved',
        },
      },
    })
  })

  it('preflight failures take precedence over live profile blocking', async () => {
    const sink = eventSink()
    const adapter = fakeAdapter()
    const loader = fakeLoader({
      ok: false,
      error: {
        kind: 'unavailable',
        reason: 'not_persisted',
      },
    })

    await executeMockProviderAfterPreflight({
      ...executionInput({ loader, eventSink: sink, adapter, providerProfile: liveProfile(credentialReference()) }),
    })

    expect(adapter.execute).not.toHaveBeenCalled()
    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]?.event).toMatchObject({ action: 'provider.preflight.blocked' })
    expect(JSON.stringify(sink.records)).not.toContain('provider.execution.blocked.live-profile')
  })

  it('rejects an unrecordable external call id before mock adapter execution', async () => {
    const sink = eventSink()
    const adapter = fakeAdapter()

    const result = await executeMockProviderAfterPreflight({
      ...executionInput({ eventSink: sink, adapter, providerProfile: mockProfile() }),
      externalCallId: 'x'.repeat(121),
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'invalid-external-call-id',
        reason: 'too-long',
      },
    })
    expect(adapter.execute).not.toHaveBeenCalled()
    expect(sink.records).toHaveLength(0)
  })

  it('executes mock adapters through the existing provider execution event wrapper', async () => {
    const sink = eventSink()
    const adapter = fakeAdapter()

    const result = await executeMockProviderAfterPreflight({
      ...executionInput({
        eventSink: sink,
        adapter,
        providerProfile: mockProfile(),
      }),
    })

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error('expected mock execution to succeed')
    expect(adapter.execute).toHaveBeenCalledTimes(1)
    expect(adapter.execute).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'provider_request_mock_execution_001',
      providerProfile: expect.objectContaining({ providerId: 'mock-llm', mode: 'mock' }),
      operation: 'generate-seo-brief',
    }), expect.any(AbortSignal))
    expect(result.value.externalCallRecord).toMatchObject({
      externalCallId: 'external_call_mock_execution_001',
      providerId: 'mock-llm',
      operation: 'generate-seo-brief',
      status: 'succeeded',
    })
    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]).toMatchObject({
      kind: 'external-call',
      event: {
        externalCallId: 'external_call_mock_execution_001',
        status: 'succeeded',
      },
    })
  })

  it('normalizes mock adapter throws through provider execution events', async () => {
    const sink = eventSink()
    const adapter: ProviderAdapter = {
      execute: vi.fn(async () => {
        throw new Error('raw mock adapter failure')
      }),
    }

    const result = await executeMockProviderAfterPreflight({
      ...executionInput({ eventSink: sink, adapter, providerProfile: mockProfile() }),
      clock: { now: () => new Date('2026-06-15T00:00:03.000Z') },
    })

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error('expected normalized provider execution result')
    expect(result.value.result.status).toBe('failed')
    expect(result.value.externalCallRecord).toMatchObject({
      status: 'failed',
      responseSummary: {
        errorClass: 'provider-error',
      },
    })
    expect(JSON.stringify(sink.records[0])).not.toContain('raw mock adapter failure')
  })

  it('does not read files, read env, generate IDs, or log', async () => {
    const source = await readFile('src/opzava/platform/providers/mock-execution-runtime.ts', 'utf8')

    expect(source).not.toContain('process.env')
    expect(source).not.toContain('readFile')
    expect(source).not.toContain('readFileSync')
    expect(source).not.toContain('randomUUID')
    expect(source).not.toContain('console.')
    expect(source).not.toContain('JSON.stringify')
  })
})

function executionInput(overrides: Partial<MockExecutionInput> = {}): MockExecutionInput {
  return {
    loader: fakeLoader(runtimeSettings(fakeRuntimeOptions())),
    resolver: fakeResolver(),
    adapter: fakeAdapter(),
    eventSink: eventSink(),
    signal: new AbortController().signal,
    requestId: 'provider_request_mock_execution_001',
    providerProfile: mockProfile(),
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
    externalCallId: 'external_call_mock_execution_001',
    blockedEvent: {
      recordId: 'operational_event_provider_blocked_001',
      auditEventId: 'audit_provider_blocked_001',
      actorId: 'runner:mock-provider-execution',
      occurredAt: '2026-06-15T00:00:02.000Z',
    },
    ...overrides,
  }
}

function fakeAdapter(): ProviderAdapter {
  return {
    execute: vi.fn(async (request) => parseProviderAdapterResult({
      schemaVersion: 1,
      requestId: request.requestId,
      status: 'succeeded',
      output: {
        outputArtifactId: 'artifact_seo_brief_001',
      },
      outputSummary: {
        outputArtifactId: 'artifact_seo_brief_001',
      },
      error: null,
      finishedAt: '2026-06-15T00:00:03.000Z',
    })),
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

type MockExecutionInput = Parameters<typeof executeMockProviderAfterPreflight>[0]

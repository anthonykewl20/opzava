import { readFile } from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

import { createSecretReference } from '../admin-config/contracts'
import type { RuntimeSettingsLoader } from '../admin-config/runtime-loader'
import type { OpzavaRuntimeOptionsProjection } from '../admin-config/runtime-options'
import {
  parseProviderAdapterRequest,
  parseProviderProfile,
  type ProviderAdapterRequest,
  type ProviderProfile,
} from './contracts'
import { createRuntimeProviderAdapterRequest } from './request-runtime'

describe('Opzava runtime provider adapter request construction', () => {
  it('returns unavailable without parsing a request when settings are missing', async () => {
    const loader = fakeLoader({
      ok: false,
      error: {
        kind: 'unavailable',
        reason: 'not_persisted',
      },
    })
    const parseRequest = vi.fn(parseProviderAdapterRequest)

    const result = await createRuntimeProviderAdapterRequest({
      ...requestInput(),
      loader,
      parseRequest,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'unavailable',
        reason: 'not_persisted',
      },
    })
    expect(loader.loadRuntimeSettings).toHaveBeenCalledTimes(1)
    expect(parseRequest).not.toHaveBeenCalled()
  })

  it('builds a request from runtime timeout and retry defaults while forwarding caller fields', async () => {
    const runtimeOptions = fakeRuntimeOptions({
      provider: {
        timeoutMs: 45_000,
        retry: {
          maxAttempts: 5,
        },
      },
    })
    const loader = fakeLoader(runtimeSettings(runtimeOptions))
    const parseRequest = vi.fn(parseProviderAdapterRequest)
    const input = requestInput({
      loader,
      parseRequest,
      stepRunId: null,
      attemptNumber: 2,
      idempotencyKey: 'workflow:run_001:step:null:provider:v1',
      requestSummary: {
        promptArtifactId: 'artifact_prompt_001',
        summaryVersion: 2,
      },
    })

    const result = await createRuntimeProviderAdapterRequest(input)

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error('expected provider request construction to succeed')
    expect(loader.loadRuntimeSettings).toHaveBeenCalledTimes(1)
    expect(parseRequest).toHaveBeenCalledTimes(1)
    expect(parseRequest).toHaveBeenCalledWith({
      schemaVersion: 1,
      requestId: input.requestId,
      providerProfile: input.providerProfile,
      operation: input.operation,
      workflowRunId: input.workflowRunId,
      stepRunId: null,
      idempotencyKey: 'workflow:run_001:step:null:provider:v1',
      timeoutMs: 45_000,
      retry: {
        attemptNumber: 2,
        maxAttempts: 5,
      },
      input: input.input,
      requestSummary: input.requestSummary,
      startedAt: input.startedAt,
    })
    expect(result.value.timeoutMs).toBe(45_000)
    expect(result.value.retry).toEqual({ attemptNumber: 2, maxAttempts: 5 })
    expect(result.value.stepRunId).toBeNull()
    expect(result.value.idempotencyKey).toBe('workflow:run_001:step:null:provider:v1')
  })

  it('lets provider contract validation reject operations outside the profile allowlist', async () => {
    const loader = fakeLoader(runtimeSettings(fakeRuntimeOptions()))

    await expect(createRuntimeProviderAdapterRequest({
      ...requestInput({ loader }),
      operation: 'publish-to-wordpress',
    })).rejects.toThrow(/operation is not allowed/)
  })

  it('lets provider contract validation reject secret references in adapter input', async () => {
    const loader = fakeLoader(runtimeSettings(fakeRuntimeOptions()))

    await expect(createRuntimeProviderAdapterRequest({
      ...requestInput({ loader }),
      input: {
        credential: createSecretReference({
          id: 'secret_live_llm_key',
          scope: 'provider-credential',
          purpose: 'llm-provider-api-key',
        }),
      } as unknown as ProviderAdapterRequest['input'],
    })).rejects.toThrow(/secret/i)
  })

  it('lets provider contract validation reject attempts beyond the runtime maxAttempts cap', async () => {
    const loader = fakeLoader(runtimeSettings(fakeRuntimeOptions({
      provider: {
        timeoutMs: 30_000,
        retry: {
          maxAttempts: 3,
        },
      },
    })))

    await expect(createRuntimeProviderAdapterRequest({
      ...requestInput({ loader }),
      attemptNumber: 4,
    })).rejects.toThrow(/attempt number cannot exceed max attempts/)
  })

  it('rejects undefined stepRunId instead of silently treating it as null', async () => {
    const loader = fakeLoader(runtimeSettings(fakeRuntimeOptions()))

    await expect(createRuntimeProviderAdapterRequest({
      ...requestInput({ loader }),
      stepRunId: undefined as unknown as ProviderAdapterRequest['stepRunId'],
    })).rejects.toThrow()
  })

  it('does not import provider execution, secret resolution, env, or ID generation side effects', async () => {
    const source = await readFile('src/opzava/platform/providers/request-runtime.ts', 'utf8')

    expect(source).not.toContain('process.env')
    expect(source).not.toContain('randomUUID')
    expect(source).not.toContain('resolveSecret')
    expect(source).not.toContain('./execution')
    expect(source).not.toContain('executeProvider')
  })
})

function requestInput(overrides: Partial<RuntimeProviderRequestInput> = {}): RuntimeProviderRequestInput {
  return {
    loader: fakeLoader(runtimeSettings(fakeRuntimeOptions())),
    requestId: 'provider_request_runtime_001',
    providerProfile: providerProfile(),
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
    ...overrides,
  }
}

function providerProfile(): ProviderProfile {
  return parseProviderProfile({
    schemaVersion: 1,
    providerId: 'live-llm',
    displayName: 'Live LLM',
    kind: 'llm',
    mode: 'live',
    credentialRef: createSecretReference({
      id: 'secret_live_llm_key',
      scope: 'provider-credential',
      purpose: 'llm-provider-api-key',
    }),
    config: {
      modelRef: 'operator-managed-model',
      allowedOperations: ['generate-seo-brief'],
    },
  })
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
      version: 5,
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

type RuntimeProviderRequestInput = Parameters<typeof createRuntimeProviderAdapterRequest>[0]

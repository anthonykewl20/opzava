import { readFile } from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

import { createSecretReference, type SecretReference, type SecretResolutionFailure } from '../admin-config/contracts'
import type { RuntimeSettingsLoader } from '../admin-config/runtime-loader'
import type { OpzavaRuntimeOptionsProjection } from '../admin-config/runtime-options'
import { parseProviderProfile, type ProviderAdapterRequest, type ProviderProfile } from './contracts'
import { ProviderCredentialResolutionInvariantError, type SecretResolver } from './credentials-runtime'
import { createProviderExecutionPreflight, type ProviderExecutionPreflightErrorKind } from './preflight-runtime'

describe('Opzava provider execution preflight', () => {
  it('returns runtime-settings unavailable before credential resolution', async () => {
    const loader = fakeLoader({
      ok: false,
      error: {
        kind: 'unavailable',
        reason: 'not_persisted',
      },
    })
    const resolver = fakeResolver()

    const result = await createProviderExecutionPreflight({
      ...preflightInput(),
      loader,
      resolver,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'runtime-settings-unavailable',
        cause: {
          kind: 'unavailable',
          reason: 'not_persisted',
        },
      },
    })
    expect(loader.loadRuntimeSettings).toHaveBeenCalledTimes(1)
    expect(resolver.resolveSecret).not.toHaveBeenCalled()
  })

  it('preflights mock provider requests without credential resolution', async () => {
    const loader = fakeLoader(runtimeSettings(fakeRuntimeOptions()))
    const resolver = fakeResolver()

    const result = await createProviderExecutionPreflight({
      ...preflightInput({
        loader,
        resolver,
        providerProfile: mockProfile(),
      }),
    })

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error('expected mock preflight to succeed')
    expect(result.value.request.providerProfile.providerId).toBe('mock-llm')
    expect(result.value.credential).toBeNull()
    expect(resolver.resolveSecret).not.toHaveBeenCalled()
  })

  it('preflights live provider requests with one credential resolution', async () => {
    const loader = fakeLoader(runtimeSettings(fakeRuntimeOptions({
      provider: {
        timeoutMs: 45_000,
        retry: {
          maxAttempts: 5,
        },
      },
    })))
    const reference = credentialReference()
    const resolver = fakeResolver({
      ok: true,
      value: {
        reference,
        secretValue: 'in-memory-secret-value',
      },
    })

    const result = await createProviderExecutionPreflight({
      ...preflightInput({
        loader,
        resolver,
        providerProfile: liveProfile(reference),
        attemptNumber: 2,
      }),
    })

    expect(result).toMatchObject({ ok: true })
    if (!result.ok) throw new Error('expected live preflight to succeed')
    expect(result.value.request.timeoutMs).toBe(45_000)
    expect(result.value.request.retry).toEqual({ attemptNumber: 2, maxAttempts: 5 })
    expect(result.value.credential).toEqual({
      providerId: 'live-llm',
      reference: result.value.request.providerProfile.credentialRef,
      secretValue: 'in-memory-secret-value',
    })
    expect(result.value.credential?.reference).toBe(result.value.request.providerProfile.credentialRef)
    expect(result.value.credential?.reference).toEqual(reference)
    expect(resolver.resolveSecret).toHaveBeenCalledTimes(1)
    expect(resolver.resolveSecret).toHaveBeenCalledWith(result.value.request.providerProfile.credentialRef)
  })

  it('returns typed preflight errors for typed secret resolution failures', async () => {
    const reference = credentialReference()
    const failure: SecretResolutionFailure = {
      kind: 'SecretResolutionFailure',
      code: 'permission-denied',
      reference,
      message: 'operator is not allowed to use this credential',
    }
    const resolver = fakeResolver({ ok: false, error: failure })

    const result = await createProviderExecutionPreflight({
      ...preflightInput({
        resolver,
        providerProfile: liveProfile(reference),
      }),
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'secret-resolution-failed',
        cause: failure,
      },
    })
  })

  it('throws request construction errors before credential resolution', async () => {
    const resolver = fakeResolver()

    await expect(createProviderExecutionPreflight({
      ...preflightInput({
        resolver,
        operation: 'publish-to-wordpress',
      }),
    })).rejects.toThrow(/operation is not allowed/)
    expect(resolver.resolveSecret).not.toHaveBeenCalled()
  })

  it('lets unexpected resolver throws surface as credential invariant errors', async () => {
    const resolver: SecretResolver = {
      resolveSecret: vi.fn(async () => {
        throw new Error('raw resolver exception')
      }),
    }

    await expect(createProviderExecutionPreflight({
      ...preflightInput({ resolver }),
    })).rejects.toThrow(ProviderCredentialResolutionInvariantError)
  })

  it('keeps preflight error kinds closed for callers', () => {
    const kinds: ProviderExecutionPreflightErrorKind[] = [
      'runtime-settings-unavailable',
      'secret-resolution-failed',
    ]

    expect(kinds).toEqual(['runtime-settings-unavailable', 'secret-resolution-failed'])
  })

  it('does not import provider execution, filesystem reads, env reads, logging, or ID generation', async () => {
    const source = await readFile('src/opzava/platform/providers/preflight-runtime.ts', 'utf8')

    expect(source).not.toContain('process.env')
    expect(source).not.toContain('readFile')
    expect(source).not.toContain('readFileSync')
    expect(source).not.toContain('randomUUID')
    expect(source).not.toContain('console.')
    expect(source).not.toContain('JSON.stringify')
    expect(source).not.toContain('./execution')
    expect(source).not.toContain('executeProviderAdapter')
  })
})

function preflightInput(overrides: Partial<ProviderExecutionPreflightInput> = {}): ProviderExecutionPreflightInput {
  return {
    loader: fakeLoader(runtimeSettings(fakeRuntimeOptions())),
    resolver: fakeResolver(),
    requestId: 'provider_request_preflight_001',
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
      version: 6,
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

function credentialReference(): SecretReference {
  return createSecretReference({
    id: 'secret_live_llm_key',
    scope: 'provider-credential',
    purpose: 'llm-provider-api-key',
  })
}

type ProviderExecutionPreflightInput = Parameters<typeof createProviderExecutionPreflight>[0]

import { readFile } from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

import {
  createSecretReference,
  redactSecretResolutionFailureForAudit,
  type SecretReference,
  type SecretResolutionFailure,
} from '../admin-config/contracts'
import { parseProviderAdapterRequest, type ProviderAdapterRequest, type ProviderProfile } from './contracts'
import {
  ProviderCredentialResolutionInvariantError,
  resolveProviderCredentialForRequest,
  type SecretResolver,
} from './credentials-runtime'

describe('Opzava provider credential resolution boundary', () => {
  it('does not call the resolver for mock provider requests', async () => {
    const resolver = fakeResolver()
    const request = mockRequest()

    const result = await resolveProviderCredentialForRequest({ request, resolver })

    expect(result).toEqual({
      ok: true,
      value: {
        request,
        credential: null,
      },
    })
    expect(resolver.resolveSecret).not.toHaveBeenCalled()
  })

  it('resolves live provider credentials exactly once from the request credential reference', async () => {
    const request = liveRequest()
    const reference = request.providerProfile.credentialRef
    if (!reference) throw new Error('expected live request credential reference')
    const resolver = fakeResolver({
      ok: true,
      value: {
        reference,
        secretValue: 'in-memory-secret-value',
      },
    })

    const result = await resolveProviderCredentialForRequest({ request, resolver })

    expect(result).toEqual({
      ok: true,
      value: {
        request,
        credential: {
          providerId: 'live-llm',
          reference,
          secretValue: 'in-memory-secret-value',
        },
      },
    })
    expect(result.ok && result.value.request).toBe(request)
    expect(result.ok && result.value.credential?.reference).toBe(reference)
    expect(resolver.resolveSecret).toHaveBeenCalledTimes(1)
    expect(resolver.resolveSecret).toHaveBeenCalledWith(reference)
  })

  it('returns typed secret resolution failures and keeps audit redaction value-free', async () => {
    const request = liveRequest()
    const reference = request.providerProfile.credentialRef
    if (!reference) throw new Error('expected live request credential reference')
    const failure: SecretResolutionFailure = {
      kind: 'SecretResolutionFailure',
      code: 'not-found',
      reference,
      message: 'secret was not found',
    }
    const resolver = fakeResolver({ ok: false, error: failure })

    const result = await resolveProviderCredentialForRequest({ request, resolver })
    const auditFailure = redactSecretResolutionFailureForAudit(failure)
    const serializedAuditFailure = JSON.stringify(auditFailure)

    expect(result).toEqual({ ok: false, error: failure })
    expect(auditFailure.reference).toBe('[secret-reference:provider-credential]')
    expect(serializedAuditFailure).not.toContain(reference.id)
    expect(serializedAuditFailure).not.toContain(reference.purpose)
  })

  it('rejects malformed live provider profiles before calling the resolver', async () => {
    const resolver = fakeResolver()
    const request = {
      ...liveRequest(),
      providerProfile: {
        ...liveRequest().providerProfile,
        credentialRef: undefined,
      } as unknown as ProviderProfile,
    } as ProviderAdapterRequest

    await expect(resolveProviderCredentialForRequest({ request, resolver }))
      .rejects.toThrow(ProviderCredentialResolutionInvariantError)
    await expect(resolveProviderCredentialForRequest({ request, resolver }))
      .rejects.not.toThrow(/secret_live_llm_key|llm-provider-api-key/)
    expect(resolver.resolveSecret).not.toHaveBeenCalled()
  })

  it('wraps throwing resolvers without leaking resolver error text', async () => {
    const request = liveRequest()
    const resolver: SecretResolver = {
      resolveSecret: vi.fn(async () => {
        throw new Error('raw secret lookup included sensitive backend detail')
      }),
    }

    await expect(resolveProviderCredentialForRequest({ request, resolver }))
      .rejects.toThrow(ProviderCredentialResolutionInvariantError)
    await expect(resolveProviderCredentialForRequest({ request, resolver }))
      .rejects.not.toThrow(/raw secret lookup/)
  })

  it('does not import provider execution, filesystem reads, env reads, logging, or ID generation', async () => {
    const source = await readFile('src/opzava/platform/providers/credentials-runtime.ts', 'utf8')

    expect(source).not.toContain('process.env')
    expect(source).not.toContain('readFile')
    expect(source).not.toContain('readFileSync')
    expect(source).not.toContain('randomUUID')
    expect(source).not.toContain('console.')
    expect(source).not.toContain('JSON.stringify')
    expect(source).not.toContain('./execution')
    expect(source).not.toContain('executeProvider')
  })
})

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

function liveRequest(): ProviderAdapterRequest {
  return providerRequest({
    providerProfile: {
      schemaVersion: 1,
      providerId: 'live-llm',
      displayName: 'Live LLM',
      kind: 'llm',
      mode: 'live',
      credentialRef: credentialReference(),
      config: {
        modelRef: 'operator-managed-model',
        allowedOperations: ['generate-seo-brief'],
      },
    },
  })
}

function mockRequest(): ProviderAdapterRequest {
  return providerRequest({
    providerProfile: {
      schemaVersion: 1,
      providerId: 'mock-llm',
      displayName: 'Mock LLM',
      kind: 'llm',
      mode: 'mock',
      config: {
        fixtureSet: 'content-workflow-basic',
        allowedOperations: ['generate-seo-brief'],
      },
    },
  })
}

function providerRequest(overrides: Partial<ProviderAdapterRequest> = {}): ProviderAdapterRequest {
  return parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: 'provider_request_credentials_001',
    providerProfile: overrides.providerProfile ?? {
      schemaVersion: 1,
      providerId: 'mock-llm',
      displayName: 'Mock LLM',
      kind: 'llm',
      mode: 'mock',
      config: {
        allowedOperations: ['generate-seo-brief'],
      },
    },
    operation: 'generate-seo-brief',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_seo_brief_001',
    idempotencyKey: 'workflow:run_001:step:seo-brief:provider:v1',
    timeoutMs: 30_000,
    retry: {
      attemptNumber: 1,
      maxAttempts: 3,
    },
    input: {
      promptArtifactId: 'artifact_prompt_001',
    },
    requestSummary: {
      promptArtifactId: 'artifact_prompt_001',
    },
    startedAt: '2026-06-15T00:00:00.000Z',
  })
}

function credentialReference(): SecretReference {
  return createSecretReference({
    id: 'secret_live_llm_key',
    scope: 'provider-credential',
    purpose: 'llm-provider-api-key',
  })
}

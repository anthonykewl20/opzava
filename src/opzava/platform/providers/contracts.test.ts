import { describe, expect, it } from 'vitest'

import { createSecretReference } from '../admin-config/contracts'
import {
  createExternalCallRecordFromProviderAdapterResult,
  parseExternalCallRecord,
  parseProviderAdapterRequest,
  parseProviderAdapterResult,
  parseProviderProfile,
  redactProviderAdapterRequestForAudit,
  redactProviderProfileForAudit,
} from './contracts'

describe('Opzava provider profile contracts', () => {
  it('accepts mock provider profiles without credentials', () => {
    const profile = parseProviderProfile({
      schemaVersion: 1,
      providerId: 'mock-llm',
      displayName: 'Mock LLM',
      kind: 'llm',
      mode: 'mock',
      config: {
        fixtureSet: 'content-workflow-basic',
      },
    })

    expect(profile.mode).toBe('mock')
    expect(profile.credentialRef).toBeUndefined()
  })

  it('requires live provider credentials to use SecretReference', () => {
    expect(() =>
      parseProviderProfile({
        schemaVersion: 1,
        providerId: 'anthropic-live',
        displayName: 'Anthropic Live',
        kind: 'llm',
        mode: 'live',
        credentialRef: 'sk-live-do-not-store-cleartext',
        config: {
          model: 'operator-managed-model',
        },
      }),
    ).toThrow(/SecretReference/)
  })

  it('redacts live provider credentials before audit serialization', () => {
    const profile = parseProviderProfile({
      schemaVersion: 1,
      providerId: 'wordpress-live',
      displayName: 'WordPress Live',
      kind: 'publishing',
      mode: 'live',
      credentialRef: createSecretReference({
        id: 'secret_wordpress_live_password',
        scope: 'provider-credential',
        purpose: 'wordpress-publishing-password',
      }),
      config: {
        endpoint: 'https://example.invalid/wp-json/wp/v2',
      },
    })

    const auditProfile = redactProviderProfileForAudit(profile)
    const serialized = JSON.stringify(auditProfile)

    expect(auditProfile.credentialRef).toBe('[secret-reference:provider-credential]')
    expect(serialized).not.toContain('secret_wordpress_live_password')
    expect(serialized).not.toContain('wordpress-publishing-password')
  })

  it('records external calls with idempotency, retry, timeout, and secret-safe summaries', () => {
    const call = parseExternalCallRecord({
      schemaVersion: 1,
      externalCallId: 'external_call_001',
      providerId: 'mock-llm',
      operation: 'generate-seo-brief',
      workflowRunId: 'run_001',
      stepRunId: 'step_run_seo_brief_001',
      status: 'succeeded',
      idempotencyKey: 'workflow:run_001:step:seo-brief:external:v1',
      timeoutMs: 30000,
      retry: {
        attemptNumber: 1,
        maxAttempts: 3,
      },
      requestSummary: {
        artifactIds: ['artifact_idea_001'],
        promptTokensEstimate: 1200,
      },
      responseSummary: {
        outputArtifactId: 'artifact_seo_brief_001',
        statusCode: 200,
      },
      startedAt: '2026-06-15T00:00:00.000Z',
      finishedAt: '2026-06-15T00:00:03.000Z',
    })

    expect(call.idempotencyKey).toContain('run_001')
    expect(call.timeoutMs).toBe(30000)
    expect(call.retry.maxAttempts).toBe(3)
  })

  it('rejects external-call summaries that contain secret references', () => {
    expect(() =>
      parseExternalCallRecord({
        schemaVersion: 1,
        externalCallId: 'external_call_bad_secret_001',
        providerId: 'live-llm',
        operation: 'generate-seo-brief',
        workflowRunId: 'run_001',
        stepRunId: 'step_run_seo_brief_001',
        status: 'failed',
        idempotencyKey: 'workflow:run_001:step:seo-brief:external:v1',
        timeoutMs: 30000,
        retry: {
          attemptNumber: 1,
          maxAttempts: 3,
        },
        requestSummary: {
          credential: createSecretReference({
            id: 'secret_live_llm_key',
            scope: 'provider-credential',
            purpose: 'llm-provider-api-key',
          }),
        },
        responseSummary: null,
        startedAt: '2026-06-15T00:00:00.000Z',
        finishedAt: '2026-06-15T00:00:03.000Z',
      }),
    ).toThrow(/secret/i)
  })

  it('creates external call records from provider adapter results without leaking credential references', () => {
    const credentialRef = createSecretReference({
      id: 'secret_live_llm_key',
      scope: 'provider-credential',
      purpose: 'llm-provider-api-key',
    })
    const request = parseProviderAdapterRequest({
      schemaVersion: 1,
      requestId: 'provider_request_001',
      providerProfile: {
        schemaVersion: 1,
        providerId: 'live-llm',
        displayName: 'Live LLM',
        kind: 'llm',
        mode: 'live',
        credentialRef,
        config: {
          modelRef: 'operator-managed-model',
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
    const result = parseProviderAdapterResult({
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
    })

    const call = createExternalCallRecordFromProviderAdapterResult({
      externalCallId: 'external_call_provider_001',
      request,
      result,
    })
    const auditRequest = redactProviderAdapterRequestForAudit(request)
    const serialized = JSON.stringify(call)
    const serializedAuditRequest = JSON.stringify(auditRequest)

    expect(call.providerId).toBe('live-llm')
    expect(call.requestSummary).toEqual({ promptArtifactId: 'artifact_prompt_001' })
    expect(call.responseSummary).toEqual({ outputArtifactId: 'artifact_seo_brief_001' })
    expect(serialized).not.toContain(credentialRef.id)
    expect(serialized).not.toContain(credentialRef.purpose)
    expect(serializedAuditRequest).not.toContain(credentialRef.id)
    expect(serializedAuditRequest).not.toContain(credentialRef.purpose)
    expect(auditRequest.providerProfile.credentialRef).toBe('[secret-reference:provider-credential]')
  })

  it('rejects provider adapter requests for operations outside the profile allowlist', () => {
    expect(() => parseProviderAdapterRequest({
      schemaVersion: 1,
      requestId: 'provider_request_bad_operation_001',
      providerProfile: {
        schemaVersion: 1,
        providerId: 'mock-llm',
        displayName: 'Mock LLM',
        kind: 'llm',
        mode: 'mock',
        config: {
          allowedOperations: ['generate-seo-brief'],
        },
      },
      operation: 'delete-provider-resource',
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
    })).toThrow(/operation/i)
  })

  it('rejects provider adapter requests that smuggle secrets into provider input', () => {
    expect(() => parseProviderAdapterRequest({
      schemaVersion: 1,
      requestId: 'provider_request_bad_secret_001',
      providerProfile: {
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
        credential: createSecretReference({
          id: 'secret_bad_input_001',
          scope: 'provider-credential',
          purpose: 'should-not-be-provider-input',
        }),
      },
      requestSummary: {
        promptArtifactId: 'artifact_prompt_001',
      },
      startedAt: '2026-06-15T00:00:00.000Z',
    })).toThrow(/secret/i)
  })

  it('rejects provider adapter results that put secret references in persisted summaries', () => {
    expect(() => parseProviderAdapterResult({
      schemaVersion: 1,
      requestId: 'provider_request_bad_result_001',
      status: 'succeeded',
      output: {
        outputArtifactId: 'artifact_seo_brief_001',
      },
      outputSummary: {
        credential: createSecretReference({
          id: 'secret_bad_output_001',
          scope: 'provider-credential',
          purpose: 'should-not-be-output-summary',
        }),
      },
      error: null,
      finishedAt: '2026-06-15T00:00:03.000Z',
    })).toThrow(/secret/i)
  })

  it('requires failed provider adapter results to carry a bounded error summary', () => {
    expect(() => parseProviderAdapterResult({
      schemaVersion: 1,
      requestId: 'provider_request_failed_001',
      status: 'failed',
      output: null,
      outputSummary: null,
      error: null,
      finishedAt: '2026-06-15T00:00:03.000Z',
    })).toThrow(/error/i)
  })
})

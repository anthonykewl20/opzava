import { readFile } from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

import { createSecretReference } from '../admin-config/contracts'
import type { OperationalEventStorageRecord } from '../runner/repository-contracts'
import {
  createExternalCallRecordFromProviderAdapterResult,
  parseProviderAdapterRequest,
  parseProviderAdapterResult,
  type ExternalCallRecord,
  type ProviderAdapterRequest,
} from './contracts'
import type { ProviderExecutionApprovalGrant } from './approval-runtime'
import { executeApprovedLiveProviderActionOnce } from './live-execution-runtime'

describe('Opzava approved live provider execution boundary', () => {
  it('returns the existing external call without invoking the adapter when one already exists', async () => {
    const sink = eventSink()
    const adapter = succeedingAdapter()
    const existing = existingExternalCall()
    const lookup = idempotencyLookup(existing)

    const result = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter,
      request: liveRequest(),
      externalCallId: 'external_call_live_action_001',
      eventSink: sink,
      signal: new AbortController().signal,
      idempotency: lookup,
    })

    expect(result).toEqual({
      ok: true,
      outcome: 'already-executed',
      externalCallRecord: existing,
    })
    expect(adapter.execute).toHaveBeenCalledTimes(0)
    expect(sink.records).toHaveLength(0)
    expect(lookup.findExistingExternalCall).toHaveBeenCalledWith('workflow:run_001:step:seo-brief:provider:v1')
  })

  it('executes the adapter exactly once and appends one external-call event when no prior call exists', async () => {
    const sink = eventSink()
    const adapter = succeedingAdapter()
    const lookup = idempotencyLookup(null)

    const result = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter,
      request: liveRequest(),
      externalCallId: 'external_call_live_action_002',
      eventSink: sink,
      signal: new AbortController().signal,
      idempotency: lookup,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || result.outcome !== 'executed') throw new Error('expected executed outcome')
    expect(result.value.result.status).toBe('succeeded')
    expect(adapter.execute).toHaveBeenCalledTimes(1)
    expect(sink.records).toHaveLength(1)
    expect(sink.records[0]?.kind).toBe('external-call')
  })

  it('refuses to execute when the grant provider does not match the request provider', async () => {
    const sink = eventSink()
    const adapter = succeedingAdapter()
    const lookup = idempotencyLookup(null)

    const result = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant({ providerId: 'other-llm' }),
      adapter,
      request: liveRequest(),
      externalCallId: 'external_call_live_action_003',
      eventSink: sink,
      signal: new AbortController().signal,
      idempotency: lookup,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'grant-provider-mismatch',
        grantProviderId: 'other-llm',
        requestProviderId: 'live-llm',
      },
    })
    expect(adapter.execute).toHaveBeenCalledTimes(0)
    expect(lookup.findExistingExternalCall).toHaveBeenCalledTimes(0)
    expect(sink.records).toHaveLength(0)
  })

  it('refuses to execute when the grant operation does not match the request operation', async () => {
    const sink = eventSink()
    const adapter = succeedingAdapter()
    const lookup = idempotencyLookup(null)

    const result = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant({ operation: 'publish-wordpress-draft' }),
      adapter,
      request: liveRequest(),
      externalCallId: 'external_call_live_action_004',
      eventSink: sink,
      signal: new AbortController().signal,
      idempotency: lookup,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'grant-operation-mismatch',
        grantOperation: 'publish-wordpress-draft',
        requestOperation: 'generate-seo-brief',
      },
    })
    expect(adapter.execute).toHaveBeenCalledTimes(0)
  })

  it('returns deeply equal results for identical already-executed inputs', async () => {
    const existing = existingExternalCall()

    const first = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter: succeedingAdapter(),
      request: liveRequest(),
      externalCallId: 'external_call_live_action_005',
      eventSink: eventSink(),
      signal: new AbortController().signal,
      idempotency: idempotencyLookup(existing),
    })
    const second = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter: succeedingAdapter(),
      request: liveRequest(),
      externalCallId: 'external_call_live_action_005',
      eventSink: eventSink(),
      signal: new AbortController().signal,
      idempotency: idempotencyLookup(existing),
    })

    expect(first).toEqual(second)
  })

  it('does not read files, env, generate IDs, or use nondeterministic time', async () => {
    const source = await readFile('src/opzava/platform/providers/live-execution-runtime.ts', 'utf8')

    expect(source).not.toContain('Date.now')
    expect(source).not.toContain('crypto')
    expect(source).not.toContain('process.env')
    expect(source).not.toContain('from \'fs\'')
    expect(source).not.toContain('require(\'fs\')')
    expect(source).not.toContain('fetch(')
  })
})

function matchingGrant(overrides: Partial<ProviderExecutionApprovalGrant> = {}): ProviderExecutionApprovalGrant {
  return {
    approvalId: 'approval_live_llm_generate_001',
    providerId: 'live-llm',
    operation: 'generate-seo-brief',
    approvalTargetId: 'external_action_live_llm_generate_001',
    requestedAction: 'provider:live-llm:generate-seo-brief',
    expiresAt: '2026-06-16T00:00:00.000Z',
    ...overrides,
  }
}

function succeedingAdapter() {
  const execute = vi.fn(async (request: ProviderAdapterRequest) => parseProviderAdapterResult({
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
  }))
  return { execute }
}

function existingExternalCall(): ExternalCallRecord {
  return createExternalCallRecordFromProviderAdapterResult({
    externalCallId: 'external_call_live_action_prior_001',
    request: liveRequest(),
    result: parseProviderAdapterResult({
      schemaVersion: 1,
      requestId: 'provider_request_execution_001',
      status: 'succeeded',
      output: {
        outputArtifactId: 'artifact_seo_brief_prior_001',
      },
      outputSummary: {
        outputArtifactId: 'artifact_seo_brief_prior_001',
      },
      error: null,
      finishedAt: '2026-06-15T00:00:02.000Z',
    }),
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

function liveRequest(): ProviderAdapterRequest {
  return parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: 'provider_request_execution_001',
    providerProfile: {
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

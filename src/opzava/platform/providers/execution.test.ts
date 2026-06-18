import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSecretReference } from '../admin-config/contracts'
import { createRunnerRepository } from '../runner/repository'
import { parseProviderAdapterRequest, parseProviderAdapterResult } from './contracts'
import { executeProviderAdapterWithEvents } from './execution'

describe('Opzava provider adapter execution events', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function repository() {
    db = new Database(':memory:')
    return createRunnerRepository(db)
  }

  it('executes a provider adapter and persists a redacted external-call event', async () => {
    const repo = repository()
    const request = liveRequest()
    const execute = vi.fn(async () => parseProviderAdapterResult({
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

    const execution = await executeProviderAdapterWithEvents({
      adapter: { execute },
      request,
      externalCallId: 'external_call_provider_execution_001',
      eventSink: repo,
      signal: new AbortController().signal,
    })
    const events = repo.listOperationalEventsForWorkflowRun(request.workflowRunId)
    const serializedEvent = JSON.stringify(events[0])

    expect(execution.result.status).toBe('succeeded')
    expect(execute).toHaveBeenCalledWith(request, expect.any(AbortSignal))
    expect(events).toHaveLength(1)
    expect(events[0]?.kind).toBe('external-call')
    expect(events[0]?.occurredAt).toBe('2026-06-15T00:00:03.000Z')
    expect(events[0]?.event).toMatchObject({
      providerId: 'live-llm',
      operation: 'generate-seo-brief',
      status: 'succeeded',
      requestSummary: {
        promptArtifactId: 'artifact_prompt_001',
      },
      responseSummary: {
        outputArtifactId: 'artifact_seo_brief_001',
      },
    })
    expect(serializedEvent).not.toContain('secret_live_llm_key')
    expect(serializedEvent).not.toContain('llm-provider-api-key')
  })

  it('persists failed provider results without storing raw provider error messages', async () => {
    const repo = repository()
    const request = liveRequest()
    const execute = vi.fn(async () => parseProviderAdapterResult({
      schemaVersion: 1,
      requestId: request.requestId,
      status: 'failed',
      output: null,
      outputSummary: null,
      error: {
        class: 'provider-error',
        message: 'provider body included user text that must not be persisted',
      },
      finishedAt: '2026-06-15T00:00:04.000Z',
    }))

    await executeProviderAdapterWithEvents({
      adapter: { execute },
      request,
      externalCallId: 'external_call_provider_execution_failed_001',
      eventSink: repo,
      signal: new AbortController().signal,
    })
    const events = repo.listOperationalEventsForWorkflowRun(request.workflowRunId)
    const serializedEvent = JSON.stringify(events[0])

    expect(events[0]?.event).toMatchObject({
      status: 'failed',
      responseSummary: {
        errorClass: 'provider-error',
      },
    })
    expect(serializedEvent).not.toContain('provider body included user text')
  })

  it('persists failed provider events when the adapter throws before returning a result', async () => {
    const repo = repository()
    const request = liveRequest()
    const execute = vi.fn(async () => {
      throw new Error('raw provider exception included user payload')
    })

    const execution = await executeProviderAdapterWithEvents({
      adapter: { execute },
      request,
      externalCallId: 'external_call_provider_execution_thrown_001',
      eventSink: repo,
      signal: new AbortController().signal,
      clock: { now: () => new Date('2026-06-15T00:00:05.000Z') },
    })
    const events = repo.listOperationalEventsForWorkflowRun(request.workflowRunId)
    const serializedEvent = JSON.stringify(events[0])

    expect(execution.result.status).toBe('failed')
    expect(events[0]?.occurredAt).toBe('2026-06-15T00:00:05.000Z')
    expect(events[0]?.event).toMatchObject({
      status: 'failed',
      responseSummary: {
        errorClass: 'provider-error',
      },
    })
    expect(serializedEvent).not.toContain('raw provider exception included user payload')
  })

  it('persists timed-out provider events when the adapter ignores the abort signal', async () => {
    vi.useFakeTimers()
    try {
      const repo = repository()
      const request = liveRequest({ timeoutMs: 50 })
      const adapterSignals: AbortSignal[] = []
      const execute = vi.fn((_request, signal: AbortSignal) => {
        adapterSignals.push(signal)
        return new Promise<never>(() => undefined)
      })
      const execution = executeProviderAdapterWithEvents({
        adapter: { execute },
        request,
        externalCallId: 'external_call_provider_execution_timeout_001',
        eventSink: repo,
        signal: new AbortController().signal,
        clock: { now: () => new Date('2026-06-15T00:00:06.000Z') },
      })

      await vi.advanceTimersByTimeAsync(50)
      const result = await execution
      const events = repo.listOperationalEventsForWorkflowRun(request.workflowRunId)

      expect(adapterSignals[0]?.aborted).toBe(true)
      expect(result.result.status).toBe('timed-out')
      expect(events[0]?.occurredAt).toBe('2026-06-15T00:00:06.000Z')
      expect(events[0]?.event).toMatchObject({
        status: 'timed-out',
        responseSummary: {
          errorClass: 'timeout',
        },
      })
    } finally {
      vi.useRealTimers()
    }
  })
})

function liveRequest(overrides: { timeoutMs?: number } = {}) {
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
    timeoutMs: overrides.timeoutMs ?? 30_000,
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

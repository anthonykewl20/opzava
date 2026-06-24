import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSecretReference } from '../admin-config/contracts'
import { applyOpzavaExternalCallReservationSchema } from '../runner/migrations'
import { createRunnerRepository } from '../runner/repository'
import { parseProviderAdapterRequest, parseProviderAdapterResult, type ProviderAdapterRequest } from './contracts'
import type { ProviderExecutionApprovalGrant } from './approval-runtime'
import { createExternalCallIdempotencyLookup } from './external-call-lookup'
import { createExternalCallReservation } from './external-call-reservation'
import { executeApprovedLiveProviderActionOnce } from './live-execution-runtime'

describe('Opzava approved live execution with atomic reservation', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function setup() {
    db = new Database(':memory:')
    const repo = createRunnerRepository(db)
    repo.listOperationalEventsForWorkflowRun('run_001') // force the runner schema to exist
    applyOpzavaExternalCallReservationSchema(db)
    const lookup = createExternalCallIdempotencyLookup(db)
    const reservation = {
      reserve: createExternalCallReservation(db),
      reservedAt: '2026-06-15T00:00:01.000Z',
    }
    return { repo, lookup, reservation }
  }

  it('executes exactly once when it wins the reservation', async () => {
    const { repo, lookup, reservation } = setup()
    const adapter = succeedingAdapter()

    const result = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter,
      request: liveRequest(),
      externalCallId: 'external_call_live_action_001',
      eventSink: repo,
      signal: new AbortController().signal,
      idempotency: lookup,
      reservation,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || result.outcome !== 'executed') throw new Error('expected executed outcome')
    expect(adapter.execute).toHaveBeenCalledTimes(1)
  })

  it('does not run the adapter when it loses the reservation to a prior holder', async () => {
    const { repo, lookup, reservation } = setup()
    const adapter = succeedingAdapter()
    // Another caller already holds the reservation for this idempotency key.
    reservation.reserve.reserveExternalCall({
      idempotencyKey: 'workflow:run_001:step:seo-brief:provider:v1',
      externalCallId: 'external_call_other_holder',
      reservedAt: '2026-06-15T00:00:00.000Z',
    })

    const result = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter,
      request: liveRequest(),
      externalCallId: 'external_call_live_action_001',
      eventSink: repo,
      signal: new AbortController().signal,
      idempotency: lookup,
      reservation,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected a non-error outcome')
    expect(result.outcome).toBe('reserved-elsewhere')
    expect(adapter.execute).toHaveBeenCalledTimes(0)
  })

  it('returns already-executed when a prior external call already exists, without reserving', async () => {
    const { repo, lookup, reservation } = setup()
    const adapter = succeedingAdapter()
    // Seed a completed external call for this key.
    await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter: succeedingAdapter(),
      request: liveRequest(),
      externalCallId: 'external_call_seed',
      eventSink: repo,
      signal: new AbortController().signal,
      idempotency: lookup,
    })

    const result = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter,
      request: liveRequest(),
      externalCallId: 'external_call_live_action_001',
      eventSink: repo,
      signal: new AbortController().signal,
      idempotency: lookup,
      reservation,
    })

    expect(result.ok).toBe(true)
    if (!result.ok || result.outcome !== 'already-executed') throw new Error('expected already-executed')
    expect(adapter.execute).toHaveBeenCalledTimes(0)
  })

  it('retains the reservation when the executed action fails, so a retry cannot re-send it', async () => {
    const { repo, lookup, reservation } = setup()

    const result = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter: failingAdapter(),
      request: liveRequest(),
      externalCallId: 'external_call_live_action_001',
      eventSink: repo,
      signal: new AbortController().signal,
      idempotency: lookup,
      reservation,
    })

    expect(result.ok).toBe(true)
    // A transient/ambiguous failure is retained: a retry short-circuits via the persisted failed
    // record (already-executed) and the reservation stays held so a parallel caller cannot re-win.
    const reReserve = reservation.reserve.reserveExternalCall({
      idempotencyKey: 'workflow:run_001:step:seo-brief:provider:v1',
      externalCallId: 'external_call_retry',
      reservedAt: '2026-06-15T00:00:05.000Z',
    })
    expect(reReserve.outcome).toBe('already-reserved')
  })

  it('keeps the reservation when the executed action succeeds, so a duplicate reserve loses', async () => {
    const { repo, lookup, reservation } = setup()

    await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter: succeedingAdapter(),
      request: liveRequest(),
      externalCallId: 'external_call_live_action_001',
      eventSink: repo,
      signal: new AbortController().signal,
      idempotency: lookup,
      reservation,
    })

    const reReserve = reservation.reserve.reserveExternalCall({
      idempotencyKey: 'workflow:run_001:step:seo-brief:provider:v1',
      externalCallId: 'external_call_dup',
      reservedAt: '2026-06-15T00:00:05.000Z',
    })
    expect(reReserve.outcome).toBe('already-reserved')
  })

  it('releases the reservation when execution throws, so the key is not poisoned', async () => {
    const { lookup, reservation } = setup()

    await expect(executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter: succeedingAdapter(),
      request: liveRequest(),
      externalCallId: 'external_call_live_action_001',
      eventSink: throwingSink(),
      signal: new AbortController().signal,
      idempotency: lookup,
      reservation,
    })).rejects.toThrow('event sink write failed')

    const reReserve = reservation.reserve.reserveExternalCall({
      idempotencyKey: 'workflow:run_001:step:seo-brief:provider:v1',
      externalCallId: 'external_call_retry_after_throw',
      reservedAt: '2026-06-15T00:00:06.000Z',
    })
    expect(reReserve.outcome).toBe('reserved')
  })
})

function throwingSink() {
  return {
    appendOperationalEvent: vi.fn(() => {
      throw new Error('event sink write failed')
    }),
  }
}

function failingAdapter() {
  const execute = vi.fn(async (request: ProviderAdapterRequest) => parseProviderAdapterResult({
    schemaVersion: 1,
    requestId: request.requestId,
    status: 'failed',
    output: null,
    outputSummary: null,
    error: { class: 'provider-error', message: 'adapter failed' },
    finishedAt: '2026-06-15T00:00:03.000Z',
  }))
  return { execute }
}

function matchingGrant(): ProviderExecutionApprovalGrant {
  return {
    approvalId: 'approval_live_llm_generate_001',
    providerId: 'live-llm',
    operation: 'generate-seo-brief',
    approvalTargetId: 'external_action_live_llm_generate_001',
    requestedAction: 'provider:live-llm:generate-seo-brief',
    expiresAt: '2026-06-16T00:00:00.000Z',
  }
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

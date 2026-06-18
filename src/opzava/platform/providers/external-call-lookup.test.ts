import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { createSecretReference } from '../admin-config/contracts'
import { createRunnerRepository } from '../runner/repository'
import { parseProviderAdapterRequest, parseProviderAdapterResult, type ProviderAdapterRequest } from './contracts'
import { executeProviderAdapterWithEvents } from './execution'
import { createExternalCallIdempotencyLookup } from './external-call-lookup'

describe('Opzava external-call idempotency lookup', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function repository() {
    db = new Database(':memory:')
    return createRunnerRepository(db)
  }

  async function storeExternalCall(
    repo: ReturnType<typeof createRunnerRepository>,
    request: ProviderAdapterRequest,
    status: 'succeeded' | 'failed' = 'succeeded',
  ) {
    const execute = async () => parseProviderAdapterResult(status === 'succeeded'
      ? {
          schemaVersion: 1,
          requestId: request.requestId,
          status: 'succeeded',
          output: { outputArtifactId: 'artifact_seo_brief_001' },
          outputSummary: { outputArtifactId: 'artifact_seo_brief_001' },
          error: null,
          finishedAt: '2026-06-15T00:00:03.000Z',
        }
      : {
          schemaVersion: 1,
          requestId: request.requestId,
          status: 'failed',
          output: null,
          outputSummary: null,
          error: { class: 'provider-error', message: 'adapter failed' },
          finishedAt: '2026-06-15T00:00:03.000Z',
        })
    await executeProviderAdapterWithEvents({
      adapter: { execute },
      request,
      externalCallId: `external_call_${status}`,
      eventSink: repo,
      signal: new AbortController().signal,
    })
  }

  it('returns null when no external call has been stored for the idempotency key', () => {
    const repo = repository()
    // Initialize the runner schema the way app startup does before lookups run.
    repo.listOperationalEventsForWorkflowRun('run_001')
    const lookup = createExternalCallIdempotencyLookup(db as Database.Database)

    expect(lookup.findExistingExternalCall('workflow:run_001:step:seo-brief:provider:v1')).toBeNull()
  })

  it('returns the stored external-call record for a matching idempotency key', async () => {
    const repo = repository()
    await storeExternalCall(repo, liveRequest())
    const lookup = createExternalCallIdempotencyLookup(db as Database.Database)

    const found = lookup.findExistingExternalCall('workflow:run_001:step:seo-brief:provider:v1')

    expect(found).not.toBeNull()
    expect(found?.idempotencyKey).toBe('workflow:run_001:step:seo-brief:provider:v1')
    expect(found?.providerId).toBe('live-llm')
    expect(found?.operation).toBe('generate-seo-brief')
  })

  it('returns null for an idempotency key that does not match any stored external call', async () => {
    const repo = repository()
    await storeExternalCall(repo, liveRequest())
    const lookup = createExternalCallIdempotencyLookup(db as Database.Database)

    expect(lookup.findExistingExternalCall('workflow:run_999:step:other:provider:v1')).toBeNull()
  })

  it('ignores a failed external call so the action can be retried', async () => {
    const repo = repository()
    await storeExternalCall(repo, liveRequest(), 'failed')
    const lookup = createExternalCallIdempotencyLookup(db as Database.Database)

    expect(lookup.findExistingExternalCall('workflow:run_001:step:seo-brief:provider:v1')).toBeNull()
  })
})

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

import { describe, expect, it } from 'vitest'
import { parseProviderAdapterRequest, createExternalCallRecordFromProviderAdapterResult } from '@/opzava/platform/providers/contracts'
import { createMockSourceCaptureProviderAdapter, createMockSourceCaptureProviderProfile, SOURCE_CAPTURE_OPERATION } from './source-capture-adapter'

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
}

function request() {
  return parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: 'req_001',
    providerProfile: createMockSourceCaptureProviderProfile(),
    operation: SOURCE_CAPTURE_OPERATION,
    workflowRunId: 'run_001',
    stepRunId: 'step_run_sc_001',
    idempotencyKey: 'workflow:run_001:step:source-capture:v1',
    timeoutMs: 30_000,
    retry: { attemptNumber: 1, maxAttempts: 3 },
    input: VALID_IDEA,
    requestSummary: { ideaId: 'idea_001' },
    startedAt: '2026-06-15T00:00:00.000Z'
  })
}

function adapter() {
  return createMockSourceCaptureProviderAdapter({ now: () => '2026-06-15T00:00:05.000Z' })
}

describe('createMockSourceCaptureProviderAdapter', () => {
  it('executes the source-capture operation and returns a succeeded result', async () => {
    const result = await adapter().execute(request(), new AbortController().signal)
    expect(result.status).toBe('succeeded')
    expect(result.error).toBeNull()
    const output = result.output as { sources: unknown[] }
    expect(output.sources.length).toBeGreaterThan(0)
  })

  it('produces a valid external-call record', async () => {
    const req = request()
    const result = await adapter().execute(req, new AbortController().signal)
    const record = createExternalCallRecordFromProviderAdapterResult({ externalCallId: 'ext_001', request: req, result })
    expect(record.providerId).toBe('mock-source-capture')
    expect(record.operation).toBe(SOURCE_CAPTURE_OPERATION)
    expect(record.status).toBe('succeeded')
  })

  it('builds a profile scoped to the source-capture operation', () => {
    const profile = createMockSourceCaptureProviderProfile()
    expect(profile.mode).toBe('mock')
    expect(profile.config.allowedOperations).toEqual([SOURCE_CAPTURE_OPERATION])
  })
})

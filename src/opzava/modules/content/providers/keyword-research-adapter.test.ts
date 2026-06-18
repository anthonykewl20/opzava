import { describe, expect, it } from 'vitest'
import { parseProviderAdapterRequest, createExternalCallRecordFromProviderAdapterResult } from '@/opzava/platform/providers/contracts'
import { createMockKeywordResearchProviderAdapter, createMockKeywordResearchProviderProfile, KEYWORD_RESEARCH_OPERATION } from './keyword-research-adapter'

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
    providerProfile: createMockKeywordResearchProviderProfile(),
    operation: KEYWORD_RESEARCH_OPERATION,
    workflowRunId: 'run_001',
    stepRunId: 'step_run_kw_001',
    idempotencyKey: 'workflow:run_001:step:keyword-research:v1',
    timeoutMs: 30_000,
    retry: { attemptNumber: 1, maxAttempts: 3 },
    input: VALID_IDEA,
    requestSummary: { ideaId: 'idea_001', topic: 'Cold Brew' },
    startedAt: '2026-06-15T00:00:00.000Z'
  })
}

function adapter() {
  return createMockKeywordResearchProviderAdapter({ now: () => '2026-06-15T00:00:05.000Z' })
}

describe('createMockKeywordResearchProviderAdapter', () => {
  it('executes the keyword-research operation and returns a succeeded result', async () => {
    const req = request()
    const result = await adapter().execute(req, new AbortController().signal)

    expect(result.status).toBe('succeeded')
    expect(result.requestId).toBe('req_001')
    expect(result.error).toBeNull()

    const output = result.output as { primaryKeyword: string; candidates: unknown[] }
    expect(output.primaryKeyword).toBe('Cold Brew')
    expect(output.candidates.length).toBeGreaterThan(0)

    const summary = result.outputSummary as { candidateCount: number }
    expect(summary.candidateCount).toBeGreaterThan(0)
  })

  it('produces a valid external-call record from the adapter result', async () => {
    const req = request()
    const result = await adapter().execute(req, new AbortController().signal)

    const record = createExternalCallRecordFromProviderAdapterResult({
      externalCallId: 'ext_001',
      request: req,
      result
    })

    expect(record.providerId).toBe('mock-keyword-research')
    expect(record.operation).toBe(KEYWORD_RESEARCH_OPERATION)
    expect(record.status).toBe('succeeded')
    expect(record.workflowRunId).toBe('run_001')
    expect(record.idempotencyKey).toBe('workflow:run_001:step:keyword-research:v1')
  })

  it('builds a profile that only allows the keyword-research operation', () => {
    const profile = createMockKeywordResearchProviderProfile()

    expect(profile.mode).toBe('mock')
    expect(profile.config.allowedOperations).toEqual([KEYWORD_RESEARCH_OPERATION])
  })
})

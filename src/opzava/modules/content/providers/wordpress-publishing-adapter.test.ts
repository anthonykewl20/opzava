import { describe, expect, it } from 'vitest'
import { parseProviderAdapterRequest, createExternalCallRecordFromProviderAdapterResult } from '@/opzava/platform/providers/contracts'
import { createMockWordpressPublishingProviderAdapter, createMockWordpressPublishingProviderProfile, WORDPRESS_DRAFT_CREATE_OPERATION } from './wordpress-publishing-adapter'

const DRAFT_REQUEST = {
  schemaVersion: 1,
  requestId: 'wpreq_001',
  ideaId: 'idea_001',
  draftId: 'draft_artifact_001',
  approvalId: 'appr_001',
  title: 'Cold Brew Guide',
  bodyMarkdown: '# Cold Brew Guide\n\nBody.',
  status: 'draft' as const,
  gateArtifacts: {
    sourceCaptureId: 'sc_art_1',
    factCheckReportId: 'fc_art_1',
    brandReviewId: 'br_art_1',
    antiSlopReviewId: 'as_art_1'
  },
  createdAt: '2026-06-17T00:00:00.000Z'
}

function request() {
  return parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: 'req_001',
    providerProfile: createMockWordpressPublishingProviderProfile(),
    operation: WORDPRESS_DRAFT_CREATE_OPERATION,
    workflowRunId: 'run_001',
    stepRunId: 'step_run_wp_001',
    idempotencyKey: 'workflow:run_001:step:wordpress-draft:v1',
    timeoutMs: 30_000,
    retry: { attemptNumber: 1, maxAttempts: 3 },
    input: DRAFT_REQUEST,
    requestSummary: { requestId: 'wpreq_001' },
    startedAt: '2026-06-15T00:00:00.000Z'
  })
}

function adapter() {
  return createMockWordpressPublishingProviderAdapter({ now: () => '2026-06-15T00:00:05.000Z' })
}

describe('wordpress-publishing-adapter', () => {
  it('creates a draft-only wordpress result', async () => {
    const result = await adapter().execute(request(), new AbortController().signal)
    expect(result.status).toBe('succeeded')
    expect(result.error).toBeNull()
    const output = result.output as { status: string; externalDraftId: string; sourceRequestId: string }
    expect(output.status).toBe('draft')
    expect(output.sourceRequestId).toBe('wpreq_001')
    expect(output.externalDraftId).toBe('wp-draft-wpreq_001')
  })

  it('produces a valid external-call record for a publishing provider', async () => {
    const req = request()
    const result = await adapter().execute(req, new AbortController().signal)
    const record = createExternalCallRecordFromProviderAdapterResult({
      externalCallId: 'ext_001',
      request: req,
      result
    })
    expect(record.providerId).toBe('mock-wordpress')
    expect(record.operation).toBe(WORDPRESS_DRAFT_CREATE_OPERATION)
    expect(record.status).toBe('succeeded')
  })

  it('builds a publishing-kind profile scoped to draft creation', () => {
    const profile = createMockWordpressPublishingProviderProfile()
    expect(profile.kind).toBe('publishing')
    expect(profile.mode).toBe('mock')
    expect(profile.config.allowedOperations).toEqual([WORDPRESS_DRAFT_CREATE_OPERATION])
  })

  it('rejects a non-draft-request input', async () => {
    await expect(
      adapter().execute(
        parseProviderAdapterRequest({
          schemaVersion: 1,
          requestId: 'req_002',
          providerProfile: createMockWordpressPublishingProviderProfile(),
          operation: WORDPRESS_DRAFT_CREATE_OPERATION,
          workflowRunId: 'run_001',
          stepRunId: null,
          idempotencyKey: 'k:v2',
          timeoutMs: 30_000,
          retry: { attemptNumber: 1, maxAttempts: 3 },
          input: { not: 'a draft request' },
          requestSummary: {},
          startedAt: '2026-06-15T00:00:00.000Z'
        }),
        new AbortController().signal
      )
    ).rejects.toThrow()
  })
})

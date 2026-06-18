import { describe, expect, it } from 'vitest'
import { parseProviderAdapterRequest } from '@/opzava/platform/providers/contracts'
import type { HttpClient } from '@/opzava/modules/content/providers/wordpress-live-publisher'
import {
  createLiveWordpressProviderAdapter,
  createLiveWordpressProviderProfile,
  WORDPRESS_LIVE_OPERATION,
} from './wordpress-live-adapter'

const connection = { siteUrl: 'https://blog.example.com', appPassword: 'pw' }

const DRAFT = {
  schemaVersion: 1,
  requestId: 'wp1',
  ideaId: 'i',
  draftId: 'd',
  approvalId: 'a',
  title: 'T',
  bodyMarkdown: '# B',
  status: 'draft',
  gateArtifacts: {
    sourceCaptureId: 's',
    factCheckReportId: 'f',
    brandReviewId: 'b',
    antiSlopReviewId: 'as',
  },
  createdAt: 't',
}

function req() {
  return parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: 'r1',
    providerProfile: createLiveWordpressProviderProfile('secret_wp_1'),
    operation: WORDPRESS_LIVE_OPERATION,
    workflowRunId: 'run',
    stepRunId: 'step',
    idempotencyKey: 'k:v1',
    timeoutMs: 30000,
    retry: { attemptNumber: 1, maxAttempts: 3 },
    input: DRAFT,
    requestSummary: { requestId: 'wp1' },
    startedAt: '2026-06-15T00:00:00.000Z',
  })
}

describe('createLiveWordpressProviderAdapter', () => {
  it('maps a successful draft to a succeeded result', async () => {
    const http: HttpClient = async () => ({
      ok: true,
      status: 201,
      json: async () => ({ id: 99 }),
    })
    const r = await createLiveWordpressProviderAdapter({
      connection,
      http,
      now: () => '2026-06-15T00:00:05.000Z',
    }).execute(req(), new AbortController().signal)
    expect(r.status).toBe('succeeded')
    expect((r.output as { externalPostId: string }).externalPostId).toBe('99')
  })

  it('maps a rejected call to a failed result with provider-error', async () => {
    const http: HttpClient = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })
    const r = await createLiveWordpressProviderAdapter({
      connection,
      http,
      now: () => 'x',
    }).execute(req(), new AbortController().signal)
    expect(r.status).toBe('failed')
    expect(r.error?.class).toBe('provider-error')
  })

  it('builds a live publishing profile', () => {
    const p = createLiveWordpressProviderProfile('s1')
    expect(p.mode).toBe('live')
    expect(p.kind).toBe('publishing')
  })
})

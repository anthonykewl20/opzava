import { describe, expect, it } from 'vitest'
import { parseProviderAdapterRequest } from '@/opzava/platform/providers/contracts'
import {
  createLiveResendProviderAdapter,
  createLiveResendProviderProfile,
  RESEND_LIVE_OPERATION,
} from './resend-live-adapter'
import type { ResendHttpClient } from './resend-live-sender'

const connection = { fromAddress: 'news@example.com', apiKey: 're_1' }

function req() {
  return parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: 'r1',
    providerProfile: createLiveResendProviderProfile('secret_re_1'),
    operation: RESEND_LIVE_OPERATION,
    workflowRunId: 'run',
    stepRunId: 'step',
    idempotencyKey: 'k:v1',
    timeoutMs: 30000,
    retry: { attemptNumber: 1, maxAttempts: 3 },
    input: { to: 'reader@example.com', subject: 'Hi', html: '<p>Hi</p>' },
    requestSummary: {},
    startedAt: '2026-06-15T00:00:00.000Z',
  })
}

describe('createLiveResendProviderAdapter', () => {
  it('maps a successful send to a succeeded result', async () => {
    const http: ResendHttpClient = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg_1' }),
    })
    const r = await createLiveResendProviderAdapter({
      connection,
      http,
      now: () => 'x',
    }).execute(req(), new AbortController().signal)
    expect(r.status).toBe('succeeded')
    expect((r.output as { messageId: string }).messageId).toBe('msg_1')
  })

  it('maps a rejected key to a failed result', async () => {
    const http: ResendHttpClient = async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })
    const r = await createLiveResendProviderAdapter({
      connection,
      http,
      now: () => 'x',
    }).execute(req(), new AbortController().signal)
    expect(r.status).toBe('failed')
  })

  it('builds a live email profile', () => {
    const p = createLiveResendProviderProfile('s')
    expect(p.mode).toBe('live')
    expect(p.kind).toBe('email')
  })
})

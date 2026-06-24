import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { applyOpzavaExternalCallReservationSchema } from '../runner/migrations'
import { createRunnerRepository } from '../runner/repository'
import { parseProviderAdapterRequest, type ProviderAdapterRequest } from './contracts'
import type { ProviderExecutionApprovalGrant } from './approval-runtime'
import { createExternalCallIdempotencyLookup } from './external-call-lookup'
import { createExternalCallReservation } from './external-call-reservation'
import { executeApprovedLiveProviderActionOnce } from './live-execution-runtime'
import {
  createLiveResendProviderAdapter,
  createLiveResendProviderProfile,
  RESEND_LIVE_OPERATION,
} from '@/opzava/modules/content/providers/resend-live-adapter'
import type { ResendHttpClient } from '@/opzava/modules/content/providers/resend-live-sender'

// RUN-1 exactly-once hole: a transient/ambiguous provider failure (Resend returns {ok:false} after
// potentially accepting the email) must NOT allow a runner retry to re-send. The guarded executor
// must invoke the provider send exactly once even across a failed-retry -> succeed sequence: the
// persisted failed external-call record short-circuits the retry via 'already-executed'.
describe('Opzava approved live execution is exactly-once across a transient provider failure', () => {
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

  it('invokes the Resend send exactly once and returns already-executed on retry after a transient failure', async () => {
    const { repo, lookup, reservation } = setup()

    // Resend fails once (transient/ambiguous: it may have accepted the email before returning the
    // error), then would succeed on a naive retry.
    const http = vi.fn<ResendHttpClient>(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }))
    const sendSpy = http // the HTTP call IS the send; counting it counts delivered attempts.

    const adapter = createLiveResendProviderAdapter({
      connection: { fromAddress: 'news@example.com', apiKey: 're_1' },
      http,
      now: () => '2026-06-15T00:00:03.000Z',
    })

    // First attempt: transient failure. A failed external-call record is persisted and the
    // reservation is retained so a retry cannot re-send.
    const first = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter,
      request: liveResendRequest(),
      externalCallId: 'external_call_live_action_001',
      eventSink: repo,
      signal: new AbortController().signal,
      idempotency: lookup,
      reservation,
    })

    expect(first.ok).toBe(true)
    if (!first.ok || first.outcome !== 'executed') {
      throw new Error('expected the first attempt to execute (and persist a failed record)')
    }
    expect(first.value.result.status).toBe('failed')
    expect(sendSpy).toHaveBeenCalledTimes(1)

    // A naive retry would now hit Resend again. Switch the mock to success to prove that even when
    // success is available, the guarded executor does NOT take it.
    http.mockImplementationOnce(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ id: 'msg_should_never_be_used' }),
    }))

    const second = await executeApprovedLiveProviderActionOnce({
      grant: matchingGrant(),
      adapter,
      request: liveResendRequest(),
      externalCallId: 'external_call_live_action_002',
      eventSink: repo,
      signal: new AbortController().signal,
      idempotency: lookup,
      reservation,
    })

    // The retry short-circuits via already-executed: the persisted failed record is treated as
    // ambiguous, so a re-send is suppressed.
    expect(second.ok).toBe(true)
    if (!second.ok || second.outcome !== 'already-executed') {
      throw new Error('expected the retry to short-circuit via already-executed')
    }
    // Exactly one Resend send across both attempts — no duplicate email.
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })
})

function matchingGrant(): ProviderExecutionApprovalGrant {
  return {
    approvalId: 'approval_live_resend_send_001',
    providerId: 'live-resend',
    operation: RESEND_LIVE_OPERATION,
    approvalTargetId: 'external_action_live_resend_send_001',
    requestedAction: `provider:live-resend:${RESEND_LIVE_OPERATION}`,
    expiresAt: '2026-06-16T00:00:00.000Z',
  }
}

function liveResendRequest(): ProviderAdapterRequest {
  return parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: 'provider_request_resend_001',
    providerProfile: createLiveResendProviderProfile('secret_re_1'),
    operation: RESEND_LIVE_OPERATION,
    workflowRunId: 'run_001',
    stepRunId: 'step_run_resend_001',
    idempotencyKey: 'workflow:run_001:step:resend-email-send:provider:v1',
    timeoutMs: 30_000,
    retry: { attemptNumber: 1, maxAttempts: 3 },
    input: { to: 'reader@example.com', subject: 'Hi', html: '<p>Hi</p>' },
    requestSummary: { to: 'reader@example.com' },
    startedAt: '2026-06-15T00:00:00.000Z',
  })
}

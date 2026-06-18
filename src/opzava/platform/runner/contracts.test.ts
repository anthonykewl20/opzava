import { describe, expect, it } from 'vitest'

import { createSecretReference } from '../admin-config/contracts'
import {
  parseAttempt,
  parseDeadLetter,
  parseJob,
  transitionJobStatus,
} from './contracts'

describe('Opzava runner contracts', () => {
  it('accepts durable jobs with idempotency keys and bounded retry budgets', () => {
    const job = parseJob({
      schemaVersion: 1,
      jobId: 'job_content_seo_brief_001',
      workflowRunId: 'run_001',
      stepRunId: 'step_run_seo_brief_001',
      status: 'queued',
      idempotencyKey: 'workflow:run_001:step:seo-brief:v1',
      payload: {
        inputArtifactIds: ['artifact_idea_001'],
      },
      priority: 50,
      scheduledAt: '2026-06-15T00:00:00.000Z',
      lease: null,
      attemptCount: 0,
      maxAttempts: 3,
    })

    expect(job.status).toBe('queued')
    expect(job.maxAttempts).toBe(3)
    expect(job.idempotencyKey).toContain('run_001')
  })

  it('rejects secret references in durable job payloads', () => {
    expect(() =>
      parseJob({
        schemaVersion: 1,
        jobId: 'job_bad_secret_001',
        workflowRunId: 'run_001',
        stepRunId: 'step_run_provider_001',
        status: 'queued',
        idempotencyKey: 'workflow:run_001:step:provider:v1',
        payload: {
          credential: createSecretReference({
            id: 'secret_live_provider_key',
            scope: 'provider-credential',
            purpose: 'llm-provider-api-key',
          }),
        },
        priority: 50,
        scheduledAt: '2026-06-15T00:00:00.000Z',
        lease: null,
        attemptCount: 0,
        maxAttempts: 3,
      }),
    ).toThrow(/secret/i)
  })

  it('allows only explicit job state transitions', () => {
    const queued = parseJob({
      schemaVersion: 1,
      jobId: 'job_content_seo_brief_001',
      workflowRunId: 'run_001',
      stepRunId: 'step_run_seo_brief_001',
      status: 'queued',
      idempotencyKey: 'workflow:run_001:step:seo-brief:v1',
      payload: {
        inputArtifactIds: ['artifact_idea_001'],
      },
      priority: 50,
      scheduledAt: '2026-06-15T00:00:00.000Z',
      lease: null,
      attemptCount: 0,
      maxAttempts: 3,
    })

    const leased = transitionJobStatus(queued, {
      status: 'leased',
      lease: {
        workerId: 'worker:local:1',
        leasedAt: '2026-06-15T00:00:01.000Z',
        expiresAt: '2026-06-15T00:05:01.000Z',
      },
    })
    const succeeded = transitionJobStatus(leased, { status: 'succeeded', lease: null })

    expect(leased.status).toBe('leased')
    expect(leased.lease?.workerId).toBe('worker:local:1')
    expect(succeeded.status).toBe('succeeded')
    expect(() => transitionJobStatus(succeeded, { status: 'leased', lease: leased.lease })).toThrow(/invalid job transition/i)
  })

  it('records retryable and terminal attempt outcomes explicitly', () => {
    const retryable = parseAttempt({
      schemaVersion: 1,
      attemptId: 'attempt_001',
      jobId: 'job_content_seo_brief_001',
      attemptNumber: 1,
      status: 'failed',
      startedAt: '2026-06-15T00:00:01.000Z',
      finishedAt: '2026-06-15T00:00:05.000Z',
      errorClass: 'timeout',
      retryDecision: {
        action: 'retry',
        reason: 'Provider timeout is retryable',
        scheduledAt: '2026-06-15T00:01:05.000Z',
      },
    })
    const terminal = parseAttempt({
      ...retryable,
      attemptId: 'attempt_003',
      attemptNumber: 3,
      retryDecision: {
        action: 'dead-letter',
        reason: 'Retry budget exhausted',
        scheduledAt: null,
      },
    })

    expect(retryable.retryDecision.action).toBe('retry')
    expect(terminal.retryDecision.action).toBe('dead-letter')
  })

  it('captures replayable dead letters without storing cleartext secrets', () => {
    const deadLetter = parseDeadLetter({
      schemaVersion: 1,
      deadLetterId: 'dead_letter_001',
      jobId: 'job_content_seo_brief_001',
      workflowRunId: 'run_001',
      stepRunId: 'step_run_seo_brief_001',
      finalError: {
        class: 'timeout',
        message: 'Provider timed out after retry budget was exhausted',
      },
      replay: {
        eligible: true,
        source: 'failed-step',
        reason: 'Inputs are artifact references and the operation is idempotent',
      },
      jobSnapshot: {
        idempotencyKey: 'workflow:run_001:step:seo-brief:v1',
        payload: {
          inputArtifactIds: ['artifact_idea_001'],
        },
      },
      createdAt: '2026-06-15T00:10:00.000Z',
    })

    expect(deadLetter.replay.eligible).toBe(true)
    expect(JSON.stringify(deadLetter)).not.toContain('secret')
  })
})

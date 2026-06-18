import { describe, expect, it } from 'vitest'

import { parseAuditEvent } from '../audit/contracts'
import { parseCostEvent } from '../costs/contracts'
import { parseExternalCallRecord } from '../providers/contracts'
import { parseAttempt, parseDeadLetter, parseJob } from './contracts'
import {
  parseAttemptStorageRecord,
  parseDeadLetterStorageRecord,
  parseJobStorageRecord,
  parseOperationalEventStorageRecord,
  parseReplayQuery,
  parseRunnerRecoveryPlan,
} from './repository-contracts'

describe('Opzava runner repository contracts', () => {
  const queuedJob = parseJob({
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

  const failedAttempt = parseAttempt({
    schemaVersion: 1,
    attemptId: 'attempt_001',
    jobId: queuedJob.jobId,
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

  const deadLetter = parseDeadLetter({
    schemaVersion: 1,
    deadLetterId: 'dead_letter_001',
    jobId: queuedJob.jobId,
    workflowRunId: queuedJob.workflowRunId,
    stepRunId: queuedJob.stepRunId,
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
      idempotencyKey: queuedJob.idempotencyKey,
      payload: queuedJob.payload,
    },
    createdAt: '2026-06-15T00:10:00.000Z',
  })

  it('wraps jobs, attempts, and dead letters with durable storage metadata', () => {
    const jobRecord = parseJobStorageRecord({
      schemaVersion: 1,
      recordId: 'job_record_001',
      storedAt: '2026-06-15T00:00:00.000Z',
      updatedAt: '2026-06-15T00:00:00.000Z',
      statusIndex: 'queued',
      workflowRunId: queuedJob.workflowRunId,
      stepRunId: queuedJob.stepRunId,
      idempotencyKey: queuedJob.idempotencyKey,
      job: queuedJob,
    })
    const attemptRecord = parseAttemptStorageRecord({
      schemaVersion: 1,
      recordId: 'attempt_record_001',
      storedAt: '2026-06-15T00:00:05.000Z',
      jobId: queuedJob.jobId,
      attemptNumber: failedAttempt.attemptNumber,
      attempt: failedAttempt,
    })
    const deadLetterRecord = parseDeadLetterStorageRecord({
      schemaVersion: 1,
      recordId: 'dead_letter_record_001',
      storedAt: '2026-06-15T00:10:00.000Z',
      workflowRunId: queuedJob.workflowRunId,
      stepRunId: queuedJob.stepRunId,
      replayEligible: true,
      deadLetter,
    })

    expect(jobRecord.statusIndex).toBe(queuedJob.status)
    expect(attemptRecord.jobId).toBe(failedAttempt.jobId)
    expect(deadLetterRecord.replayEligible).toBe(deadLetter.replay.eligible)
  })

  it('rejects repository indexes that drift from the stored runner record', () => {
    expect(() =>
      parseJobStorageRecord({
        schemaVersion: 1,
        recordId: 'job_record_bad_status_001',
        storedAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:00.000Z',
        statusIndex: 'succeeded',
        workflowRunId: queuedJob.workflowRunId,
        stepRunId: queuedJob.stepRunId,
        idempotencyKey: queuedJob.idempotencyKey,
        job: queuedJob,
      }),
    ).toThrow(/status index/i)

    expect(() =>
      parseDeadLetterStorageRecord({
        schemaVersion: 1,
        recordId: 'dead_letter_record_bad_replay_001',
        storedAt: '2026-06-15T00:10:00.000Z',
        workflowRunId: queuedJob.workflowRunId,
        stepRunId: queuedJob.stepRunId,
        replayEligible: false,
        deadLetter,
      }),
    ).toThrow(/replay/i)
  })

  it('stores operational events with workflow and step correlation', () => {
    const externalCall = parseExternalCallRecord({
      schemaVersion: 1,
      externalCallId: 'external_call_001',
      providerId: 'mock-llm',
      operation: 'generate-seo-brief',
      workflowRunId: queuedJob.workflowRunId,
      stepRunId: queuedJob.stepRunId,
      status: 'succeeded',
      idempotencyKey: 'workflow:run_001:step:seo-brief:external:v1',
      timeoutMs: 30000,
      retry: {
        attemptNumber: 1,
        maxAttempts: 3,
      },
      requestSummary: {
        artifactIds: ['artifact_idea_001'],
      },
      responseSummary: {
        outputArtifactId: 'artifact_seo_brief_001',
      },
      startedAt: '2026-06-15T00:00:00.000Z',
      finishedAt: '2026-06-15T00:00:03.000Z',
    })
    const costEvent = parseCostEvent({
      schemaVersion: 1,
      costEventId: 'cost_event_001',
      workflowRunId: queuedJob.workflowRunId,
      stepRunId: queuedJob.stepRunId,
      externalCallId: externalCall.externalCallId,
      providerId: externalCall.providerId,
      operation: externalCall.operation,
      units: {
        inputTokens: 900,
        outputTokens: 300,
      },
      estimatedCostCents: 12,
      actualCostCents: null,
      currency: 'USD',
      recordedAt: '2026-06-15T00:00:03.000Z',
    })
    const auditEvent = parseAuditEvent({
      schemaVersion: 1,
      auditEventId: 'audit_event_001',
      actorId: 'system:runner',
      action: 'external-call.succeeded',
      target: {
        kind: 'external-call',
        id: externalCall.externalCallId,
      },
      correlationId: 'corr_run_001',
      beforeSummary: null,
      afterSummary: {
        status: externalCall.status,
      },
      occurredAt: '2026-06-15T00:00:03.000Z',
    })

    const externalCallRecord = parseOperationalEventStorageRecord({
      schemaVersion: 1,
      recordId: 'operational_event_external_call_001',
      kind: 'external-call',
      workflowRunId: queuedJob.workflowRunId,
      stepRunId: queuedJob.stepRunId,
      occurredAt: externalCall.finishedAt,
      event: externalCall,
    })
    const costRecord = parseOperationalEventStorageRecord({
      schemaVersion: 1,
      recordId: 'operational_event_cost_001',
      kind: 'cost',
      workflowRunId: queuedJob.workflowRunId,
      stepRunId: queuedJob.stepRunId,
      occurredAt: costEvent.recordedAt,
      event: costEvent,
    })
    const auditRecord = parseOperationalEventStorageRecord({
      schemaVersion: 1,
      recordId: 'operational_event_audit_001',
      kind: 'audit',
      workflowRunId: queuedJob.workflowRunId,
      stepRunId: queuedJob.stepRunId,
      occurredAt: auditEvent.occurredAt,
      event: auditEvent,
    })

    expect(externalCallRecord.kind).toBe('external-call')
    expect(costRecord.workflowRunId).toBe(costEvent.workflowRunId)
    expect(auditRecord.stepRunId).toBe(queuedJob.stepRunId)
    expect(auditRecord.occurredAt).toBe(auditEvent.occurredAt)
  })

  it('defines replay queries that are bounded and scoped to a failed workflow', () => {
    const query = parseReplayQuery({
      schemaVersion: 1,
      workflowRunId: queuedJob.workflowRunId,
      stepRunId: queuedJob.stepRunId,
      onlyEligible: true,
      limit: 25,
      cursor: null,
    })

    expect(query.onlyEligible).toBe(true)
    expect(query.limit).toBe(25)
  })

  it('defines restart recovery plans for expired leases without losing retry context', () => {
    const recoveryPlan = parseRunnerRecoveryPlan({
      schemaVersion: 1,
      recoveryPlanId: 'recovery_plan_001',
      generatedAt: '2026-06-15T00:06:00.000Z',
      workerId: 'worker:local:2',
      expiredLeaseCutoff: '2026-06-15T00:05:00.000Z',
      jobsToRequeue: [
        {
          jobId: queuedJob.jobId,
          idempotencyKey: queuedJob.idempotencyKey,
          reason: 'lease expired before attempt finished',
        },
      ],
      jobsToDeadLetter: [],
    })

    expect(recoveryPlan.jobsToRequeue[0]?.idempotencyKey).toBe(queuedJob.idempotencyKey)
    expect(recoveryPlan.jobsToDeadLetter).toHaveLength(0)
  })
})

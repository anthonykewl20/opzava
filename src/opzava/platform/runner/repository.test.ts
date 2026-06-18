import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { parseAuditEvent } from '../audit/contracts'
import { parseCostEvent } from '../costs/contracts'
import { parseExternalCallRecord } from '../providers/contracts'
import { parseAttempt, parseDeadLetter, parseJob, transitionJobStatus, type Job } from './contracts'
import {
  parseAttemptStorageRecord,
  parseDeadLetterStorageRecord,
  parseJobStorageRecord,
  parseOperationalEventStorageRecord,
} from './repository-contracts'
import { createRunnerRepository } from './repository'

describe('Opzava durable runner repository', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function repository() {
    db = new Database(':memory:')
    return createRunnerRepository(db)
  }

  it('creates runner repository tables idempotently', () => {
    const repo = repository()

    repo.ensureSchema()
    repo.ensureSchema()

    const tables = db!.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'opzava_runner_%'
      ORDER BY name
    `).all() as Array<{ name: string }>

    expect(tables.map((table) => table.name)).toEqual([
      'opzava_runner_attempts',
      'opzava_runner_dead_letters',
      'opzava_runner_jobs',
      'opzava_runner_operational_events',
    ])
  })

  it('persists and reads durable job records by idempotency key', () => {
    const repo = repository()
    const job = baseJob()

    repo.saveJob(jobRecord(job))

    const stored = repo.getJobByIdempotencyKey(job.idempotencyKey)

    expect(stored?.job.jobId).toBe(job.jobId)
    expect(stored?.statusIndex).toBe('queued')
    expect(stored?.idempotencyKey).toBe(job.idempotencyKey)
  })

  it('rejects invalid stored job transitions without overwriting the existing record', () => {
    const repo = repository()
    const queued = baseJob()
    const leased = transitionJobStatus(queued, {
      status: 'leased',
      lease: {
        workerId: 'worker:local:1',
        leasedAt: '2026-06-15T00:00:01.000Z',
        expiresAt: '2026-06-15T00:05:01.000Z',
      },
    })
    const succeeded = transitionJobStatus(leased, { status: 'succeeded', lease: null })
    const impossibleLease = parseJob({
      ...succeeded,
      status: 'leased',
      lease: {
        workerId: 'worker:local:2',
        leasedAt: '2026-06-15T00:10:00.000Z',
        expiresAt: '2026-06-15T00:15:00.000Z',
      },
    })

    repo.saveJob(jobRecord(queued))
    repo.saveJob(jobRecord(leased))
    repo.saveJob(jobRecord(succeeded))

    expect(() => repo.saveJob(jobRecord(impossibleLease))).toThrow(/invalid job transition/i)
    expect(repo.getJobById(queued.jobId)?.job.status).toBe('succeeded')
  })

  it('persists attempts, dead letters, and operational events for replay review', () => {
    const repo = repository()
    const job = baseJob()
    const attempt = parseAttempt({
      schemaVersion: 1,
      attemptId: 'attempt_001',
      jobId: job.jobId,
      attemptNumber: 1,
      status: 'failed',
      startedAt: '2026-06-15T00:00:01.000Z',
      finishedAt: '2026-06-15T00:00:05.000Z',
      errorClass: 'timeout',
      retryDecision: {
        action: 'dead-letter',
        reason: 'Retry budget exhausted',
        scheduledAt: null,
      },
    })
    const deadLetter = parseDeadLetter({
      schemaVersion: 1,
      deadLetterId: 'dead_letter_001',
      jobId: job.jobId,
      workflowRunId: job.workflowRunId,
      stepRunId: job.stepRunId,
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
        idempotencyKey: job.idempotencyKey,
        payload: job.payload,
      },
      createdAt: '2026-06-15T00:10:00.000Z',
    })

    repo.saveJob(jobRecord(job))
    repo.appendAttempt(parseAttemptStorageRecord({
      schemaVersion: 1,
      recordId: 'attempt_record_001',
      storedAt: '2026-06-15T00:00:05.000Z',
      jobId: job.jobId,
      attemptNumber: attempt.attemptNumber,
      attempt,
    }))
    repo.appendDeadLetter(parseDeadLetterStorageRecord({
      schemaVersion: 1,
      recordId: 'dead_letter_record_001',
      storedAt: '2026-06-15T00:10:00.000Z',
      workflowRunId: job.workflowRunId,
      stepRunId: job.stepRunId,
      replayEligible: true,
      deadLetter,
    }))
    repo.appendOperationalEvent(externalCallEvent(job))
    repo.appendOperationalEvent(costEvent(job))
    repo.appendOperationalEvent(auditEvent(job))

    const replayable = repo.listReplayableDeadLetters({
      schemaVersion: 1,
      workflowRunId: job.workflowRunId,
      stepRunId: job.stepRunId,
      onlyEligible: true,
      limit: 10,
      cursor: null,
    })
    const events = repo.listOperationalEventsForWorkflowRun(job.workflowRunId)

    expect(replayable).toHaveLength(1)
    expect(replayable[0]?.deadLetter.deadLetterId).toBe(deadLetter.deadLetterId)
    expect(events.map((event) => event.kind)).toEqual(['external-call', 'cost', 'audit'])
  })

  it('plans expired leased jobs for restart-safe recovery without changing storage', () => {
    const repo = repository()
    const queued = baseJob()
    const leased = transitionJobStatus(queued, {
      status: 'leased',
      lease: {
        workerId: 'worker:local:1',
        leasedAt: '2026-06-15T00:00:01.000Z',
        expiresAt: '2026-06-15T00:05:01.000Z',
      },
    })

    repo.saveJob(jobRecord(queued))
    repo.saveJob(jobRecord(leased))

    const plan = repo.planExpiredLeaseRecovery({
      recoveryPlanId: 'recovery_plan_001',
      generatedAt: '2026-06-15T00:06:00.000Z',
      workerId: 'worker:local:2',
      expiredLeaseCutoff: '2026-06-15T00:05:01.000Z',
    })

    expect(plan.jobsToRequeue).toEqual([
      {
        jobId: queued.jobId,
        idempotencyKey: queued.idempotencyKey,
        reason: 'lease expired before attempt finished',
      },
    ])
    expect(repo.getJobById(queued.jobId)?.job.status).toBe('leased')
  })
})

function baseJob(): Job {
  return parseJob({
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
}

function jobRecord(job: Job) {
  return parseJobStorageRecord({
    schemaVersion: 1,
    recordId: `job_record_${job.jobId}`,
    storedAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:00.000Z',
    statusIndex: job.status,
    workflowRunId: job.workflowRunId,
    stepRunId: job.stepRunId,
    idempotencyKey: job.idempotencyKey,
    job,
  })
}

function externalCallEvent(job: Job) {
  const event = parseExternalCallRecord({
    schemaVersion: 1,
    externalCallId: 'external_call_001',
    providerId: 'mock-llm',
    operation: 'generate-seo-brief',
    workflowRunId: job.workflowRunId,
    stepRunId: job.stepRunId,
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

  return parseOperationalEventStorageRecord({
    schemaVersion: 1,
    recordId: 'operational_event_external_call_001',
    kind: 'external-call',
    workflowRunId: job.workflowRunId,
    stepRunId: job.stepRunId,
    occurredAt: event.finishedAt,
    event,
  })
}

function costEvent(job: Job) {
  const event = parseCostEvent({
    schemaVersion: 1,
    costEventId: 'cost_event_001',
    workflowRunId: job.workflowRunId,
    stepRunId: job.stepRunId,
    externalCallId: 'external_call_001',
    providerId: 'mock-llm',
    operation: 'generate-seo-brief',
    units: {
      inputTokens: 900,
      outputTokens: 300,
    },
    estimatedCostCents: 12,
    actualCostCents: null,
    currency: 'USD',
    recordedAt: '2026-06-15T00:00:03.000Z',
  })

  return parseOperationalEventStorageRecord({
    schemaVersion: 1,
    recordId: 'operational_event_cost_001',
    kind: 'cost',
    workflowRunId: job.workflowRunId,
    stepRunId: job.stepRunId,
    occurredAt: event.recordedAt,
    event,
  })
}

function auditEvent(job: Job) {
  const event = parseAuditEvent({
    schemaVersion: 1,
    auditEventId: 'audit_event_001',
    actorId: 'system:runner',
    action: 'external-call.succeeded',
    target: {
      kind: 'external-call',
      id: 'external_call_001',
    },
    correlationId: 'corr_run_001',
    beforeSummary: null,
    afterSummary: {
      status: 'succeeded',
    },
    occurredAt: '2026-06-15T00:00:03.000Z',
  })

  return parseOperationalEventStorageRecord({
    schemaVersion: 1,
    recordId: 'operational_event_audit_001',
    kind: 'audit',
    workflowRunId: job.workflowRunId,
    stepRunId: job.stepRunId,
    occurredAt: event.occurredAt,
    event,
  })
}

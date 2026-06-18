import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { parseJob, transitionJobStatus, type Job } from './contracts'
import { parseJobStorageRecord } from './repository-contracts'
import { createRunnerRepository } from './repository'

describe('Opzava runner expired lease recovery execution', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function repository() {
    db = new Database(':memory:')
    return createRunnerRepository(db)
  }

  it('requeues expired leased jobs and closes their running attempts as retryable timeout failures', () => {
    const repo = repository()
    const expired = baseJob({ jobId: 'job_expired_requeue_001' })
    const fresh = baseJob({ jobId: 'job_fresh_lease_001', priority: 40 })
    repo.saveJob(jobRecord(expired))
    repo.saveJob(jobRecord(fresh))
    repo.leaseNextJobForAttempt({
      workerId: 'worker:old:1',
      attemptId: 'attempt_expired_requeue_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:05:00.000Z',
    })
    repo.leaseNextJobForAttempt({
      workerId: 'worker:fresh:1',
      attemptId: 'attempt_fresh_lease_001',
      leasedAt: '2026-06-15T00:04:00.000Z',
      leaseExpiresAt: '2026-06-15T00:09:00.000Z',
    })

    const result = repo.executeExpiredLeaseRecovery({
      recoveryPlanId: 'recovery_plan_requeue_001',
      generatedAt: '2026-06-15T00:06:00.000Z',
      workerId: 'worker:recovery:1',
      expiredLeaseCutoff: '2026-06-15T00:05:00.000Z',
    })

    expect(result.jobsToRequeue).toEqual([{ jobId: expired.jobId, idempotencyKey: expired.idempotencyKey, reason: 'lease expired before attempt finished' }])
    expect(result.jobsToDeadLetter).toEqual([])
    expect(repo.getJobById(expired.jobId)?.job.status).toBe('queued')
    expect(repo.getJobById(expired.jobId)?.job.lease).toBeNull()
    expect(repo.getJobById(expired.jobId)?.job.scheduledAt).toBe('2026-06-15T00:06:00.000Z')
    expect(repo.getAttemptById('attempt_expired_requeue_001')?.attempt.status).toBe('failed')
    expect(repo.getAttemptById('attempt_expired_requeue_001')?.attempt.errorClass).toBe('timeout')
    expect(repo.getAttemptById('attempt_expired_requeue_001')?.attempt.retryDecision).toEqual({
      action: 'retry',
      reason: 'lease expired before attempt finished',
      scheduledAt: '2026-06-15T00:06:00.000Z',
    })
    expect(auditActions(repo, expired.workflowRunId)).toEqual(['runner.recovery.requeued'])
    expect(repo.getJobById(fresh.jobId)?.job.status).toBe('leased')
    expect(repo.getAttemptById('attempt_fresh_lease_001')?.attempt.status).toBe('running')
  })

  it('dead-letters expired leased jobs that exhausted their attempt budget', () => {
    const repo = repository()
    const exhausted = parseJob({
      ...baseJob({ jobId: 'job_expired_dead_letter_001' }),
      attemptCount: 2,
      maxAttempts: 3,
    })
    repo.saveJob(jobRecord(exhausted))
    repo.leaseNextJobForAttempt({
      workerId: 'worker:old:1',
      attemptId: 'attempt_expired_dead_letter_003',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:05:00.000Z',
    })

    const result = repo.executeExpiredLeaseRecovery({
      recoveryPlanId: 'recovery_plan_dead_letter_001',
      generatedAt: '2026-06-15T00:06:00.000Z',
      workerId: 'worker:recovery:1',
      expiredLeaseCutoff: '2026-06-15T00:05:00.000Z',
    })

    expect(result.jobsToRequeue).toEqual([])
    expect(result.jobsToDeadLetter).toEqual([{ jobId: exhausted.jobId, idempotencyKey: exhausted.idempotencyKey, reason: 'lease expired and retry budget is exhausted' }])
    expect(repo.getJobById(exhausted.jobId)?.job.status).toBe('dead-lettered')
    expect(repo.getJobById(exhausted.jobId)?.job.lease).toBeNull()
    expect(repo.getAttemptById('attempt_expired_dead_letter_003')?.attempt.status).toBe('failed')
    expect(repo.getAttemptById('attempt_expired_dead_letter_003')?.attempt.retryDecision.action).toBe('dead-letter')
    const deadLetters = repo.listReplayableDeadLetters({
      schemaVersion: 1,
      workflowRunId: exhausted.workflowRunId,
      stepRunId: exhausted.stepRunId,
      onlyEligible: true,
      limit: 10,
      cursor: null,
    })
    expect(deadLetters).toHaveLength(1)
    expect(deadLetters[0]?.deadLetter.jobSnapshot.idempotencyKey).toBe(exhausted.idempotencyKey)
    expect(auditActions(repo, exhausted.workflowRunId)).toEqual(['runner.recovery.dead-lettered'])
  })

  it('is idempotent when run again after leases have already been recovered', () => {
    const repo = repository()
    const expired = baseJob({ jobId: 'job_expired_idempotent_001' })
    repo.saveJob(jobRecord(expired))
    repo.leaseNextJobForAttempt({
      workerId: 'worker:old:1',
      attemptId: 'attempt_expired_idempotent_001',
      leasedAt: '2026-06-15T00:01:00.000Z',
      leaseExpiresAt: '2026-06-15T00:05:00.000Z',
    })

    repo.executeExpiredLeaseRecovery({
      recoveryPlanId: 'recovery_plan_idempotent_001',
      generatedAt: '2026-06-15T00:06:00.000Z',
      workerId: 'worker:recovery:1',
      expiredLeaseCutoff: '2026-06-15T00:05:00.000Z',
    })
    const second = repo.executeExpiredLeaseRecovery({
      recoveryPlanId: 'recovery_plan_idempotent_002',
      generatedAt: '2026-06-15T00:07:00.000Z',
      workerId: 'worker:recovery:1',
      expiredLeaseCutoff: '2026-06-15T00:05:00.000Z',
    })

    expect(second.jobsToRequeue).toEqual([])
    expect(second.jobsToDeadLetter).toEqual([])
    expect(repo.getJobById(expired.jobId)?.job.status).toBe('queued')
    expect(repo.getAttemptById('attempt_expired_idempotent_001')?.attempt.finishedAt).toBe('2026-06-15T00:06:00.000Z')
  })

  it('leaves orphaned leased jobs unchanged for manual intervention', () => {
    const repo = repository()
    const queued = baseJob({ jobId: 'job_orphaned_lease_001' })
    const orphanedLease = transitionJobStatus(queued, {
      status: 'leased',
      lease: {
        workerId: 'worker:missing-attempt:1',
        leasedAt: '2026-06-15T00:01:00.000Z',
        expiresAt: '2026-06-15T00:05:00.000Z',
      },
    })

    repo.saveJob(jobRecord(orphanedLease))

    const result = repo.executeExpiredLeaseRecovery({
      recoveryPlanId: 'recovery_plan_orphaned_001',
      generatedAt: '2026-06-15T00:06:00.000Z',
      workerId: 'worker:recovery:1',
      expiredLeaseCutoff: '2026-06-15T00:05:00.000Z',
    })

    expect(result.jobsToRequeue).toEqual([])
    expect(result.jobsToDeadLetter).toEqual([])
    expect(repo.getJobById(orphanedLease.jobId)?.job.status).toBe('leased')
    expect(repo.getJobById(orphanedLease.jobId)?.job.lease?.workerId).toBe('worker:missing-attempt:1')
    expect(auditActions(repo, orphanedLease.workflowRunId)).toEqual(['runner.recovery.orphaned-lease'])
  })
})

function auditActions(repo: ReturnType<typeof createRunnerRepository>, workflowRunId: string): string[] {
  return repo.listOperationalEventsForWorkflowRun(workflowRunId).map((record) => {
    if (record.kind !== 'audit') throw new Error(`unexpected operational event kind: ${record.kind}`)
    return (record.event as { action: string }).action
  })
}

function baseJob(overrides: Partial<Job> = {}): Job {
  return parseJob({
    schemaVersion: 1,
    jobId: 'job_content_seo_brief_001',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_seo_brief_001',
    status: 'queued',
    idempotencyKey: `workflow:run_001:step:${overrides.jobId ?? 'seo-brief'}:v1`,
    payload: {
      inputArtifactIds: ['artifact_idea_001'],
    },
    priority: 50,
    scheduledAt: '2026-06-15T00:00:00.000Z',
    lease: null,
    attemptCount: 0,
    maxAttempts: 3,
    ...overrides,
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

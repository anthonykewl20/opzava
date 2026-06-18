import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { createRunnerRepository } from '@/opzava/platform/runner/repository'
import { runCampaignSendWithRepository } from './run-campaign-send-with-repository'
import type { PlanCampaignRunInput } from './campaign-run-plan'

type NewId = () => string
type Now = () => string

function makeNewId(): NewId {
  let n = 0
  return () => {
    n += 1
    return `id-${n}`
  }
}

const now: Now = () => '2026-07-01T00:00:00.000Z'

function validInput(): PlanCampaignRunInput {
  return {
    campaignId: 'camp-1',
    startAt: '2026-07-01T09:00:00.000Z',
    steps: [
      { stepId: 's1', subject: 'Hi', html: '<p>1</p>', offsetHours: 0 },
      { stepId: 's2', subject: 'Bye', html: '<p>2</p>', offsetHours: 24 },
    ],
    audience: {
      schemaVersion: 1 as const,
      audienceId: 'aud-1',
      name: 'A',
      recipients: ['a@x.com', 'b@x.com'],
      createdAt: '2026-07-01T00:00:00.000Z',
    },
  }
}

function baseDeps() {
  return {
    newId: makeNewId(),
    now,
    workflowRunId: 'wf-1',
    approvalGranted: true,
  }
}

describe('runCampaignSendWithRepository', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
  })

  it('persists every send as a job in the real repository', () => {
    const deps = baseDeps()
    const result = runCampaignSendWithRepository(db, deps, validInput())

    expect(result.enqueued.length).toBe(4)
    expect(result.skipped.length).toBe(0)

    const repo = createRunnerRepository(db)
    for (const job of result.jobs) {
      expect(repo.getJobByIdempotencyKey(job.idempotencyKey)).not.toBeNull()
    }
  })

  it('rolls back and persists nothing when approval is not granted', () => {
    const deps = { ...baseDeps(), approvalGranted: false }
    const input = validInput()

    expect(() => runCampaignSendWithRepository(db, deps, input)).toThrow(/approval not granted/)

    const countRow = db
      .prepare('SELECT COUNT(*) AS c FROM opzava_runner_jobs')
      .get() as { c: number }
    expect(countRow.c).toBe(0)
  })

  it('is exactly-once across re-runs against the same db', () => {
    const first = runCampaignSendWithRepository(db, baseDeps(), validInput())
    expect(first.enqueued.length).toBe(4)
    expect(first.skipped.length).toBe(0)

    const secondDeps = { ...baseDeps(), newId: makeNewId() }
    const second = runCampaignSendWithRepository(db, secondDeps, validInput())
    expect(second.enqueued.length).toBe(0)
    expect(second.skipped.length).toBe(4)
  })
})

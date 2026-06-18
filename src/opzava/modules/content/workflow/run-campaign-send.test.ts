import { describe, it, expect } from 'vitest'
import { runCampaignSend, type RunCampaignSendDeps } from './run-campaign-send'
import type { CampaignSendJobStore } from './enqueue-campaign-send-jobs'
import type { PlanCampaignRunInput } from './campaign-run-plan'
import type { JobStorageRecord } from '@/opzava/platform/runner/repository-contracts'

function makeStore(): { store: CampaignSendJobStore; records: Map<string, JobStorageRecord>; saveCount: { n: number } } {
  const records = new Map<string, JobStorageRecord>()
  const saveCount = { n: 0 }
  const store: CampaignSendJobStore = {
    getJobByIdempotencyKey: (k: string) => records.get(k) ?? null,
    saveJob: (r: JobStorageRecord) => {
      records.set(r.idempotencyKey, r)
      saveCount.n += 1
    },
  }
  return { store, records, saveCount }
}

function makeNewId(): () => string {
  let n = 0
  return () => `id-${++n}`
}

const NOW = '2026-07-01T00:00:00.000Z'

const VALID_INPUT: PlanCampaignRunInput = {
  campaignId: 'camp-1',
  startAt: '2026-07-01T09:00:00.000Z',
  steps: [
    { stepId: 's1', subject: 'Hi', html: '<p>1</p>', offsetHours: 0 },
    { stepId: 's2', subject: 'Bye', html: '<p>2</p>', offsetHours: 24 },
  ],
  audience: {
    schemaVersion: 1 as const,
    audienceId: 'aud-1',
    name: 'Test Audience',
    recipients: ['a@x.com', 'b@x.com'],
    createdAt: '2026-07-01T00:00:00.000Z',
  },
}

describe('runCampaignSend', () => {
  it('plans, builds and enqueues every send once', () => {
    const { store, records, saveCount } = makeStore()
    const newId = makeNewId()
    const deps: RunCampaignSendDeps = {
      store,
      newId,
      now: () => NOW,
      workflowRunId: 'wf-1',
      approvalGranted: true,
    }

    const result = runCampaignSend(deps, VALID_INPUT)

    expect(result.jobs.length).toBe(4)
    expect(result.enqueued.length).toBe(4)
    expect(result.skipped.length).toBe(0)
    expect(records.size).toBe(4)
    expect(saveCount.n).toBe(4)
    expect(result.plan.campaignId).toBe('camp-1')
    for (const id of result.enqueued) {
      expect(typeof id).toBe('string')
      expect(id.length).toBeGreaterThan(0)
    }
  })

  it('refuses to run without granted approval', () => {
    const { store, saveCount } = makeStore()
    const deps: RunCampaignSendDeps = {
      store,
      newId: makeNewId(),
      now: () => NOW,
      workflowRunId: 'wf-1',
      approvalGranted: false,
    }

    expect(() => runCampaignSend(deps, VALID_INPUT)).toThrow(/approval not granted/)
    expect(saveCount.n).toBe(0)
  })

  it('is exactly-once across re-runs', () => {
    const { store, records, saveCount } = makeStore()

    const firstDeps: RunCampaignSendDeps = {
      store,
      newId: makeNewId(),
      now: () => NOW,
      workflowRunId: 'wf-1',
      approvalGranted: true,
    }
    const first = runCampaignSend(firstDeps, VALID_INPUT)
    expect(first.enqueued.length).toBe(4)
    expect(first.skipped.length).toBe(0)
    expect(records.size).toBe(4)
    const saveCountAfterFirst = saveCount.n

    const secondDeps: RunCampaignSendDeps = {
      store,
      newId: makeNewId(),
      now: () => NOW,
      workflowRunId: 'wf-1',
      approvalGranted: true,
    }
    const second = runCampaignSend(secondDeps, VALID_INPUT)

    expect(second.enqueued.length).toBe(0)
    expect(second.skipped.length).toBe(4)
    expect(records.size).toBe(4)
    expect(saveCount.n).toBe(saveCountAfterFirst)
  })
})

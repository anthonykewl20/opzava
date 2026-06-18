import { describe, it, expect } from 'vitest'
import { type Job } from '@/opzava/platform/runner/contracts'
import { type JobStorageRecord } from '@/opzava/platform/runner/repository-contracts'
import {
  enqueueCampaignSendJobs,
  type CampaignSendJobStore,
  type EnqueueCampaignSendJobsDeps,
} from '@/opzava/modules/content/workflow/enqueue-campaign-send-jobs'

type FakeStore = CampaignSendJobStore & {
  records: Map<string, JobStorageRecord>
  saveJobCalls: JobStorageRecord[]
}

function makeFakeStore(): FakeStore {
  const records = new Map<string, JobStorageRecord>()
  const saveJobCalls: JobStorageRecord[] = []
  const store: FakeStore = {
    records,
    saveJobCalls,
    getJobByIdempotencyKey: (idempotencyKey) => {
      for (const record of records.values()) {
        if (record.idempotencyKey === idempotencyKey) {
          return record
        }
      }
      return null
    },
    saveJob: (record) => {
      saveJobCalls.push(record)
      records.set(record.recordId, record)
    },
  }
  return store
}

let idCounter = 0
function makeDeps(store: FakeStore): EnqueueCampaignSendJobsDeps {
  return {
    store,
    newId: () => {
      idCounter += 1
      return `rec-${idCounter}`
    },
    now: () => '2026-07-01T09:00:00.000Z',
  }
}

function makeJob(overrides: Partial<Job> & Pick<Job, 'jobId' | 'idempotencyKey'>): Job {
  return {
    schemaVersion: 1,
    workflowRunId: 'wf-1',
    stepRunId: 'step-1',
    status: 'queued',
    priority: 50,
    scheduledAt: '2026-07-01T09:00:00.000Z',
    lease: null,
    attemptCount: 0,
    maxAttempts: 3,
    payload: {
      to: 'a@x.com',
      subject: 's',
      html: '<p>h</p>',
      sendAt: '2026-07-01T09:00:00.000Z',
    },
    ...overrides,
  }
}

describe('enqueueCampaignSendJobs', () => {
  it('enqueues a fresh job and mirrors job fields into the storage record', () => {
    idCounter = 0
    const store = makeFakeStore()
    const deps = makeDeps(store)
    const job = makeJob({ jobId: 'job-1', idempotencyKey: 'key-1' })

    const result = enqueueCampaignSendJobs([job], deps)

    expect(result.enqueued).toEqual(['job-1'])
    expect(result.skipped).toEqual([])

    expect(store.saveJobCalls).toHaveLength(1)
    const saved = store.saveJobCalls[0]!
    expect(saved.recordId).toBe('rec-1')
    expect(saved.statusIndex).toBe('queued')
    expect(saved.workflowRunId).toBe(job.workflowRunId)
    expect(saved.stepRunId).toBe(job.stepRunId)
    expect(saved.idempotencyKey).toBe(job.idempotencyKey)
    expect(saved.job).toBe(job)
  })

  it('dedupes a job whose idempotency key already exists', () => {
    idCounter = 0
    const store = makeFakeStore()
    const deps = makeDeps(store)

    const preExisting: JobStorageRecord = {
      schemaVersion: 1,
      recordId: 'rec-0',
      storedAt: '2026-07-01T09:00:00.000Z',
      updatedAt: '2026-07-01T09:00:00.000Z',
      statusIndex: 'queued',
      workflowRunId: 'wf-1',
      stepRunId: 'step-1',
      idempotencyKey: 'dup-key',
      job: makeJob({ jobId: 'job-existing', idempotencyKey: 'dup-key' }),
    }
    store.records.set(preExisting.recordId, preExisting)

    const job = makeJob({ jobId: 'job-new', idempotencyKey: 'dup-key' })
    const result = enqueueCampaignSendJobs([job], deps)

    expect(result.skipped).toEqual(['job-new'])
    expect(result.enqueued).toEqual([])
    expect(store.saveJobCalls).toHaveLength(0)
  })

  it('partitions a mixed batch preserving order', () => {
    idCounter = 0
    const store = makeFakeStore()
    const deps = makeDeps(store)

    const preExisting: JobStorageRecord = {
      schemaVersion: 1,
      recordId: 'rec-0',
      storedAt: '2026-07-01T09:00:00.000Z',
      updatedAt: '2026-07-01T09:00:00.000Z',
      statusIndex: 'queued',
      workflowRunId: 'wf-1',
      stepRunId: 'step-1',
      idempotencyKey: 'dup-key',
      job: makeJob({ jobId: 'job-existing', idempotencyKey: 'dup-key' }),
    }
    store.records.set(preExisting.recordId, preExisting)

    const job1 = makeJob({ jobId: 'job-1', idempotencyKey: 'key-1' })
    const job2 = makeJob({ jobId: 'job-2', idempotencyKey: 'dup-key' })

    const result = enqueueCampaignSendJobs([job1, job2], deps)

    expect(result.enqueued).toEqual(['job-1'])
    expect(result.skipped).toEqual(['job-2'])
    expect(store.saveJobCalls).toHaveLength(1)
    expect(store.saveJobCalls[0]!.idempotencyKey).toBe('key-1')
  })
})

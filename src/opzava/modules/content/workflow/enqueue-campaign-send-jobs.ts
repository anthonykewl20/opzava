import { type Job } from '@/opzava/platform/runner/contracts'
import {
  type JobStorageRecord,
  RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
} from '@/opzava/platform/runner/repository-contracts'

export type CampaignSendJobStore = Readonly<{
  getJobByIdempotencyKey: (idempotencyKey: string) => JobStorageRecord | null
  saveJob: (record: JobStorageRecord) => void
}>

export type EnqueueCampaignSendJobsDeps = Readonly<{
  store: CampaignSendJobStore
  newId: () => string
  now: () => string
}>

export type EnqueueCampaignSendJobsResult = Readonly<{
  enqueued: readonly string[]
  skipped: readonly string[]
}>

export function enqueueCampaignSendJobs(
  jobs: readonly Job[],
  deps: EnqueueCampaignSendJobsDeps,
): EnqueueCampaignSendJobsResult {
  const enqueued: string[] = []
  const skipped: string[] = []

  for (const job of jobs) {
    const existing = deps.store.getJobByIdempotencyKey(job.idempotencyKey)
    if (existing !== null) {
      skipped.push(job.jobId)
      continue
    }

    const storedAt = deps.now()
    const record: JobStorageRecord = {
      schemaVersion: RUNNER_REPOSITORY_CONTRACT_SCHEMA_VERSION,
      recordId: deps.newId(),
      storedAt,
      updatedAt: storedAt,
      statusIndex: job.status,
      workflowRunId: job.workflowRunId,
      stepRunId: job.stepRunId,
      idempotencyKey: job.idempotencyKey,
      job,
    }

    deps.store.saveJob(record)
    enqueued.push(job.jobId)
  }

  return Object.freeze({
    enqueued: Object.freeze(enqueued),
    skipped: Object.freeze(skipped),
  })
}

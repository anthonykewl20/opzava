import Database from 'better-sqlite3'

import { createRunnerRepository } from '@/opzava/platform/runner/repository'
import { createRunnerWorker, type RunnerWorker } from '@/opzava/platform/runner/worker'
import { createExponentialRetryPolicy } from '@/opzava/platform/runner/retry-policy'

import { createCampaignSendExecutor } from './campaign-send-executor'
import { createJobKindExecutor } from './job-kind-executor'
import { type CampaignEmailSender } from './email-campaign'

export const CAMPAIGN_SEND_JOB_KIND = 'campaign-send'

export type CampaignRunnerWorkerDeps = Readonly<{
  db: Database.Database
  sender: CampaignEmailSender
  workerId: string
  clock: Readonly<{ now: () => Date }>
  ids: Readonly<{
    attemptId: () => string
    deadLetterId: (input: { jobId: string; attemptId: string }) => string
  }>
  onSent?: (info: Readonly<{ jobId: string; to: string; messageId: string | null }>) => void
  leaseDurationMs?: number
  executionTimeoutMs?: number
}>

export function createCampaignRunnerWorker(deps: CampaignRunnerWorkerDeps): RunnerWorker {
  const repository = createRunnerRepository(deps.db)
  repository.ensureSchema()

  const sendExecutor = createCampaignSendExecutor({
    sender: deps.sender,
    onSent: deps.onSent,
  })

  const executor = createJobKindExecutor({
    resolveKind: () => CAMPAIGN_SEND_JOB_KIND,
    executors: { [CAMPAIGN_SEND_JOB_KIND]: sendExecutor },
  })

  return createRunnerWorker({
    repository,
    executor,
    workerId: deps.workerId,
    leaseDurationMs: deps.leaseDurationMs ?? 5 * 60 * 1000,
    executionTimeoutMs: deps.executionTimeoutMs ?? 30_000,
    retryPolicy: createExponentialRetryPolicy({
      initialDelayMs: 2 * 60_000,
      multiplier: 2,
      maxDelayMs: 10 * 60_000,
    }),
    clock: deps.clock,
    ids: deps.ids,
  })
}

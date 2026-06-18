import type Database from 'better-sqlite3'
import { createRunnerRepository } from '@/opzava/platform/runner/repository'
import { runCampaignSend } from './run-campaign-send'
import type { PlanCampaignRunInput } from './campaign-run-plan'
import type { RunCampaignSendDeps, RunCampaignSendResult } from './run-campaign-send'

export type RunCampaignSendWithRepositoryDeps = Omit<RunCampaignSendDeps, 'store'>

export function runCampaignSendWithRepository(
  db: Database.Database,
  deps: RunCampaignSendWithRepositoryDeps,
  input: PlanCampaignRunInput
): RunCampaignSendResult {
  const repository = createRunnerRepository(db)
  repository.ensureSchema()

  const store = {
    getJobByIdempotencyKey: repository.getJobByIdempotencyKey,
    saveJob: repository.saveJob,
  }

  const txn = db.transaction(() => runCampaignSend({ ...deps, store }, input))
  return txn()
}

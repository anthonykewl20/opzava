import { planCampaignRun, type PlanCampaignRunInput, type CampaignRunPlan } from './campaign-run-plan'
import { buildCampaignSendJobs, type CampaignSendJobsDeps } from './campaign-send-jobs'
import { enqueueCampaignSendJobs, type CampaignSendJobStore, type EnqueueCampaignSendJobsResult } from './enqueue-campaign-send-jobs'
import type { Job } from '@/opzava/platform/runner/contracts'

export type RunCampaignSendDeps = Readonly<{
  store: CampaignSendJobStore
  newId: () => string
  now: () => string
  workflowRunId: string
  approvalGranted: boolean
  maxAttempts?: number
  priority?: number
}>

export type RunCampaignSendResult = Readonly<{
  plan: CampaignRunPlan
  jobs: readonly Job[]
  enqueued: readonly string[]
  skipped: readonly string[]
}>

export function runCampaignSend(deps: RunCampaignSendDeps, input: PlanCampaignRunInput): RunCampaignSendResult {
  const plan = planCampaignRun({ approvalGranted: deps.approvalGranted }, input)
  const jobs = buildCampaignSendJobs(plan, {
    workflowRunId: deps.workflowRunId,
    newId: deps.newId,
    maxAttempts: deps.maxAttempts,
    priority: deps.priority,
  })
  const { enqueued, skipped }: EnqueueCampaignSendJobsResult = enqueueCampaignSendJobs(jobs, {
    store: deps.store,
    newId: deps.newId,
    now: deps.now,
  })
  return Object.freeze({ plan, jobs, enqueued, skipped })
}

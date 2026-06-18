import { parseJob, type Job } from '@/opzava/platform/runner/contracts'
import type { CampaignRunPlan } from './campaign-run-plan'

export type CampaignSendJobsDeps = Readonly<{
  workflowRunId: string
  newId: () => string
  maxAttempts?: number
  priority?: number
}>

export function buildCampaignSendJobs(
  plan: CampaignRunPlan,
  deps: CampaignSendJobsDeps
): readonly Job[] {
  return Object.freeze(
    plan.sends.map((send) =>
      parseJob({
        schemaVersion: 1,
        jobId: deps.newId(),
        workflowRunId: deps.workflowRunId,
        stepRunId: send.stepId,
        status: 'queued',
        idempotencyKey: send.idempotencyKey,
        payload: {
          to: send.to,
          subject: send.subject,
          html: send.html,
          sendAt: send.sendAt
        },
        priority: deps.priority ?? 50,
        scheduledAt: send.sendAt,
        lease: null,
        attemptCount: 0,
        maxAttempts: deps.maxAttempts ?? 3
      })
    )
  )
}

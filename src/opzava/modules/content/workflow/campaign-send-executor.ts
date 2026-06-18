import { RunnerExecutionError, type RunnerExecutor } from '@/opzava/platform/runner/worker'
import { type Job, type Attempt } from '@/opzava/platform/runner/contracts'
import { type CampaignEmailSender, type CampaignEmailMessage } from './email-campaign'

export type CampaignSendExecutorDeps = Readonly<{
  sender: CampaignEmailSender
  onSent?: (info: Readonly<{ jobId: string; to: string; messageId: string | null }>) => void
}>

function isCampaignEmailMessage(value: unknown): value is CampaignEmailMessage {
  if (value === null || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.to === 'string' && typeof v.subject === 'string' && typeof v.html === 'string'
}

export function createCampaignSendExecutor(deps: CampaignSendExecutorDeps): RunnerExecutor {
  return {
    async execute(job: Job, _attempt: Attempt, _signal: AbortSignal): Promise<void> {
      if (!isCampaignEmailMessage(job.payload)) {
        throw new RunnerExecutionError(
          'validation-error',
          `campaign-send job ${job.jobId} has an invalid payload`,
        )
      }
      const message: CampaignEmailMessage = {
        to: job.payload.to,
        subject: job.payload.subject,
        html: job.payload.html,
      }
      const result = await deps.sender(message)
      if (!result.ok) {
        throw new RunnerExecutionError(
          'provider-error',
          `campaign-send job ${job.jobId} failed to send`,
        )
      }
      deps.onSent?.({ jobId: job.jobId, to: message.to, messageId: result.messageId })
    },
  }
}

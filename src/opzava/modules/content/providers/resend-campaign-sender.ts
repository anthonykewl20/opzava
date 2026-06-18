import { parseProviderAdapterRequest, type ProviderAdapter, type ProviderProfile } from '@/opzava/platform/providers/contracts'
import { RESEND_LIVE_OPERATION } from './resend-live-adapter'
import type { CampaignEmailSender } from '../workflow/email-campaign'

export type ResendCampaignSenderDeps = Readonly<{
  adapter: ProviderAdapter
  profile: ProviderProfile
  workflowRunId: string
  stepRunId?: string | null
  newId: () => string
  now: () => string
}>

export function createResendCampaignSender(deps: ResendCampaignSenderDeps): CampaignEmailSender {
  return async (message) => {
    const request = parseProviderAdapterRequest({
      schemaVersion: 1,
      requestId: deps.newId(),
      providerProfile: deps.profile,
      operation: RESEND_LIVE_OPERATION,
      workflowRunId: deps.workflowRunId,
      stepRunId: deps.stepRunId ?? null,
      idempotencyKey: `campaign:${deps.workflowRunId}:${message.to}:${RESEND_LIVE_OPERATION}`,
      timeoutMs: 30000,
      retry: {
        attemptNumber: 1,
        maxAttempts: 3
      },
      input: {
        to: message.to,
        subject: message.subject,
        html: message.html
      },
      requestSummary: {
        to: message.to
      },
      startedAt: deps.now()
    })

    const result = await deps.adapter.execute(request, new AbortController().signal)

    const ok = result.status === 'succeeded'
    const messageId =
      ok && result.output && typeof result.output === 'object' && 'messageId' in result.output
        ? String((result.output as { messageId: unknown }).messageId)
        : null

    return Object.freeze({ ok, messageId })
  }
}

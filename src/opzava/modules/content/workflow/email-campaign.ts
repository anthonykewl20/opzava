import { z } from 'zod'

export const EMAIL_CAMPAIGN_SCHEMA_VERSION = 1 as const

export const emailCampaignSchema = z
  .object({
    schemaVersion: z.literal(EMAIL_CAMPAIGN_SCHEMA_VERSION),
    campaignId: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    recipients: z.array(z.string().email()).min(1),
    steps: z
      .array(
        z
          .object({
            stepId: z.string().min(1).max(120),
            subject: z.string().min(1).max(200),
            html: z.string().min(1).max(100000)
          })
          .strict()
      )
      .min(1),
    createdAt: z.string().min(1)
  })
  .strict()

export type EmailCampaign = Readonly<z.infer<typeof emailCampaignSchema>>

export function parseEmailCampaign(input: unknown): EmailCampaign {
  return Object.freeze(emailCampaignSchema.parse(input))
}

export type CampaignEmailMessage = Readonly<{
  to: string
  subject: string
  html: string
}>

export type CampaignEmailSender = (
  message: CampaignEmailMessage
) => Promise<Readonly<{ ok: boolean; messageId: string | null }>>

export type CampaignSendRecord = Readonly<{
  stepId: string
  to: string
  ok: boolean
  messageId: string | null
}>

export type EmailCampaignRunResult = Readonly<{
  campaignId: string
  status: 'sent' | 'partial'
  records: readonly CampaignSendRecord[]
}>

export type EmailCampaignDeps = Readonly<{
  sender: CampaignEmailSender
  approvalGranted: boolean
}>

export async function runEmailCampaign(
  deps: EmailCampaignDeps,
  campaign: EmailCampaign
): Promise<EmailCampaignRunResult> {
  if (!deps.approvalGranted) {
    throw new Error('email campaign halted: approval not granted, no messages sent')
  }

  const records: CampaignSendRecord[] = []

  for (const step of campaign.steps) {
    for (const to of campaign.recipients) {
      const r = await deps.sender({ to, subject: step.subject, html: step.html })
      records.push(
        Object.freeze({
          stepId: step.stepId,
          to,
          ok: r.ok,
          messageId: r.messageId
        })
      )
    }
  }

  const status: EmailCampaignRunResult['status'] = records.every((x) => x.ok)
    ? 'sent'
    : 'partial'

  return Object.freeze({
    campaignId: campaign.campaignId,
    status,
    records: Object.freeze(records)
  })
}

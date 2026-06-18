import { z } from 'zod'
import { campaignAudienceSchema } from '../workflow/campaign-audience'
import type { CampaignPlanStep } from '../workflow/campaign-run-plan'

export const CAMPAIGN_SCHEMA_VERSION = 1 as const

export const CAMPAIGN_STATUSES = [
  'draft',
  'approved',
  'sending',
  'sent',
  'failed',
] as const

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

const campaignStepSchema = z.object({
  stepId: z.string().min(1).max(120),
  subject: z.string().min(1).max(300),
  html: z.string().min(1),
  offsetHours: z.number().int().min(0),
}) satisfies z.ZodType<CampaignPlanStep>

export const campaignSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_SCHEMA_VERSION),
    campaignId: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    status: z.enum(CAMPAIGN_STATUSES),
    startAt: z.string().min(1),
    steps: z
      .array(campaignStepSchema)
      .min(1)
      .superRefine((steps, ctx) => {
        const seen = new Set<string>()
        steps.forEach((s, i) => {
          if (seen.has(s.stepId)) {
            ctx.addIssue({
              code: 'custom',
              path: [i, 'stepId'],
              message: 'step ids must be unique',
            })
          }
          seen.add(s.stepId)
        })
      }),
    audience: campaignAudienceSchema,
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict()

export type Campaign = Readonly<z.infer<typeof campaignSchema>>

export function parseCampaign(input: unknown): Campaign {
  return Object.freeze(campaignSchema.parse(input))
}

export const CAMPAIGN_TRANSITIONS: Readonly<
  Record<CampaignStatus, readonly CampaignStatus[]>
> = {
  draft: ['approved'],
  approved: ['sending', 'draft'],
  sending: ['sent', 'failed'],
  sent: [],
  failed: ['sending'],
}

export function canTransitionCampaign(
  from: CampaignStatus,
  to: CampaignStatus,
): boolean {
  return CAMPAIGN_TRANSITIONS[from].includes(to)
}

export function transitionCampaign(
  campaign: Campaign,
  to: CampaignStatus,
  updatedAt: string,
): Campaign {
  if (!canTransitionCampaign(campaign.status, to)) {
    throw new Error(
      `illegal campaign transition: ${campaign.status} -> ${to}`,
    )
  }
  return parseCampaign({ ...campaign, status: to, updatedAt })
}

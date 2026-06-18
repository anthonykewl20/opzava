import { z } from 'zod'

export const CAMPAIGN_AUDIENCE_SCHEMA_VERSION = 1 as const

export const campaignAudienceSchema = z
  .object({
    schemaVersion: z.literal(CAMPAIGN_AUDIENCE_SCHEMA_VERSION),
    audienceId: z.string().min(1).max(120),
    name: z.string().min(1).max(200),
    recipients: z.array(z.string().email()).min(1),
    createdAt: z.string().min(1),
  })
  .strict()
  .superRefine((a, ctx) => {
    const lower = a.recipients.map((r) => r.toLowerCase())
    if (new Set(lower).size !== lower.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipients'],
        message: 'audience recipients must be unique (case-insensitive)',
      })
    }
  })

export type CampaignAudience = Readonly<z.infer<typeof campaignAudienceSchema>>

export function parseCampaignAudience(input: unknown): CampaignAudience {
  return Object.freeze(campaignAudienceSchema.parse(input))
}

export function dedupeRecipients(emails: readonly string[]): readonly string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const email of emails) {
    const key = email.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      result.push(email)
    }
  }
  return Object.freeze(result)
}

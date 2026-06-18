import { z } from 'zod'

export const campaignScheduleStepSchema = z.object({
  stepId: z.string().min(1).max(120),
  offsetHours: z.number().int().min(0).max(8760)
}).strict()

export const campaignScheduleInputSchema = z.object({
  startAt: z.string().min(1),
  steps: z.array(campaignScheduleStepSchema).min(1)
}).strict()

export type CampaignScheduleStep = Readonly<z.infer<typeof campaignScheduleStepSchema>>
export type CampaignScheduleInput = Readonly<z.infer<typeof campaignScheduleInputSchema>>
export type ScheduledCampaignStep = Readonly<{ stepId: string; sendAt: string }>

export function computeCampaignSchedule(input: unknown): readonly ScheduledCampaignStep[] {
  const parsed = campaignScheduleInputSchema.parse(input)
  const startMs = new Date(parsed.startAt).getTime()
  if (Number.isNaN(startMs)) {
    throw new Error('campaign schedule startAt is not a valid date')
  }
  const seen = new Set<string>()
  const out = parsed.steps.map((s) => {
    if (seen.has(s.stepId)) {
      throw new Error(`duplicate campaign schedule stepId: ${s.stepId}`)
    }
    seen.add(s.stepId)
    return Object.freeze({
      stepId: s.stepId,
      sendAt: new Date(startMs + s.offsetHours * 3600000).toISOString()
    })
  })
  return Object.freeze(out)
}

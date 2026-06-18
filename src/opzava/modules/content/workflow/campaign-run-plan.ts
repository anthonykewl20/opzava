import { computeCampaignSchedule } from './campaign-schedule'
import type { CampaignAudience } from './campaign-audience'

export type CampaignPlanStep = Readonly<{
  stepId: string
  subject: string
  html: string
  offsetHours: number
}>

export type PlannedCampaignSend = Readonly<{
  stepId: string
  to: string
  subject: string
  html: string
  sendAt: string
  idempotencyKey: string
}>

export type CampaignRunPlan = Readonly<{
  campaignId: string
  sends: readonly PlannedCampaignSend[]
}>

export type PlanCampaignRunInput = Readonly<{
  campaignId: string
  startAt: string
  steps: readonly CampaignPlanStep[]
  audience: CampaignAudience
}>

export function planCampaignRun(
  deps: Readonly<{ approvalGranted: boolean }>,
  input: PlanCampaignRunInput
): CampaignRunPlan {
  if (!deps.approvalGranted) {
    throw new Error('campaign run plan refused: approval not granted')
  }

  const schedule = computeCampaignSchedule({
    startAt: input.startAt,
    steps: input.steps.map((s) => ({ stepId: s.stepId, offsetHours: s.offsetHours })),
  })

  const sendAtByStep = new Map(schedule.map((s) => [s.stepId, s.sendAt]))
  const byId = new Map(input.steps.map((s) => [s.stepId, s]))

  const sends: PlannedCampaignSend[] = []
  for (const sch of schedule) {
    const step = byId.get(sch.stepId)!
    const sendAt = sendAtByStep.get(sch.stepId)!
    for (const to of input.audience.recipients) {
      sends.push(
        Object.freeze({
          stepId: step.stepId,
          to,
          subject: step.subject,
          html: step.html,
          sendAt,
          idempotencyKey: `campaign:${input.campaignId}:${step.stepId}:${to.toLowerCase()}`,
        })
      )
    }
  }

  return Object.freeze({
    campaignId: input.campaignId,
    sends: Object.freeze(sends),
  })
}

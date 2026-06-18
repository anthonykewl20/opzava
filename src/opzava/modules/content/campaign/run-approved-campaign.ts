import Database from 'better-sqlite3'
import { createCampaignRepository } from './campaign-repository'
import { transitionCampaign, type Campaign } from './campaign'
import { runCampaignSendWithRepository } from '../workflow/run-campaign-send-with-repository'
import { createCampaignRunnerWorker } from '../workflow/campaign-runner-worker'
import { type CampaignEmailSender } from '../workflow/email-campaign'

export type RunApprovedCampaignDeps = Readonly<{
  db: Database.Database
  sender: CampaignEmailSender
  newId: () => string
  now: () => string
  workflowRunId: string
  clock: Readonly<{ now: () => Date }>
  ids: Readonly<{ attemptId: () => string; deadLetterId: (input: { jobId: string; attemptId: string }) => string }>
}>

export type RunApprovedCampaignResult = Readonly<{
  status: 'sent' | 'failed'
  campaign: Campaign
  sent: number
  total: number
}>

export async function runApprovedCampaign(
  deps: RunApprovedCampaignDeps,
  input: Readonly<{ campaignId: string }>
): Promise<RunApprovedCampaignResult> {
  const repo = createCampaignRepository(deps.db)
  const campaign = repo.getCampaignById(input.campaignId)
  if (!campaign) throw new Error(`campaign not found: ${input.campaignId}`)
  if (campaign.status !== 'approved') throw new Error(`campaign not approved: ${campaign.status}`)

  const sending = transitionCampaign(campaign, 'sending', deps.now())
  repo.saveCampaign(sending)

  const planInput = {
    campaignId: sending.campaignId,
    startAt: sending.startAt,
    steps: sending.steps,
    audience: sending.audience,
  }
  const enqueue = runCampaignSendWithRepository(
    deps.db,
    { newId: deps.newId, now: deps.now, workflowRunId: deps.workflowRunId, approvalGranted: true },
    planInput
  )
  const total = enqueue.enqueued.length

  const worker = createCampaignRunnerWorker({
    db: deps.db,
    sender: deps.sender,
    workerId: `campaign:${sending.campaignId}`,
    clock: deps.clock,
    ids: deps.ids,
  })

  let sent = 0
  for (let i = 0; i < total + 2; i++) {
    const r = await worker.runNext()
    if (r.status === 'idle') break
    if (r.status === 'succeeded') sent++
  }

  const finalStatus = sent === total && total > 0 ? 'sent' : 'failed'
  const final = transitionCampaign(sending, finalStatus, deps.now())
  repo.saveCampaign(final)
  return { status: finalStatus, campaign: final, sent, total }
}

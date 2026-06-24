import Database from 'better-sqlite3'
import { createApprovalRepository } from '@/opzava/core/approvals/approval-repository'
import { createCampaignRepository } from './campaign-repository'
import { isCampaignSendApproved, campaignSendApprovalId } from './campaign-send-approval'
import { transitionCampaign, type Campaign } from './campaign'
import { runCampaignSendWithRepository } from '../workflow/run-campaign-send-with-repository'
import { createCampaignRunnerWorker } from '../workflow/campaign-runner-worker'
import { type CampaignEmailSender } from '../workflow/email-campaign'
import { type RunnerExecutor } from '@/opzava/platform/runner/worker'

export type RunApprovedCampaignDeps = Readonly<{
  db: Database.Database
  /** Plain sender (legacy/unguarded path). Provide this OR `sendExecutor`. */
  sender?: CampaignEmailSender
  /** F1b guarded executor — when supplied, sends drain through the receipt + exactly-once boundary. */
  sendExecutor?: RunnerExecutor
  newId: () => string
  now: () => string
  workflowRunId: string
  clock: Readonly<{ now: () => Date }>
  ids: Readonly<{ attemptId: () => string; deadLetterId: (input: { jobId: string; attemptId: string }) => string }>
  /** Overrides the per-job retry budget for the enqueued sends. Defaults to the runner's 3. */
  maxAttempts?: number
}>

export type RunApprovedCampaignResult = Readonly<{
  /**
   * - 'sent': every recipient send succeeded inline.
   * - 'failed': at least one send terminally failed (dead-lettered, retry budget exhausted) — no
   *   retry is pending.
   * - 'retrying': one or more sends failed transiently with retry budget remaining; the runner has
   *   re-queued them and a worker daemon must drain the retry window. The campaign is NOT terminal.
   */
  status: 'sent' | 'failed' | 'retrying'
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

  // A live send requires a real, persisted, granted approval — not a hardcoded flag (F1).
  const approval = createApprovalRepository(deps.db).getApprovalById(campaignSendApprovalId(input.campaignId))
  const sendApproved = isCampaignSendApproved(approval, input.campaignId)
  if (!sendApproved) throw new Error(`campaign send approval not granted: ${input.campaignId}`)

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
    {
      newId: deps.newId,
      now: deps.now,
      workflowRunId: deps.workflowRunId,
      approvalGranted: sendApproved,
      ...(deps.maxAttempts !== undefined ? { maxAttempts: deps.maxAttempts } : {}),
    },
    planInput
  )
  const total = enqueue.enqueued.length

  const worker = createCampaignRunnerWorker({
    db: deps.db,
    sender: deps.sender,
    sendExecutor: deps.sendExecutor,
    workerId: `campaign:${sending.campaignId}`,
    clock: deps.clock,
    ids: deps.ids,
  })

  // Drain every job that is leaseable right now. The runner's retry policy re-queues transient
  // failures with a future scheduled_at (minutes out), so they are NOT leaseable on the next
  // iteration — runNext() returns 'idle' and the loop ends. We must not pad the iteration count
  // to absorb retries that structurally cannot fire inline; doing so terminal-marks the campaign
  // 'failed' while a retry job is still queued (RUN-4).
  let sent = 0
  let deadLettered = 0
  let retryScheduled = 0
  // Guard against an unexpected non-idle stream: bound the sweep by the enqueued job count.
  for (let i = 0; i < total; i++) {
    const r = await worker.runNext()
    if (r.status === 'idle') break
    if (r.status === 'succeeded') sent++
    else if (r.status === 'failed-dead-letter') deadLettered++
    else if (r.status === 'failed-retry') retryScheduled++
  }

  const finalStatus: RunApprovedCampaignResult['status'] = resolveCampaignDrainStatus({
    total,
    sent,
    deadLettered,
    retryScheduled,
  })
  const final = transitionCampaign(sending, finalStatus, deps.now())
  repo.saveCampaign(final)
  return { status: finalStatus, campaign: final, sent, total }
}

/**
 * Decides the campaign's post-drain status from the worker outcomes. A terminal 'failed' is only
 * warranted when a send exhausted its retry budget (dead-lettered) or failed without scheduling a
 * retry. A transient failure that scheduled a retry leaves the campaign non-terminal ('retrying')
 * so a worker daemon can drain the retry window — the inline drain cannot wait it out.
 */
function resolveCampaignDrainStatus(input: Readonly<{
  total: number
  sent: number
  deadLettered: number
  retryScheduled: number
}>): RunApprovedCampaignResult['status'] {
  if (input.deadLettered > 0) return 'failed'
  if (input.retryScheduled > 0) return 'retrying'
  return input.sent === input.total && input.total > 0 ? 'sent' : 'failed'
}

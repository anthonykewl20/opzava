import Database from 'better-sqlite3'

import { createRunnerRepository } from '@/opzava/platform/runner/repository'
import { createRunnerWorker, type RunnerWorker, type RunnerExecutor } from '@/opzava/platform/runner/worker'
import { createExponentialRetryPolicy, type ExponentialRetryPolicyOptions } from '@/opzava/platform/runner/retry-policy'

import { createCampaignSendExecutor } from './campaign-send-executor'
import { createJobKindExecutor } from './job-kind-executor'
import { type CampaignEmailSender } from './email-campaign'

export const CAMPAIGN_SEND_JOB_KIND = 'campaign-send'

// The worker needs exactly one campaign-send executor. Either an explicit `sendExecutor` is supplied
// (the guarded path), or a `sender` from which the plain executor is built — at least one is required.
function buildPlainSendExecutor(
  deps: Readonly<{ sender?: CampaignEmailSender; onSent?: (info: { jobId: string; to: string; messageId: string | null }) => void }>,
): RunnerExecutor {
  if (deps.sender === undefined) {
    throw new Error('createCampaignRunnerWorker requires either a sender or a sendExecutor')
  }
  return createCampaignSendExecutor({ sender: deps.sender, onSent: deps.onSent })
}

export type CampaignRunnerWorkerDeps = Readonly<{
  db: Database.Database
  /** The plain (unguarded) sender. Used to build the default executor when `sendExecutor` is absent. */
  sender?: CampaignEmailSender
  /**
   * An explicit campaign-send executor. When supplied it overrides the `sender`-derived one — this is
   * how the route injects F1b's guarded executor (receipts + provider-level exactly-once) so live
   * sends drain through the safety boundary instead of the raw adapter.
   */
  sendExecutor?: RunnerExecutor
  workerId: string
  clock: Readonly<{ now: () => Date }>
  ids: Readonly<{
    attemptId: () => string
    deadLetterId: (input: { jobId: string; attemptId: string }) => string
  }>
  onSent?: (info: Readonly<{ jobId: string; to: string; messageId: string | null }>) => void
  leaseDurationMs?: number
  executionTimeoutMs?: number
  /**
   * Operator-tunable retry policy projected from admin settings
   * (runtime-options.ts `projectRetryPolicyOptions`). When absent the worker falls back to its
   * own safe defaults so callers that do not participate in settings (e.g. the inline campaign
   * drain) keep working. RUN-3: the daemon path must supply the projection rather than rely on
   * these literals.
   */
  retryOptions?: ExponentialRetryPolicyOptions
}>

const DEFAULT_CAMPAIGN_RETRY_OPTIONS: ExponentialRetryPolicyOptions = Object.freeze({
  initialDelayMs: 2 * 60_000,
  multiplier: 2,
  maxDelayMs: 10 * 60_000,
})

export function createCampaignRunnerWorker(deps: CampaignRunnerWorkerDeps): RunnerWorker {
  const repository = createRunnerRepository(deps.db)
  repository.ensureSchema()

  const sendExecutor = deps.sendExecutor ?? buildPlainSendExecutor(deps)

  const executor = createJobKindExecutor({
    resolveKind: () => CAMPAIGN_SEND_JOB_KIND,
    executors: { [CAMPAIGN_SEND_JOB_KIND]: sendExecutor },
  })

  return createRunnerWorker({
    repository,
    executor,
    workerId: deps.workerId,
    leaseDurationMs: deps.leaseDurationMs ?? 5 * 60 * 1000,
    executionTimeoutMs: deps.executionTimeoutMs ?? 30_000,
    retryPolicy: createExponentialRetryPolicy(deps.retryOptions ?? DEFAULT_CAMPAIGN_RETRY_OPTIONS),
    clock: deps.clock,
    ids: deps.ids,
  })
}

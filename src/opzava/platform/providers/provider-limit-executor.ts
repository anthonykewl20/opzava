import { RunnerExecutionError, type RunnerExecutor } from '../runner/worker'
import { type Job, type Attempt } from '../runner/contracts'
import { evaluateProviderLimits, type ProviderUsageSnapshot } from './limit-enforcement'
import { type ProviderLimitsProjection } from '../admin-config/runtime-options'

/**
 * F6b enforcement — a RunnerExecutor decorator that refuses a live provider call when the operator's
 * rate/cost ceilings are already met. It reads the current usage snapshot and the live limits, runs
 * the pure `evaluateProviderLimits` gate, and on a breach throws a `permission-error` (so the job is
 * rejected, not retried into the same wall) instead of delegating to the inner executor. Wrapping the
 * guarded send executor makes the ceilings enforced, not merely settable.
 */

export type ProviderLimitExecutorDeps = Readonly<{
  inner: RunnerExecutor
  loadLimits: () => Promise<ProviderLimitsProjection>
  readUsage: () => ProviderUsageSnapshot
}>

export function createProviderLimitExecutor(deps: ProviderLimitExecutorDeps): RunnerExecutor {
  return {
    async execute(job: Job, attempt: Attempt, signal: AbortSignal): Promise<void> {
      const limits = await deps.loadLimits()
      const decision = evaluateProviderLimits(limits, deps.readUsage())
      if (!decision.ok) {
        throw new RunnerExecutionError(
          'permission-error',
          `provider limit reached (${decision.reason}): observed ${decision.observed} >= limit ${decision.limit}`,
        )
      }
      return deps.inner.execute(job, attempt, signal)
    },
  }
}

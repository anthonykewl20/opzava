import { describe, it, expect, vi } from 'vitest'
import { createProviderLimitExecutor } from './provider-limit-executor'
import { type ProviderUsageSnapshot } from './limit-enforcement'
import { type ProviderLimitsProjection } from '../admin-config/runtime-options'
import { type Job, type Attempt } from '../runner/contracts'
import { type RunnerExecutor } from '../runner/worker'

const LIMITS: ProviderLimitsProjection = { requestsPerMinute: 60, burst: 90, usdPerHourLimit: 100, usdPerDayLimit: 1_000 }
const UNDER: ProviderUsageSnapshot = { requestsInLastMinute: 0, usdSpentThisHour: 0, usdSpentThisDay: 0 }

const job = {} as unknown as Job
const attempt = {} as unknown as Attempt
const signal = new AbortController().signal

function innerExec(): RunnerExecutor {
  return { execute: vi.fn(async () => {}) }
}

describe('createProviderLimitExecutor', () => {
  it('delegates to the inner executor when usage is under every ceiling', async () => {
    const inner = innerExec()
    const decorator = createProviderLimitExecutor({
      inner,
      loadLimits: async () => LIMITS,
      readUsage: () => UNDER,
    })
    await decorator.execute(job, attempt, signal)
    expect(inner.execute).toHaveBeenCalledTimes(1)
    expect(inner.execute).toHaveBeenCalledWith(job, attempt, signal)
  })

  it('rejects with a permission-error and never calls the inner executor on a breach', async () => {
    const inner = innerExec()
    const decorator = createProviderLimitExecutor({
      inner,
      loadLimits: async () => LIMITS,
      readUsage: () => ({ ...UNDER, requestsInLastMinute: 60 }), // at the rate ceiling
    })
    await expect(decorator.execute(job, attempt, signal)).rejects.toMatchObject({
      name: 'RunnerExecutionError',
      errorClass: 'permission-error',
    })
    expect(inner.execute).not.toHaveBeenCalled()
  })

  it('surfaces the breached reason and observed/limit in the error message', async () => {
    const decorator = createProviderLimitExecutor({
      inner: innerExec(),
      loadLimits: async () => LIMITS,
      readUsage: () => ({ ...UNDER, usdSpentThisDay: 1_000 }),
    })
    await expect(decorator.execute(job, attempt, signal)).rejects.toThrow(/daily-budget-exceeded.*1000.*1000/)
  })
})

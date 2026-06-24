type RetryErrorClass = 'timeout' | 'provider-error' | 'validation-error' | 'permission-error' | 'unknown'

export type RetryPolicyInput = Readonly<{
  attemptNumber: number
  failedAt: Date
  errorClass: RetryErrorClass
}>

export type RetryPolicyDecision = Readonly<{
  scheduledAt: Date
  delayMs: number
  reason: string
}>

export type RetryPolicy = Readonly<{
  nextRetry: (input: RetryPolicyInput) => RetryPolicyDecision
}>

export type ExponentialRetryPolicyOptions = Readonly<{
  initialDelayMs: number
  multiplier: number
  maxDelayMs: number
}>

export function createExponentialRetryPolicy(options: ExponentialRetryPolicyOptions): RetryPolicy {
  assertPositiveInteger(options.initialDelayMs, 'initialDelayMs')
  assertPositiveInteger(options.maxDelayMs, 'maxDelayMs')
  if (options.multiplier <= 1 || !Number.isFinite(options.multiplier)) {
    throw new Error('multiplier must be greater than 1')
  }
  if (options.maxDelayMs < options.initialDelayMs) {
    throw new Error('maxDelayMs must be greater than or equal to initialDelayMs')
  }

  return Object.freeze({
    nextRetry(input) {
      if (!Number.isInteger(input.attemptNumber) || input.attemptNumber < 1) {
        throw new Error('attemptNumber must be a positive integer')
      }
      assertValidDate(input.failedAt, 'failedAt')

      const delayMs = calculateCappedDelayMs(options, input.attemptNumber)
      const scheduledAt = new Date(input.failedAt.getTime() + delayMs)
      assertValidDate(scheduledAt, 'scheduledAt')

      return Object.freeze({
        scheduledAt,
        delayMs,
        reason: `${input.errorClass} retry after ${delayMs}ms`,
      })
    },
  })
}

function calculateCappedDelayMs(options: ExponentialRetryPolicyOptions, attemptNumber: number): number {
  const retrySteps = attemptNumber - 1

  let base: number
  if (retrySteps === 0 || options.initialDelayMs >= options.maxDelayMs) {
    base = Math.min(options.initialDelayMs, options.maxDelayMs)
  } else {
    const stepsToCap = Math.ceil(Math.log(options.maxDelayMs / options.initialDelayMs) / Math.log(options.multiplier))
    base = retrySteps >= stepsToCap
      ? options.maxDelayMs
      : Math.min(Math.trunc(options.initialDelayMs * (options.multiplier ** retrySteps)), options.maxDelayMs)
  }

  // Per-call jitter (0..25% of base) de-synchronizes burst failures so a cohort of
  // simultaneous crashes does not retry as a single thundering herd. Capped so the
  // jittered delay never exceeds maxDelayMs.
  const jitterRange = Math.min(Math.trunc(base * 0.25), options.maxDelayMs - base)
  const jitter = Math.floor(Math.random() * (jitterRange + 1))
  return base + jitter
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

function assertValidDate(value: Date, name: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new Error(`${name} must be a valid Date`)
  }
}

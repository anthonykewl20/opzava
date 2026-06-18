import { describe, expect, it } from 'vitest'

import { createExponentialRetryPolicy } from './retry-policy'

describe('Opzava runner retry policy', () => {
  it('schedules exponential retries with a maximum delay cap', () => {
    const policy = createExponentialRetryPolicy({
      initialDelayMs: 60_000,
      multiplier: 2,
      maxDelayMs: 5 * 60_000,
    })
    const failedAt = new Date('2026-06-15T00:00:00.000Z')

    expect(policy.nextRetry({ attemptNumber: 1, failedAt, errorClass: 'provider-error' }).scheduledAt.toISOString()).toBe('2026-06-15T00:01:00.000Z')
    expect(policy.nextRetry({ attemptNumber: 2, failedAt, errorClass: 'provider-error' }).scheduledAt.toISOString()).toBe('2026-06-15T00:02:00.000Z')
    expect(policy.nextRetry({ attemptNumber: 4, failedAt, errorClass: 'provider-error' }).scheduledAt.toISOString()).toBe('2026-06-15T00:05:00.000Z')
  })

  it('rejects invalid retry policy settings instead of silently using unsafe defaults', () => {
    expect(() => createExponentialRetryPolicy({ initialDelayMs: 0, multiplier: 2, maxDelayMs: 60_000 })).toThrow(/initialDelayMs/)
    expect(() => createExponentialRetryPolicy({ initialDelayMs: 60_000, multiplier: 1, maxDelayMs: 60_000 })).toThrow(/multiplier/)
    expect(() => createExponentialRetryPolicy({ initialDelayMs: 60_000, multiplier: Number.POSITIVE_INFINITY, maxDelayMs: 60_000 })).toThrow(/multiplier/)
    expect(() => createExponentialRetryPolicy({ initialDelayMs: 60_000, multiplier: 2, maxDelayMs: 1_000 })).toThrow(/maxDelayMs/)
  })

  it('keeps the exact attempt before the cap distinct from the first capped retry', () => {
    const policy = createExponentialRetryPolicy({
      initialDelayMs: 100,
      multiplier: 2,
      maxDelayMs: 1_000,
    })
    const failedAt = new Date('2026-06-15T00:00:00.000Z')

    expect(policy.nextRetry({ attemptNumber: 4, failedAt, errorClass: 'provider-error' }).delayMs).toBe(800)
    expect(policy.nextRetry({ attemptNumber: 5, failedAt, errorClass: 'provider-error' }).delayMs).toBe(1_000)
  })

  it('keeps exact power-of-multiplier cap boundaries stable', () => {
    const policy = createExponentialRetryPolicy({
      initialDelayMs: 125,
      multiplier: 2,
      maxDelayMs: 1_000,
    })
    const failedAt = new Date('2026-06-15T00:00:00.000Z')

    expect(policy.nextRetry({ attemptNumber: 3, failedAt, errorClass: 'provider-error' }).delayMs).toBe(500)
    expect(policy.nextRetry({ attemptNumber: 4, failedAt, errorClass: 'provider-error' }).delayMs).toBe(1_000)
    expect(policy.nextRetry({ attemptNumber: 5, failedAt, errorClass: 'provider-error' }).delayMs).toBe(1_000)
  })

  it('caps very large attempt numbers without overflowing into unsafe delay values', () => {
    const policy = createExponentialRetryPolicy({
      initialDelayMs: 60_000,
      multiplier: 2,
      maxDelayMs: 5 * 60_000,
    })
    const failedAt = new Date('2026-06-15T00:00:00.000Z')

    const decision = policy.nextRetry({ attemptNumber: 1_000, failedAt, errorClass: 'provider-error' })

    expect(decision.delayMs).toBe(5 * 60_000)
    expect(decision.scheduledAt.toISOString()).toBe('2026-06-15T00:05:00.000Z')
  })

  it('rejects invalid failure timestamps instead of scheduling an invalid retry date', () => {
    const policy = createExponentialRetryPolicy({
      initialDelayMs: 60_000,
      multiplier: 2,
      maxDelayMs: 5 * 60_000,
    })

    expect(() => policy.nextRetry({ attemptNumber: 1, failedAt: new Date(Number.NaN), errorClass: 'unknown' })).toThrow(/failedAt/)
  })

  it('rejects retry decisions that would exceed the JavaScript date range', () => {
    const policy = createExponentialRetryPolicy({
      initialDelayMs: 60_000,
      multiplier: 2,
      maxDelayMs: 60_000,
    })
    const almostMaximumDate = new Date(8_640_000_000_000_000 - 30_000)

    expect(() => policy.nextRetry({ attemptNumber: 1, failedAt: almostMaximumDate, errorClass: 'unknown' })).toThrow(/scheduledAt/)
  })
})

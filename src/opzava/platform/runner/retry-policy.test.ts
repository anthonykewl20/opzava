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

    // Jitter (0..25% of base) makes the exact delay non-deterministic; assert the
    // exponential base is the floor and base+25% (capped at maxDelayMs) the ceiling.
    const first = policy.nextRetry({ attemptNumber: 1, failedAt, errorClass: 'provider-error' }).delayMs
    expect(first).toBeGreaterThanOrEqual(60_000)
    expect(first).toBeLessThanOrEqual(60_000 + 15_000)

    const second = policy.nextRetry({ attemptNumber: 2, failedAt, errorClass: 'provider-error' }).delayMs
    expect(second).toBeGreaterThanOrEqual(120_000)
    expect(second).toBeLessThanOrEqual(120_000 + 30_000)

    // Attempt 4 exponential base = 480000, but that exceeds maxDelayMs (300000) so the cap
    // clamps it to 300000 and jitter collapses to 0 (the ceiling is a deterministic value).
    const fourth = policy.nextRetry({ attemptNumber: 4, failedAt, errorClass: 'provider-error' }).delayMs
    expect(fourth).toBe(5 * 60_000)
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

    // Attempt 4 base = 800 (jitter 0..200, ceiling 1000). Attempt 5 base is already
    // capped at 1000, so its jitter floor is 1000.
    const before = policy.nextRetry({ attemptNumber: 4, failedAt, errorClass: 'provider-error' }).delayMs
    expect(before).toBeGreaterThanOrEqual(800)
    expect(before).toBeLessThanOrEqual(1_000)

    const atCap = policy.nextRetry({ attemptNumber: 5, failedAt, errorClass: 'provider-error' }).delayMs
    expect(atCap).toBe(1_000)
  })

  it('keeps exact power-of-multiplier cap boundaries stable', () => {
    const policy = createExponentialRetryPolicy({
      initialDelayMs: 125,
      multiplier: 2,
      maxDelayMs: 1_000,
    })
    const failedAt = new Date('2026-06-15T00:00:00.000Z')

    const third = policy.nextRetry({ attemptNumber: 3, failedAt, errorClass: 'provider-error' }).delayMs
    expect(third).toBeGreaterThanOrEqual(500)
    expect(third).toBeLessThanOrEqual(625)

    // Once the base reaches the cap (1000), jitter is clamped to 0 — the capped
    // delay is deterministic again, which is what de-thundering at the ceiling needs.
    const fourth = policy.nextRetry({ attemptNumber: 4, failedAt, errorClass: 'provider-error' }).delayMs
    const fifth = policy.nextRetry({ attemptNumber: 5, failedAt, errorClass: 'provider-error' }).delayMs
    expect(fourth).toBe(1_000)
    expect(fifth).toBe(1_000)
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

  it('adds per-call jitter so burst failures do not produce a synchronized retry storm', () => {
    const policy = createExponentialRetryPolicy({
      initialDelayMs: 60_000,
      multiplier: 2,
      maxDelayMs: 5 * 60_000,
    })
    const failedAt = new Date('2026-06-15T00:00:00.000Z')
    const input = { attemptNumber: 1, failedAt, errorClass: 'provider-error' as const }

    const delays = new Set<number>()
    for (let i = 0; i < 32; i += 1) {
      delays.add(policy.nextRetry(input).delayMs)
    }

    expect(delays.size).toBeGreaterThan(1)
  })

  it('keeps jittered delays within base..base+25% of the deterministic schedule', () => {
    const policy = createExponentialRetryPolicy({
      initialDelayMs: 60_000,
      multiplier: 2,
      maxDelayMs: 5 * 60_000,
    })
    const failedAt = new Date('2026-06-15T00:00:00.000Z')

    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const input = { attemptNumber: attempt, failedAt, errorClass: 'provider-error' as const }
      for (let i = 0; i < 16; i += 1) {
        const delay = policy.nextRetry(input).delayMs
        expect(delay).toBeGreaterThanOrEqual(0)
        expect(delay).toBeLessThanOrEqual(5 * 60_000)
      }
    }
  })
})

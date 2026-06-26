import { describe, expect, it } from 'vitest'

import type { AuthoritativeOverride, ConfiguredWindow, UsageSample, WindowSpec } from './contracts'
import { computeUsageView } from './compute'

const NOW = new Date('2026-06-26T12:00:00Z')
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs)
const HOUR = 3_600_000

const sample = (over: Partial<UsageSample> = {}): UsageSample => ({ occurredAt: NOW, tokens: 0, costUsd: 0, ...over })
const win = (windowId: string, spec: WindowSpec, label = windowId): ConfiguredWindow => ({ windowId, label, spec })
const override = (over: Partial<AuthoritativeOverride> = {}): AuthoritativeOverride => ({
  source: 'dispatch-metadata', capturedAt: NOW, vendorLimit: null, vendorRemaining: null, resetAt: null, limitReached: false, ...over,
})

const FIVE_H: WindowSpec = { kind: 'rolling-duration', durationMs: 5 * HOUR, unit: 'requests' }

function view(opts: {
  windows: readonly [ConfiguredWindow, ...ConfiguredWindow[]]
  samples?: readonly UsageSample[]
  overrides?: Record<string, AuthoritativeOverride>
}) {
  return computeUsageView({
    accountProfileId: 'gpt-plus',
    billingMode: 'subscription',
    windows: opts.windows,
    samples: opts.samples ?? [],
    overrides: new Map(Object.entries(opts.overrides ?? {})),
    now: NOW,
  })
}

describe('computeUsageView', () => {
  // AC1
  it('AC1: baseline (no override) → used=fleet, provenance self-tracked, vendor fields null, not limit-reached', () => {
    const v = view({ windows: [win('5h', FIVE_H)], samples: [sample(), sample()] })
    expect(v.windows[0]).toMatchObject({ used: 2, provenance: 'self-tracked', vendorLimit: null, vendorRemaining: null, resetAt: null, limitReached: false })
    expect(v.limitReached).toBe(false)
  })

  // AC2
  it('AC2: rolling-duration counts in-window samples and aggregates by unit', () => {
    const samples = [sample({ occurredAt: at(-1 * HOUR), tokens: 100, costUsd: 0.5 }), sample({ occurredAt: at(-6 * HOUR), tokens: 999, costUsd: 9 })]
    expect(view({ windows: [win('w', { kind: 'rolling-duration', durationMs: 5 * HOUR, unit: 'requests' })], samples }).windows[0].used).toBe(1)
    expect(view({ windows: [win('w', { kind: 'rolling-duration', durationMs: 5 * HOUR, unit: 'tokens' })], samples }).windows[0].used).toBe(100)
    expect(view({ windows: [win('w', { kind: 'rolling-duration', durationMs: 5 * HOUR, unit: 'usd' })], samples }).windows[0].used).toBe(0.5)
  })

  // AC3
  it('AC3: calendar window counts the current period; override.resetAt supersedes the anchor', () => {
    const spec: WindowSpec = { kind: 'calendar', period: 'weekly', unit: 'requests' }
    const samples = [sample({ occurredAt: at(-2 * 24 * HOUR) }), sample({ occurredAt: at(-9 * 24 * HOUR) })] // 2d ago (in), 9d ago (out of a 7d window)
    const v = view({ windows: [win('wk', spec)], samples, overrides: { wk: override({ resetAt: NOW }) } })
    expect(v.windows[0].used).toBe(1) // resetAt=NOW → period started NOW-7d → only the 2d-ago sample counts
  })

  // AC4
  it('AC4: credit-balance aggregates ALL samples (no time filter)', () => {
    const samples = [sample({ occurredAt: at(-100 * 24 * HOUR), costUsd: 3 }), sample({ costUsd: 4 })]
    expect(view({ windows: [win('cb', { kind: 'credit-balance', unit: 'usd' })], samples }).windows[0].used).toBe(7)
  })

  // AC5 — honesty: override attaches vendor numbers, NEVER replaces `used`
  it('AC5: an override attaches vendor numbers but `used` stays the fleet count (never limit−used)', () => {
    const v = view({
      windows: [win('5h', FIVE_H)],
      samples: [sample(), sample(), sample()], // fleet sent 3
      overrides: { '5h': override({ vendorLimit: 40, vendorRemaining: 10 }) },
    })
    const w = v.windows[0]
    expect(w.used).toBe(3) // fleet count — unchanged by the override
    expect(w.provenance).toBe('authoritative')
    expect(w.vendorLimit).toBe(40)
    expect(w.vendorRemaining).toBe(10)
    expect(w.vendorRemaining).not.toBe(w.vendorLimit! - w.used) // 10 ≠ 37 — interactive use is invisible to fleet
  })

  // AC6 — limitReached single-path
  it('AC6: baseline never flips limitReached; only an override does; view rolls up any window', () => {
    expect(view({ windows: [win('5h', FIVE_H)], samples: [sample()] }).limitReached).toBe(false)
    const v = view({ windows: [win('5h', FIVE_H)], samples: [sample()], overrides: { '5h': override({ limitReached: true }) } })
    expect(v.windows[0].limitReached).toBe(true)
    expect(v.limitReached).toBe(true)
  })

  // AC7 — transparent passthrough
  it('AC7: an empty overrides map is byte-identical to baseline-only (all self-tracked)', () => {
    const a = view({ windows: [win('5h', FIVE_H)], samples: [sample()] })
    const b = view({ windows: [win('5h', FIVE_H)], samples: [sample()], overrides: {} })
    expect(a.windows[0]).toEqual(b.windows[0])
    expect(b.windows[0].provenance).toBe('self-tracked')
  })

  // AC8 — no vendor-exact where the vendor exposes none
  it('AC8: an override with vendorLimit=null keeps the limit null (no fabrication); used stays fleet', () => {
    const w = view({ windows: [win('5h', FIVE_H)], samples: [sample(), sample()], overrides: { '5h': override({ vendorLimit: null, resetAt: NOW }) } }).windows[0]
    expect(w.vendorLimit).toBeNull()
    expect(w.used).toBe(2)
    expect(w.provenance).toBe('authoritative')
  })

  // AC9 — billingMode passthrough
  it('AC9: billingMode echoes config (drives display, not arithmetic)', () => {
    const v = computeUsageView({ accountProfileId: 'glm', billingMode: 'token-plan', windows: [win('m', { kind: 'calendar', period: 'monthly', unit: 'tokens' })], samples: [], overrides: new Map(), now: NOW })
    expect(v.billingMode).toBe('token-plan')
  })

  // AC13 — multi-window account (GPT-Plus 5h + weekly), each computed independently
  it('AC13: a multi-window account computes each window independently; view.limitReached = any', () => {
    const v = view({
      windows: [win('5h', FIVE_H), win('wk', { kind: 'calendar', period: 'weekly', unit: 'requests' })],
      samples: [sample()],
      overrides: { wk: override({ limitReached: true }) },
    })
    expect(v.windows.map((w) => w.windowId)).toEqual(['5h', 'wk'])
    expect(v.windows[0].limitReached).toBe(false) // 5h baseline
    expect(v.limitReached).toBe(true) // weekly override flipped it
  })
})

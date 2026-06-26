import { describe, expect, it } from 'vitest'

import type { AuthoritativeOverride, ConfiguredWindow, UsageSample } from '@/opzava/core/usage/contracts'

import { makeUsageReader, type OverlaySource, type UsageAccountConfig } from './reader'

const NOW = new Date('2026-06-26T12:00:00Z')
const FIVE_H_WINDOW: ConfiguredWindow = { windowId: '5h', label: 'Last 5h', spec: { kind: 'rolling-duration', durationMs: 18_000_000, unit: 'requests' } }
const config: UsageAccountConfig = { billingMode: 'subscription', windows: [FIVE_H_WINDOW] }

const overlay = (name: string, result: Record<string, AuthoritativeOverride>): OverlaySource => ({
  name,
  fetch: async () => new Map(Object.entries(result)),
})
const emptyOverlay = (name: string): OverlaySource => ({ name, fetch: async () => new Map() })

const override = (over: Partial<AuthoritativeOverride> = {}): AuthoritativeOverride => ({
  source: 'dispatch-metadata', capturedAt: NOW, vendorLimit: null, vendorRemaining: null, resetAt: null, limitReached: false, ...over,
})

function reader(opts: { overlays: readonly OverlaySource[]; samples?: readonly UsageSample[]; config?: UsageAccountConfig | null }) {
  return makeUsageReader({
    getAccountUsageConfig: () => (opts.config === undefined ? config : opts.config),
    loadSamples: () => opts.samples ?? [],
    overlays: opts.overlays,
    clock: () => NOW,
  })
}

describe('makeUsageReader', () => {
  // AC10 — agnostic overlay seam
  it('AC10: any OverlaySource flows through the same computeUsageView shape (authoritative window)', async () => {
    const codexLike = overlay('codex', { '5h': override({ vendorLimit: 40, limitReached: true }) })
    const balanceLike = emptyOverlay('balance') // returns empty for this (subscription) account
    const v = await reader({ overlays: [codexLike, balanceLike], samples: [{ occurredAt: NOW, tokens: 0, costUsd: 0 }] }).read('gpt-plus')
    expect(v.windows[0]).toMatchObject({ used: 1, provenance: 'authoritative', vendorLimit: 40, limitReached: true })
    expect(v.limitReached).toBe(true)
  })

  it('AC10: with all overlays empty, the account degrades transparently to the self-tracked baseline', async () => {
    const v = await reader({ overlays: [emptyOverlay('a'), emptyOverlay('b')], samples: [{ occurredAt: NOW, tokens: 0, costUsd: 0 }, { occurredAt: NOW, tokens: 0, costUsd: 0 }] }).read('gpt-plus')
    expect(v.windows[0]).toMatchObject({ used: 2, provenance: 'self-tracked', vendorLimit: null, limitReached: false })
  })

  it('merges overlays by windowId — the first non-empty wins', async () => {
    const first = overlay('first', { '5h': override({ vendorLimit: 40 }) })
    const second = overlay('second', { '5h': override({ vendorLimit: 999 }) })
    const v = await reader({ overlays: [first, second], samples: [] }).read('gpt-plus')
    expect(v.windows[0].vendorLimit).toBe(40) // first wins
  })

  it('an unconfigured account returns a safe zero view (never throws)', async () => {
    const v = await reader({ overlays: [], config: null }).read('unknown')
    expect(v.windows).toHaveLength(0)
    expect(v.limitReached).toBe(false)
    expect(v.accountProfileId).toBe('unknown')
  })
})

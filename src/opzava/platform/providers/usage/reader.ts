import type {
  AuthoritativeOverride,
  BillingMode,
  ConfiguredWindow,
  UsageSample,
  UsageView,
} from '@/opzava/core/usage/contracts'
import { computeUsageView } from '@/opzava/core/usage/compute'

/**
 * `UsageReader` (ARD 0026 GP5 / S4) — the impure gatherer for the provider-agnostic usage port. It
 * assembles the (samples, overrides) snapshot per account and delegates to the pure `computeUsageView`.
 */
export interface UsageReader {
  read(accountProfileId: string): Promise<UsageView>
}

/**
 * The agnostic per-provider overlay seam. Returns vendor overrides keyed by `windowId`; EMPTY for an
 * account it doesn't support — so a provider with no overlay degrades transparently to the self-tracked
 * baseline (`computeUsageView`'s passthrough). NEVER probes a subscription: the concrete codex source
 * reads STORED `codex --json` rate-limit events; balance sources hit FREE endpoints (GP4).
 */
export interface OverlaySource {
  readonly name: string
  fetch(
    accountProfileId: string,
    windows: readonly ConfiguredWindow[],
  ): Promise<ReadonlyMap<string, AuthoritativeOverride>>
}

export interface UsageAccountConfig {
  readonly billingMode: BillingMode
  readonly windows: readonly [ConfiguredWindow, ...ConfiguredWindow[]]
}

export interface UsageReaderDeps {
  readonly getAccountUsageConfig: (accountProfileId: string) => UsageAccountConfig | null
  readonly loadSamples: (accountProfileId: string) => readonly UsageSample[] // extends provider-usage-reader (operational-event store)
  readonly overlays: readonly OverlaySource[] // codex-rate-limit (subscription) · balance (token-plan/pay-per-use) · …
  readonly clock: () => Date
  readonly compute?: typeof computeUsageView // injected for testability
}

export function makeUsageReader(deps: UsageReaderDeps): UsageReader {
  const compute = deps.compute ?? computeUsageView
  return {
    read: async (accountProfileId: string): Promise<UsageView> => {
      const config = deps.getAccountUsageConfig(accountProfileId)
      if (!config) {
        // Unconfigured account → a safe zero view (never throws).
        return { accountProfileId, billingMode: 'pay-per-use', windows: [], limitReached: false, asOf: deps.clock() }
      }

      const samples = deps.loadSamples(accountProfileId)

      // Merge overlays by windowId — first non-empty wins (a given account is served by one overlay).
      const overrides = new Map<string, AuthoritativeOverride>()
      for (const overlay of deps.overlays) {
        const partial = await overlay.fetch(accountProfileId, config.windows)
        for (const [windowId, ov] of partial) if (!overrides.has(windowId)) overrides.set(windowId, ov)
      }

      return compute({
        accountProfileId,
        billingMode: config.billingMode,
        windows: config.windows,
        samples,
        overrides,
        now: deps.clock(),
      })
    },
  }
}

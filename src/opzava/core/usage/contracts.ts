/**
 * core/usage contracts (ARD 0026 GP5 / S4) — the provider-agnostic usage view.
 *
 * Pure `core/`: `computeUsageView` aggregates the FLEET's own dispatch samples into the plan's window
 * shapes and folds an optional authoritative overlay. Honesty-model (i): `used` is ALWAYS the fleet
 * count; the vendor's `vendorLimit`/`vendorRemaining`/`resetAt` are SEPARATE, account-total fields,
 * never `vendorLimit − used`. `limitReached` flips only from an authoritative source (single path).
 */

export type UsageUnit = 'requests' | 'tokens' | 'usd' | 'credits'

/** Agnostic window shape — a new plan adds a `WindowSpec` value via config, not a new enum. */
export type WindowSpec =
  | { readonly kind: 'rolling-duration'; readonly durationMs: number; readonly unit: UsageUnit } // e.g. ChatGPT 5h
  | { readonly kind: 'calendar'; readonly period: 'weekly' | 'monthly'; readonly anchor?: number; readonly unit: UsageUnit }
  | { readonly kind: 'credit-balance'; readonly unit: UsageUnit } // prepaid; no time filter

export interface ConfiguredWindow {
  readonly windowId: string // stable, config-assigned — the merge key (no cross-source string guessing)
  readonly label: string
  readonly spec: WindowSpec
}

export type BillingMode = 'subscription' | 'token-plan' | 'pay-per-use'

/** One fleet dispatch event (the self-tracked baseline). */
export interface UsageSample {
  readonly occurredAt: Date
  readonly tokens: number // 0 if the account doesn't meter tokens
  readonly costUsd: number // 0 for flat-rate subscription dispatches
}

/** Vendor enrichment — gathered WITHOUT probing a subscription (rides real dispatches, or a free balance endpoint). */
export interface AuthoritativeOverride {
  readonly source: 'dispatch-metadata' | 'balance-endpoint'
  readonly capturedAt: Date
  readonly vendorLimit: number | null // plan ceiling (account-total); null if the vendor doesn't expose it
  readonly vendorRemaining: number | null // vendor-reported remaining (account-total); null if absent
  readonly resetAt: Date | null
  readonly limitReached: boolean // the hard 429 flip — the ONLY path that may set this true
}

export type UsageProvenance = 'self-tracked' | 'authoritative'

/** HONESTY INVARIANT (model i): `used` is ALWAYS the fleet count; vendor numbers are SEPARATE + account-total. */
export interface UsageWindowView {
  readonly windowId: string
  readonly label: string
  readonly unit: UsageUnit
  readonly used: number // FLEET consumption only — never account-total, never derived from vendor numbers
  readonly provenance: UsageProvenance
  readonly vendorLimit: number | null
  readonly vendorRemaining: number | null
  readonly resetAt: Date | null
  readonly limitReached: boolean
}

export interface UsageView {
  readonly accountProfileId: string
  readonly billingMode: BillingMode
  readonly windows: readonly UsageWindowView[]
  readonly limitReached: boolean // any(windows[*].limitReached)
  readonly asOf: Date
}

export interface ComputeUsageInput {
  readonly accountProfileId: string
  readonly billingMode: BillingMode
  readonly windows: readonly [ConfiguredWindow, ...ConfiguredWindow[]] // ≥1
  readonly samples: readonly UsageSample[] // all fleet samples for the account
  readonly overrides: ReadonlyMap<string, AuthoritativeOverride> // keyed by windowId; absent ⇒ baseline-only
  readonly now: Date
}

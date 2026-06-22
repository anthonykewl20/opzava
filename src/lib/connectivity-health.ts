/**
 * Pure evaluators for the *connectivity* dimension of the health check
 * (`GET /api/status?action=health`). They take already-fetched data and return
 * a health-check entry — no DB, no network — so they are cheap enough to run on
 * the anonymous infra probe and trivially unit-testable.
 *
 * Two surfaces are covered here that the rest of `performHealthCheck` does not:
 *   1. Direct CLI connections (agents connected via `POST /api/connect`).
 *   2. Outbound provider *readiness* (Resend / WordPress) — configured + secret
 *      resolvable. This is deliberately NOT a live network probe: the health
 *      endpoint runs before auth and is hit by orchestrators, so it must never
 *      make billable/slow external calls. A live reachability test stays
 *      on-demand at `POST /api/connections/test`.
 */

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'error' | 'unhealthy'

export type HealthCheckEntry = Readonly<{
  name: string
  status: HealthStatus
  message: string
  detail?: unknown
}>

/**
 * Default staleness window for a direct connection's heartbeat. The recommended
 * client heartbeat interval is 30s (see docs/connect-local-agents.md), so 120s
 * (~4 missed beats) avoids false positives from a single skipped heartbeat.
 */
export const DIRECT_CONNECTION_STALE_SECONDS = 120

export type DirectConnectionRow = Readonly<{
  status: string
  last_heartbeat: number | null
}>

/**
 * Health of the active direct CLI connections.
 *  - no connected rows                          → healthy ("no active direct connections")
 *  - all connected rows have a fresh heartbeat  → healthy
 *  - a connected row is stale or never beat     → warning (registered but went quiet)
 *
 * Only rows with `status === 'connected'` count; disconnected rows are history.
 */
export function evaluateDirectConnectionHealth(
  connections: readonly DirectConnectionRow[],
  nowSec: number,
  staleThresholdSec: number = DIRECT_CONNECTION_STALE_SECONDS,
): HealthCheckEntry {
  const connected = connections.filter((c) => c.status === 'connected')

  if (connected.length === 0) {
    return { name: 'Direct Connections', status: 'healthy', message: 'No active direct connections' }
  }

  const stale = connected.filter(
    (c) => c.last_heartbeat == null || nowSec - c.last_heartbeat > staleThresholdSec,
  )

  if (stale.length === 0) {
    return {
      name: 'Direct Connections',
      status: 'healthy',
      message: `${connected.length} active, all heart-beating`,
      detail: { active: connected.length, stale: 0 },
    }
  }

  return {
    name: 'Direct Connections',
    status: 'warning',
    message: `${stale.length}/${connected.length} direct connection(s) stale (no heartbeat in ${staleThresholdSec}s)`,
    detail: { active: connected.length, stale: stale.length },
  }
}

export type ProviderReadinessInput = Readonly<{
  provider: string
  /** Mirrors a `resolve*Connection` result: `ok:true` ⇒ configured + secret resolvable. */
  ok: boolean
  /** The discriminant reason when `ok` is false (e.g. `from-address-missing`, `secret-unavailable`). */
  reason?: string
}>

type ProviderState = 'ready' | 'unconfigured' | 'misconfigured'

function classifyProvider(p: ProviderReadinessInput): ProviderState {
  if (p.ok) return 'ready'
  // The only "configured but broken" reason the resolvers emit is a missing secret;
  // every other reason (`*-missing`) means the operator simply hasn't set it up.
  return p.reason === 'secret-unavailable' ? 'misconfigured' : 'unconfigured'
}

/**
 * Outbound provider connectivity *readiness* (config + secret resolvable).
 *  - a provider configured but missing its env secret → warning (misconfigured)
 *  - an unconfigured provider                          → healthy (it may be unused)
 *  - everything ready / nothing configured             → healthy
 */
export function evaluateProviderReadiness(
  providers: readonly ProviderReadinessInput[],
): HealthCheckEntry {
  const detail: Record<string, ProviderState> = {}
  const misconfigured: string[] = []
  const ready: string[] = []
  const unconfigured: string[] = []

  for (const p of providers) {
    const state = classifyProvider(p)
    detail[p.provider] = state
    if (state === 'misconfigured') misconfigured.push(p.provider)
    else if (state === 'ready') ready.push(p.provider)
    else unconfigured.push(p.provider)
  }

  const parts: string[] = []
  if (ready.length) parts.push(`ready: ${ready.join(', ')}`)
  if (unconfigured.length) parts.push(`not configured: ${unconfigured.join(', ')}`)
  if (misconfigured.length) parts.push(`secret unavailable: ${misconfigured.join(', ')}`)

  return {
    name: 'Provider Connectivity',
    status: misconfigured.length ? 'warning' : 'healthy',
    message: parts.length ? parts.join(' · ') : 'No providers configured',
    detail,
  }
}

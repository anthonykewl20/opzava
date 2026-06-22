import { createLogShipper, type LogShipper, type LogShipTransport } from './log-shipper'
import { type LogShipEnvelope, type LogShippingConfig } from './log-shipping'

/**
 * The concrete HTTP transport + env assembler for log shipping. Kept apart from the policy/buffer so
 * the network touch is the only thing that lives here. `fetch` is injected so the transport is
 * testable without a real network.
 */

export type FetchLike = (
  url: string,
  init: Readonly<{ method: string; headers: Record<string, string>; body: string }>,
) => Promise<Readonly<{ ok: boolean; status: number }>>

/**
 * POST a batch of envelopes to the aggregator endpoint as JSON. A non-2xx response throws so the
 * shipper's fail-open catch records it (and the app keeps running); the caller never sees it.
 */
export function createHttpLogShipTransport(endpoint: string, fetchImpl: FetchLike): LogShipTransport {
  return async (envelopes: readonly LogShipEnvelope[]): Promise<void> => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ logs: envelopes }),
    })
    if (!response.ok) {
      throw new Error(`log ship failed: ${response.status}`)
    }
  }
}

/**
 * Assemble a ready-to-use shipper from a resolved config. Returns null when shipping is disabled (or
 * has no endpoint) so the logger composition can cheaply skip wiring it.
 */
export function createLogShipperFromConfig(
  config: LogShippingConfig,
  source: string,
  fetchImpl: FetchLike,
  onError?: (error: unknown) => void,
): LogShipper | null {
  if (!config.enabled || config.endpoint === null) {
    return null
  }
  return createLogShipper({
    config,
    source,
    transport: createHttpLogShipTransport(config.endpoint, fetchImpl),
    onError,
  })
}

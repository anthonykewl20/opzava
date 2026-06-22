import {
  buildLogShipEnvelope,
  shouldShipLogRecord,
  type LogShipEnvelope,
  type LogShippingConfig,
} from './log-shipping'

/**
 * The IO half of centralized log shipping: buffer the records the policy selects and flush them to
 * an injected transport in batches. The transport (HTTP POST to the aggregator, a brain heartbeat,
 * …) is injected so this stays testable and the module owns no `fetch`/network of its own.
 *
 * Fail-open is the contract: shipping is observability, not correctness. A transport that throws is
 * swallowed (surfaced via `onError`) so a flaky aggregator can never break the app that is logging.
 */

export type LogShipTransport = (envelopes: readonly LogShipEnvelope[]) => Promise<void>

export type LogShipperDeps = Readonly<{
  config: LogShippingConfig
  source: string
  transport: LogShipTransport
  onError?: (error: unknown) => void
}>

export type LogShipper = Readonly<{
  /** Consider a parsed pino record; returns true if it was buffered for shipping. */
  offer: (record: Readonly<Record<string, unknown>>) => boolean
  /** Ship and clear the buffer. Resolves even if the transport fails (fail-open). */
  flush: () => Promise<void>
  buffered: () => number
}>

export function createLogShipper(deps: LogShipperDeps): LogShipper {
  const buffer: LogShipEnvelope[] = []

  function offer(record: Readonly<Record<string, unknown>>): boolean {
    const envelope = buildLogShipEnvelope(record, deps.source)
    if (!shouldShipLogRecord(deps.config, envelope.level)) {
      return false
    }
    buffer.push(envelope)
    return true
  }

  async function flush(): Promise<void> {
    if (buffer.length === 0) {
      return
    }
    // Drain before awaiting so records offered during the in-flight ship land in a fresh batch
    // (never shipped twice, never lost from this batch).
    const batch = buffer.splice(0, buffer.length)
    try {
      await deps.transport(batch)
    } catch (error) {
      deps.onError?.(error)
    }
  }

  return Object.freeze({ offer, flush, buffered: () => buffer.length })
}

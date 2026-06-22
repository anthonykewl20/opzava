import { Writable } from 'node:stream'
import type { LogShipper } from './log-shipper'

/**
 * Adapts a `LogShipper` into a pino destination stream. pino writes one JSON record per line; each
 * line is parsed and offered to the shipper, then flushed fire-and-forget (the shipper is fail-open,
 * so a flush never throws into the logging pipeline). A non-JSON or unparseable line is ignored
 * rather than allowed to break logging.
 */
export function createLogShipDestination(shipper: LogShipper): Writable {
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback): void {
      try {
        const record = JSON.parse(chunk.toString()) as Record<string, unknown>
        if (shipper.offer(record)) {
          void shipper.flush()
        }
      } catch {
        // Never let a malformed line break the logging stream.
      }
      callback()
    },
  })
}

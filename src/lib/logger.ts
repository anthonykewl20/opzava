import pino from 'pino'
import { resolveLogShippingConfig } from '@/opzava/platform/observability/log-shipping'
import { createLogShipperFromConfig, type FetchLike } from '@/opzava/platform/observability/log-ship-transport'
import { createLogShipDestination } from '@/opzava/platform/observability/log-ship-destination'

function hasPinoPretty(): boolean {
  try {
    require.resolve('pino-pretty')
    return true
  } catch {
    return false
  }
}

const usePretty = process.env.NODE_ENV !== 'production' && hasPinoPretty()
const level = process.env.LOG_LEVEL || 'info'

// Centralized log shipping (aggregation): when LOG_SHIP_ENABLED + LOG_SHIP_ENDPOINT are set, every
// stdout log line is ALSO forwarded to the aggregator. Disabled by default and fail-open, so neither
// the dev (pretty) path nor a missing/flaky aggregator changes existing behavior.
function buildLogger(): pino.Logger {
  if (usePretty) {
    return pino({ level, transport: { target: 'pino-pretty', options: { colorize: true } } })
  }

  const shippingConfig = resolveLogShippingConfig((name) => process.env[name])
  const shipper = createLogShipperFromConfig(
    shippingConfig,
    'opzava',
    globalThis.fetch as unknown as FetchLike,
  )
  if (shipper !== null) {
    return pino(
      { level },
      pino.multistream([
        { stream: process.stdout },
        { stream: createLogShipDestination(shipper) },
      ]),
    )
  }

  return pino({ level })
}

export const logger = buildLogger()

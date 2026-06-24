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

/**
 * Secret-bearing log fields masked at the logger seam. pino redacts the object
 * graph BEFORE serialization, so a single config covers BOTH stdout and the
 * shipped aggregation stream — raw credentials never reach either destination
 * (golden principle: logs must never expose cleartext secrets).
 *
 * Paths use fast-redact bracket/dot syntax. `req.headers.authorization` covers
 * bearer tokens on inbound requests; the wildcards catch credential fields at
 * any nesting depth. `err.message` is included because upstream SDKs (OAuth,
 * provider auth) frequently embed tokens in thrown error text.
 */
export const REDACT_PATHS: readonly string[] = Object.freeze([
  'req.headers.authorization',
  'req.headers.cookie',
  'authorization',
  // Credential fields, both top-level and nested (fast-redact matches one path
  // segment per `*`, so top-level keys must be listed alongside the wildcards).
  'token',
  'apiKey',
  'apikey',
  'secret',
  'password',
  'passwd',
  'accessToken',
  'refreshToken',
  'credentials',
  '*.token',
  '*.apiKey',
  '*.apikey',
  '*.secret',
  '*.password',
  '*.passwd',
  '*.accessToken',
  '*.refreshToken',
  '*.credentials',
  // Provider/OAuth SDKs embed tokens in thrown error text.
  'err.message',
  'error.message',
])

const REDACT_CONFIG = {
  paths: [...REDACT_PATHS],
  censor: '[REDACTED]',
}

// Centralized log shipping (aggregation): when LOG_SHIP_ENABLED + LOG_SHIP_ENDPOINT are set, every
// stdout log line is ALSO forwarded to the aggregator. Disabled by default and fail-open, so neither
// the dev (pretty) path nor a missing/flaky aggregator changes existing behavior.
function buildLogger(): pino.Logger {
  if (usePretty) {
    return pino({
      level,
      redact: REDACT_CONFIG,
      transport: { target: 'pino-pretty', options: { colorize: true } },
    })
  }

  const shippingConfig = resolveLogShippingConfig((name) => process.env[name])
  const shipper = createLogShipperFromConfig(
    shippingConfig,
    'opzava',
    globalThis.fetch as unknown as FetchLike,
  )
  if (shipper !== null) {
    return pino(
      { level, redact: REDACT_CONFIG },
      pino.multistream([
        { stream: process.stdout },
        { stream: createLogShipDestination(shipper) },
      ]),
    )
  }

  return pino({ level, redact: REDACT_CONFIG })
}

export const logger = buildLogger()

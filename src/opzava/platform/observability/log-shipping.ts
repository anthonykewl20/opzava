/**
 * Centralized log shipping (aggregation) — the pure core.
 *
 * The central pino logger writes to stdout; this module decides whether a log record should ALSO be
 * shipped to an external aggregator (one view across runs / a heartbeat to the brain) and builds the
 * structured envelope to send. It owns no IO and no ambient `process.env` access — config is resolved
 * from an injected env reader — so every decision here is deterministic and testable. The endpoint is
 * operator-configured (env), never hard-coded (golden principle).
 *
 * Wiring (the IO half) lives in `log-shipper.ts`; this file is the policy.
 */

export type LogLevelName = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

// pino's numeric level scale; shipping compares on these so it matches what pino writes per record.
export const LOG_LEVEL_VALUES: Readonly<Record<LogLevelName, number>> = Object.freeze({
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
})

const DEFAULT_MIN_LEVEL: LogLevelName = 'info'

export type LogShippingConfig = Readonly<{
  enabled: boolean
  endpoint: string | null
  /** Numeric pino level; a record ships only when its level is at or above this. */
  minLevelValue: number
}>

export type EnvReader = (name: string) => string | undefined

function isTruthyFlag(raw: string | undefined): boolean {
  if (raw === undefined) return false
  const v = raw.trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function resolveMinLevelValue(raw: string | undefined): number {
  const name = (raw ?? '').trim().toLowerCase()
  if (name in LOG_LEVEL_VALUES) {
    return LOG_LEVEL_VALUES[name as LogLevelName]
  }
  return LOG_LEVEL_VALUES[DEFAULT_MIN_LEVEL]
}

/**
 * Resolve shipping config from the environment. Shipping stays OFF unless explicitly enabled AND a
 * non-empty endpoint is provided — a misconfigured deploy fails closed (no shipping), never crashes.
 */
export function resolveLogShippingConfig(readEnv: EnvReader): LogShippingConfig {
  const endpointRaw = readEnv('LOG_SHIP_ENDPOINT')?.trim()
  const endpoint = endpointRaw ? endpointRaw : null
  const enabled = isTruthyFlag(readEnv('LOG_SHIP_ENABLED')) && endpoint !== null
  return Object.freeze({
    enabled,
    endpoint,
    minLevelValue: resolveMinLevelValue(readEnv('LOG_SHIP_MIN_LEVEL')),
  })
}

/** True only when shipping is enabled, an endpoint exists, and the record meets the level floor. */
export function shouldShipLogRecord(config: LogShippingConfig, levelValue: number): boolean {
  return config.enabled && config.endpoint !== null && levelValue >= config.minLevelValue
}

export type LogShipEnvelope = Readonly<{
  source: string
  level: number
  /** Epoch milliseconds, as pino writes it; the aggregator formats for display. */
  time: number
  message: string
  fields: Readonly<Record<string, unknown>>
}>

const ENVELOPE_RESERVED_KEYS = Object.freeze(['level', 'time', 'msg', 'pid', 'hostname'])

/**
 * Build the structured envelope for a parsed pino log record. Reserved pino keys are lifted to typed
 * envelope fields; everything else is preserved under `fields` so structured context survives.
 */
export function buildLogShipEnvelope(
  record: Readonly<Record<string, unknown>>,
  source: string,
): LogShipEnvelope {
  const fields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (!ENVELOPE_RESERVED_KEYS.includes(key)) {
      fields[key] = value
    }
  }
  return Object.freeze({
    source,
    level: typeof record.level === 'number' ? record.level : LOG_LEVEL_VALUES[DEFAULT_MIN_LEVEL],
    time: typeof record.time === 'number' ? record.time : 0,
    message: typeof record.msg === 'string' ? record.msg : '',
    fields: Object.freeze(fields),
  })
}

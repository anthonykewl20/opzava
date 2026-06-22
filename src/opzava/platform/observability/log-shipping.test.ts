import { describe, expect, it } from 'vitest'
import {
  resolveLogShippingConfig,
  shouldShipLogRecord,
  buildLogShipEnvelope,
  LOG_LEVEL_VALUES,
  type LogShippingConfig,
} from './log-shipping'

function env(values: Record<string, string>) {
  return (name: string): string | undefined => values[name]
}

describe('resolveLogShippingConfig', () => {
  it('is disabled and endpoint-less with no env', () => {
    expect(resolveLogShippingConfig(env({}))).toEqual({ enabled: false, endpoint: null, minLevelValue: 30 })
  })

  it('enables only when the flag is truthy AND an endpoint is set', () => {
    expect(resolveLogShippingConfig(env({ LOG_SHIP_ENABLED: '1' })).enabled).toBe(false) // no endpoint
    expect(resolveLogShippingConfig(env({ LOG_SHIP_ENDPOINT: 'https://sink' })).enabled).toBe(false) // not flagged
    const on = resolveLogShippingConfig(env({ LOG_SHIP_ENABLED: 'true', LOG_SHIP_ENDPOINT: 'https://sink' }))
    expect(on).toEqual({ enabled: true, endpoint: 'https://sink', minLevelValue: 30 })
  })

  it('treats an empty/whitespace endpoint as absent (fails closed)', () => {
    const c = resolveLogShippingConfig(env({ LOG_SHIP_ENABLED: '1', LOG_SHIP_ENDPOINT: '   ' }))
    expect(c.endpoint).toBeNull()
    expect(c.enabled).toBe(false)
  })

  it.each(['1', 'true', 'yes', 'on', 'TRUE', ' On '])('accepts truthy flag %s', (flag) => {
    expect(resolveLogShippingConfig(env({ LOG_SHIP_ENABLED: flag, LOG_SHIP_ENDPOINT: 'https://s' })).enabled).toBe(true)
  })

  it.each(['0', 'false', 'no', '', 'maybe'])('rejects non-truthy flag %s', (flag) => {
    expect(resolveLogShippingConfig(env({ LOG_SHIP_ENABLED: flag, LOG_SHIP_ENDPOINT: 'https://s' })).enabled).toBe(false)
  })

  it('maps the min level name to its pino value, defaulting to info', () => {
    expect(resolveLogShippingConfig(env({ LOG_SHIP_MIN_LEVEL: 'warn' })).minLevelValue).toBe(40)
    expect(resolveLogShippingConfig(env({ LOG_SHIP_MIN_LEVEL: 'ERROR' })).minLevelValue).toBe(50)
    expect(resolveLogShippingConfig(env({ LOG_SHIP_MIN_LEVEL: 'bogus' })).minLevelValue).toBe(30) // default info
    expect(resolveLogShippingConfig(env({})).minLevelValue).toBe(30)
    expect(resolveLogShippingConfig(env({ LOG_SHIP_MIN_LEVEL: '  warn  ' })).minLevelValue).toBe(40) // trimmed
  })
})

describe('shouldShipLogRecord', () => {
  const enabled: LogShippingConfig = { enabled: true, endpoint: 'https://sink', minLevelValue: LOG_LEVEL_VALUES.info }

  it('ships at or above the level floor, not below', () => {
    expect(shouldShipLogRecord(enabled, LOG_LEVEL_VALUES.debug)).toBe(false) // 20 < 30
    expect(shouldShipLogRecord(enabled, LOG_LEVEL_VALUES.info)).toBe(true) // 30 >= 30
    expect(shouldShipLogRecord(enabled, LOG_LEVEL_VALUES.error)).toBe(true) // 50 >= 30
  })

  it('never ships when disabled or endpoint-less', () => {
    expect(shouldShipLogRecord({ ...enabled, enabled: false }, LOG_LEVEL_VALUES.error)).toBe(false)
    expect(shouldShipLogRecord({ ...enabled, endpoint: null }, LOG_LEVEL_VALUES.error)).toBe(false)
  })
})

describe('buildLogShipEnvelope', () => {
  it('lifts level/time/msg and preserves structured fields, dropping reserved pino keys', () => {
    const envelope = buildLogShipEnvelope(
      { level: 50, time: 1_700_000_000_000, msg: 'boom', pid: 123, hostname: 'box', workflowRunId: 'run_1', count: 2 },
      'opzava-runner',
    )
    expect(envelope).toEqual({
      source: 'opzava-runner',
      level: 50,
      time: 1_700_000_000_000,
      message: 'boom',
      fields: { workflowRunId: 'run_1', count: 2 },
    })
  })

  it('falls back safely when level/time/msg are missing or malformed', () => {
    const envelope = buildLogShipEnvelope({ foo: 'bar' }, 'src')
    expect(envelope).toEqual({ source: 'src', level: 30, time: 0, message: '', fields: { foo: 'bar' } })
  })
})

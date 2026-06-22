import { describe, expect, it, vi } from 'vitest'
import { createLogShipper, type LogShipTransport } from './log-shipper'
import { LOG_LEVEL_VALUES, type LogShippingConfig } from './log-shipping'

const ENABLED: LogShippingConfig = { enabled: true, endpoint: 'https://sink', minLevelValue: LOG_LEVEL_VALUES.info }

function okTransport(): LogShipTransport {
  return vi.fn(async () => {})
}

function rec(level: number, msg = 'm', extra: Record<string, unknown> = {}) {
  return { level, time: 1_700_000_000_000, msg, ...extra }
}

describe('createLogShipper', () => {
  it('buffers records at/above the level floor and reports them shippable', () => {
    const shipper = createLogShipper({ config: ENABLED, source: 'svc', transport: okTransport() })
    expect(shipper.offer(rec(LOG_LEVEL_VALUES.info))).toBe(true)
    expect(shipper.offer(rec(LOG_LEVEL_VALUES.error))).toBe(true)
    expect(shipper.buffered()).toBe(2)
  })

  it('drops sub-floor records and buffers nothing when disabled', () => {
    const onShipper = createLogShipper({ config: ENABLED, source: 'svc', transport: okTransport() })
    expect(onShipper.offer(rec(LOG_LEVEL_VALUES.debug))).toBe(false)
    expect(onShipper.buffered()).toBe(0)

    const offShipper = createLogShipper({ config: { ...ENABLED, enabled: false }, source: 'svc', transport: okTransport() })
    expect(offShipper.offer(rec(LOG_LEVEL_VALUES.error))).toBe(false)
    expect(offShipper.buffered()).toBe(0)
  })

  it('flushes the buffered envelopes to the transport and clears the buffer', async () => {
    const transport = okTransport()
    const shipper = createLogShipper({ config: ENABLED, source: 'svc', transport })
    shipper.offer(rec(LOG_LEVEL_VALUES.warn, 'careful', { runId: 'r1' }))
    await shipper.flush()

    expect(transport).toHaveBeenCalledTimes(1)
    const batch = (transport as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0] as Array<{ message: string; source: string; fields: Record<string, unknown> }>
    expect(batch).toHaveLength(1)
    expect(batch[0]).toMatchObject({ message: 'careful', source: 'svc', fields: { runId: 'r1' } })
    expect(shipper.buffered()).toBe(0)
  })

  it('does not call the transport when the buffer is empty', async () => {
    const transport = okTransport()
    const shipper = createLogShipper({ config: ENABLED, source: 'svc', transport })
    await shipper.flush()
    expect(transport).not.toHaveBeenCalled()
  })

  it('fails open: a throwing transport is swallowed, surfaced via onError, and the buffer still clears', async () => {
    const onError = vi.fn()
    const transport: LogShipTransport = vi.fn(async () => { throw new Error('sink down') })
    const shipper = createLogShipper({ config: ENABLED, source: 'svc', transport, onError })
    shipper.offer(rec(LOG_LEVEL_VALUES.error))

    await expect(shipper.flush()).resolves.toBeUndefined() // never rejects
    expect(onError).toHaveBeenCalledTimes(1)
    expect(shipper.buffered()).toBe(0) // drained even though the ship failed
  })

  it('fails open even when no onError handler is supplied', async () => {
    const transport: LogShipTransport = vi.fn(async () => { throw new Error('sink down') })
    const shipper = createLogShipper({ config: ENABLED, source: 'svc', transport }) // no onError
    shipper.offer(rec(LOG_LEVEL_VALUES.error))
    await expect(shipper.flush()).resolves.toBeUndefined()
  })
})

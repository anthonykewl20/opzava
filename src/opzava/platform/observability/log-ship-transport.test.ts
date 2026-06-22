import { describe, expect, it, vi } from 'vitest'
import { createHttpLogShipTransport, createLogShipperFromConfig, type FetchLike } from './log-ship-transport'
import { LOG_LEVEL_VALUES, type LogShippingConfig, type LogShipEnvelope } from './log-shipping'

const ENVELOPES: LogShipEnvelope[] = [
  { source: 's', level: 50, time: 1, message: 'boom', fields: { a: 1 } },
]

function okFetch(): FetchLike {
  return vi.fn(async () => ({ ok: true, status: 200 }))
}

describe('createHttpLogShipTransport', () => {
  it('POSTs the envelopes as JSON to the endpoint', async () => {
    const fetchImpl = okFetch()
    await createHttpLogShipTransport('https://sink/logs', fetchImpl)(ENVELOPES)
    expect(fetchImpl).toHaveBeenCalledWith('https://sink/logs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ logs: ENVELOPES }),
    })
  })

  it('throws on a non-ok response (so the shipper records the failure)', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => ({ ok: false, status: 503 }))
    await expect(createHttpLogShipTransport('https://sink', fetchImpl)(ENVELOPES)).rejects.toThrow(/503/)
  })
})

describe('createLogShipperFromConfig', () => {
  const enabled: LogShippingConfig = { enabled: true, endpoint: 'https://sink', minLevelValue: LOG_LEVEL_VALUES.info }

  it('returns null when shipping is disabled or has no endpoint', () => {
    expect(createLogShipperFromConfig({ ...enabled, enabled: false }, 's', okFetch())).toBeNull()
    expect(createLogShipperFromConfig({ ...enabled, endpoint: null }, 's', okFetch())).toBeNull()
  })

  it('builds a working shipper that ships through the HTTP transport when enabled', async () => {
    const fetchImpl = okFetch()
    const shipper = createLogShipperFromConfig(enabled, 'svc', fetchImpl)
    expect(shipper).not.toBeNull()
    shipper!.offer({ level: LOG_LEVEL_VALUES.error, time: 1, msg: 'down', runId: 'r' })
    await shipper!.flush()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createLogShipDestination } from './log-ship-destination'
import type { LogShipper } from './log-shipper'

function fakeShipper(offered = true): LogShipper {
  return {
    offer: vi.fn(() => offered),
    flush: vi.fn(async () => {}),
    buffered: () => 0,
  }
}

function writeLine(stream: ReturnType<typeof createLogShipDestination>, line: string): Promise<void> {
  return new Promise((resolve, reject) => stream.write(line, (err) => (err ? reject(err) : resolve())))
}

describe('createLogShipDestination', () => {
  it('parses a pino JSON line and offers it to the shipper, then flushes', async () => {
    const shipper = fakeShipper(true)
    await writeLine(createLogShipDestination(shipper), JSON.stringify({ level: 50, time: 1, msg: 'boom' }))
    expect(shipper.offer).toHaveBeenCalledWith({ level: 50, time: 1, msg: 'boom' })
    expect(shipper.flush).toHaveBeenCalledTimes(1)
  })

  it('does not flush when the record is not shippable', async () => {
    const shipper = fakeShipper(false)
    await writeLine(createLogShipDestination(shipper), JSON.stringify({ level: 20, time: 1, msg: 'noisy' }))
    expect(shipper.offer).toHaveBeenCalledTimes(1)
    expect(shipper.flush).not.toHaveBeenCalled()
  })

  it('ignores a malformed (non-JSON) line without throwing', async () => {
    const shipper = fakeShipper(true)
    await expect(writeLine(createLogShipDestination(shipper), 'not json{')).resolves.toBeUndefined()
    expect(shipper.offer).not.toHaveBeenCalled()
  })
})

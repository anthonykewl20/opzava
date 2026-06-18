import { describe, it, expect, vi } from 'vitest'
import Database from 'better-sqlite3'
import { createTimerSleep, createStopSignal, runCampaignDaemon } from './campaign-daemon-runtime'

describe('createStopSignal', () => {
  it('starts unset and flips on stop', () => {
    const s = createStopSignal()
    expect(s.shouldStop()).toBe(false)
    s.stop()
    expect(s.shouldStop()).toBe(true)
  })
})

describe('createTimerSleep', () => {
  it('resolves via the injected timer and passes the delay', async () => {
    const fakeTimer = vi.fn((cb: () => void, _ms: number) => {
      cb()
      return 0
    })
    const sleep = createTimerSleep(fakeTimer as any)
    await expect(sleep(250)).resolves.toBeUndefined()
    expect(fakeTimer).toHaveBeenCalledWith(expect.any(Function), 250)
  })
})

describe('runCampaignDaemon', () => {
  it('drains an empty queue to idle then stops', async () => {
    const db = new Database(':memory:')
    const sender = vi.fn(async () => ({ ok: true, messageId: 'm' }))
    let calls = 0
    const shouldStop = () => calls++ >= 2
    const sleep = vi.fn(async () => {})
    let aid = 0
    const report = await runCampaignDaemon({
      db,
      sender,
      workerId: 'w-1',
      clock: { now: () => new Date('2026-07-03T00:00:00.000Z') },
      ids: {
        attemptId: () => `att-${++aid}`,
        deadLetterId: ({ jobId, attemptId }) => `dl-${jobId}-${attemptId}`,
      },
      shouldStop,
      sleep,
      idleDelayMs: 10,
    })
    expect(report.iterations).toBeGreaterThan(0)
    expect(report.processed).toBe(0)
    expect(report.idleSweeps).toBeGreaterThan(0)
    expect(sender).not.toHaveBeenCalled()
    expect(sleep).toHaveBeenCalledWith(10)
  })

  it('does nothing when shouldStop is already true', async () => {
    const sleep = vi.fn(async () => {})
    const report = await runCampaignDaemon({
      db: new Database(':memory:'),
      sender: vi.fn(async () => ({ ok: true, messageId: 'm' })),
      workerId: 'w',
      clock: { now: () => new Date('2026-07-03T00:00:00.000Z') },
      ids: { attemptId: () => 'a', deadLetterId: () => 'd' },
      shouldStop: () => true,
      sleep,
    })
    expect(report).toEqual({ iterations: 0, processed: 0, idleSweeps: 0 })
    expect(sleep).not.toHaveBeenCalled()
  })

  it('uses createTimerSleep by default without throwing when stop is immediate', async () => {
    const report = await runCampaignDaemon({
      db: new Database(':memory:'),
      sender: vi.fn(async () => ({ ok: true, messageId: 'm' })),
      workerId: 'w',
      clock: { now: () => new Date('2026-07-03T00:00:00.000Z') },
      ids: { attemptId: () => 'a', deadLetterId: () => 'd' },
      shouldStop: () => true,
    })
    expect(report.iterations).toBe(0)
  })
})

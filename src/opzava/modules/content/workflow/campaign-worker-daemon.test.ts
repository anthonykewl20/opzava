import { describe, it, expect, vi } from 'vitest'
import { type RunnerWorker } from '@/opzava/platform/runner/worker'
import { createCampaignWorkerDaemon } from './campaign-worker-daemon'

describe('createCampaignWorkerDaemon', () => {
  it('drains queued jobs then idles, sleeping only on idle', async () => {
    const worker = {
      runNext: vi
        .fn()
        .mockResolvedValueOnce({ status: 'succeeded' })
        .mockResolvedValueOnce({ status: 'succeeded' })
        .mockResolvedValue({ status: 'idle' }),
    } as unknown as RunnerWorker
    const sleep = vi.fn().mockResolvedValue(undefined)
    let calls = 0
    const shouldStop = () => calls++ >= 4

    const daemon = createCampaignWorkerDaemon({
      worker,
      sleep,
      shouldStop,
      idleDelayMs: 500,
    })

    const report = await daemon.run()

    expect(report.iterations).toBe(4)
    expect(report.processed).toBe(2)
    expect(report.idleSweeps).toBe(2)
    expect(sleep).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(500)
  })

  it('does not call the worker when shouldStop is already true', async () => {
    const worker = { runNext: vi.fn() } as unknown as RunnerWorker
    const sleep = vi.fn().mockResolvedValue(undefined)
    const shouldStop = () => true

    const daemon = createCampaignWorkerDaemon({ worker, sleep, shouldStop })
    const report = await daemon.run()

    expect(worker.runNext).not.toHaveBeenCalled()
    expect(report.iterations).toBe(0)
    expect(report.processed).toBe(0)
    expect(report.idleSweeps).toBe(0)
  })

  it('counts failed-retry and failed-dead-letter as processed, not idle', async () => {
    const worker = {
      runNext: vi
        .fn()
        .mockResolvedValueOnce({ status: 'failed-retry' })
        .mockResolvedValueOnce({ status: 'failed-dead-letter' }),
    } as unknown as RunnerWorker
    const sleep = vi.fn().mockResolvedValue(undefined)
    let calls = 0
    const shouldStop = () => calls++ >= 2

    const daemon = createCampaignWorkerDaemon({ worker, sleep, shouldStop })
    const report = await daemon.run()

    expect(report.iterations).toBe(2)
    expect(report.processed).toBe(2)
    expect(report.idleSweeps).toBe(0)
    expect(sleep).not.toHaveBeenCalled()
  })

  it('invokes onResult for every runNext', async () => {
    const worker = {
      runNext: vi
        .fn()
        .mockResolvedValueOnce({ status: 'succeeded' })
        .mockResolvedValueOnce({ status: 'idle' }),
    } as unknown as RunnerWorker
    const sleep = vi.fn().mockResolvedValue(undefined)
    const onResult = vi.fn()
    let calls = 0
    const shouldStop = () => calls++ >= 2

    const daemon = createCampaignWorkerDaemon({
      worker,
      sleep,
      shouldStop,
      onResult,
    })

    const report = await daemon.run()

    expect(onResult).toHaveBeenCalledTimes(2)
    expect(onResult).toHaveBeenNthCalledWith(1, { status: 'succeeded' })
    expect(onResult).toHaveBeenNthCalledWith(2, { status: 'idle' })
    expect(report.iterations).toBe(2)
    expect(report.processed).toBe(1)
    expect(report.idleSweeps).toBe(1)
  })
})

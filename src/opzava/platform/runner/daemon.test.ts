import { describe, expect, it, vi } from 'vitest'

import { createRunnerDaemon } from './daemon'
import type { RunnerWorkerResult } from './worker'

describe('Opzava runner daemon loop', () => {
  it('does not poll when shutdown was already requested', async () => {
    const controller = new AbortController()
    const runNext = vi.fn(async () => idle())
    controller.abort()
    const daemon = createRunnerDaemon({
      worker: { runNext },
      signal: controller.signal,
      ...daemonOptions(),
    })

    const result = await daemon.run()

    expect(result.stopped).toBe('signal')
    expect(result.polls).toBe(0)
    expect(runNext).not.toHaveBeenCalled()
  })

  it('backs off after idle polls and stops when shutdown happens during the wait', async () => {
    const controller = new AbortController()
    const runNext = vi.fn(async () => idle())
    const sleep = vi.fn(async () => {
      controller.abort()
    })
    const daemon = createRunnerDaemon({
      worker: { runNext },
      signal: controller.signal,
      sleep,
      ...daemonOptions({ idleDelayMs: 250 }),
    })

    const result = await daemon.run()

    expect(result).toEqual({
      stopped: 'signal',
      polls: 1,
      jobsRun: 0,
      idlePolls: 1,
      errors: 0,
    })
    expect(sleep).toHaveBeenCalledWith(250, controller.signal)
  })

  it('continues immediately after work instead of sleeping between due jobs', async () => {
    const controller = new AbortController()
    const runNext = vi.fn()
      .mockResolvedValueOnce(succeeded())
      .mockResolvedValueOnce(idle())
    const sleep = vi.fn(async () => {
      controller.abort()
    })
    const daemon = createRunnerDaemon({
      worker: { runNext },
      signal: controller.signal,
      sleep,
      ...daemonOptions({ idleDelayMs: 500 }),
    })

    const result = await daemon.run()

    expect(result.polls).toBe(2)
    expect(result.jobsRun).toBe(1)
    expect(result.idlePolls).toBe(1)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(500, controller.signal)
  })

  it('backs off after worker errors instead of tight-looping', async () => {
    const controller = new AbortController()
    const runNext = vi.fn(async () => {
      throw new Error('database is temporarily locked')
    })
    const sleep = vi.fn(async () => {
      controller.abort()
    })
    const daemon = createRunnerDaemon({
      worker: { runNext },
      signal: controller.signal,
      sleep,
      ...daemonOptions({ errorDelayMs: 1_000 }),
    })

    const result = await daemon.run()

    expect(result.errors).toBe(1)
    expect(result.polls).toBe(1)
    expect(sleep).toHaveBeenCalledWith(1_000, controller.signal)
  })

  it('rejects non-positive polling delays', () => {
    const controller = new AbortController()

    expect(() => createRunnerDaemon({
      worker: { runNext: async () => idle() },
      signal: controller.signal,
      ...daemonOptions({ idleDelayMs: 0 }),
    })).toThrow(/idleDelayMs must be a positive integer/)
    expect(() => createRunnerDaemon({
      worker: { runNext: async () => idle() },
      signal: controller.signal,
      ...daemonOptions({ errorDelayMs: 0 }),
    })).toThrow(/errorDelayMs must be a positive integer/)
  })
})

function daemonOptions(overrides: { idleDelayMs?: number, errorDelayMs?: number } = {}) {
  return {
    idleDelayMs: overrides.idleDelayMs ?? 100,
    errorDelayMs: overrides.errorDelayMs ?? 500,
  }
}

function idle(): RunnerWorkerResult {
  return Object.freeze({ status: 'idle' })
}

function succeeded(): RunnerWorkerResult {
  return Object.freeze({
    status: 'succeeded',
    jobId: 'job_daemon_success_001',
    attemptId: 'attempt_daemon_success_001',
  })
}

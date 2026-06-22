import { describe, expect, it, vi } from 'vitest'

import type { RuntimeSettingsLoader } from '../admin-config/runtime-loader'
import type { OpzavaRuntimeOptionsProjection } from '../admin-config/runtime-options'
import { createRuntimeRunnerDaemon } from './daemon-runtime'
import type { RunnerDaemon } from './daemon'
import type { RunnerWorker } from './worker'

describe('Opzava runtime runner daemon construction', () => {
  it('returns unavailable without constructing or polling when settings are missing', async () => {
    const loader = fakeLoader({
      ok: false,
      error: {
        kind: 'unavailable',
        reason: 'not_persisted',
      },
    })
    const worker = fakeWorker()
    const createDaemon = vi.fn(() => fakeDaemon())

    const result = await createRuntimeRunnerDaemon({
      loader,
      worker,
      signal: new AbortController().signal,
      createDaemon,
    })

    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'unavailable',
        reason: 'not_persisted',
      },
    })
    expect(loader.loadRuntimeSettings).toHaveBeenCalledTimes(1)
    expect(createDaemon).not.toHaveBeenCalled()
    expect(worker.runNext).not.toHaveBeenCalled()
  })

  it('constructs a daemon from persisted runner runtime options', async () => {
    const runtimeOptions = fakeRuntimeOptions({
      runner: {
        idleDelayMs: 321,
        errorDelayMs: 654,
      },
    })
    const loader = fakeLoader({
      ok: true,
      value: {
        version: 4,
        updatedAt: '2026-06-15T00:00:00.000Z',
        updatedBy: 'admin:1',
        options: runtimeOptions,
      },
    })
    const worker = fakeWorker()
    const signal = new AbortController().signal
    const daemon = fakeDaemon()
    const createDaemon = vi.fn(() => daemon)

    const result = await createRuntimeRunnerDaemon({
      loader,
      worker,
      signal,
      createDaemon,
    })

    expect(result).toEqual({ ok: true, value: daemon })
    expect(loader.loadRuntimeSettings).toHaveBeenCalledTimes(1)
    expect(createDaemon).toHaveBeenCalledTimes(1)
    expect(createDaemon).toHaveBeenCalledWith({
      worker,
      signal,
      idleDelayMs: 321,
      errorDelayMs: 654,
    })
    expect(worker.runNext).not.toHaveBeenCalled()
  })
})

function fakeLoader(result: Awaited<ReturnType<RuntimeSettingsLoader['loadRuntimeSettings']>>): RuntimeSettingsLoader {
  return {
    loadRuntimeSettings: vi.fn(async () => result),
  }
}

function fakeWorker(): RunnerWorker {
  return {
    runNext: vi.fn(async () => ({ status: 'idle' as const })),
  }
}

function fakeDaemon(): RunnerDaemon {
  return {
    run: vi.fn(async () => ({
      stopped: 'max-polls' as const,
      polls: 0,
      jobsRun: 0,
      idlePolls: 0,
      errors: 0,
    })),
  }
}

function fakeRuntimeOptions(
  overrides: Partial<OpzavaRuntimeOptionsProjection> = {},
): OpzavaRuntimeOptionsProjection {
  return {
    runner: {
      idleDelayMs: 100,
      errorDelayMs: 500,
    },
    retry: {
      initialDelayMs: 1_000,
      multiplier: 2,
      maxDelayMs: 60_000,
    },
    limits: { requestsPerMinute: 60, burst: 90, usdPerHourLimit: 100, usdPerDayLimit: 1_000 },
    provider: {
      timeoutMs: 30_000,
      retry: {
        maxAttempts: 3,
      },
    },
    ...overrides,
  }
}

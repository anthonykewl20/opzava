import { describe, expect, it } from 'vitest'

import { createExponentialRetryPolicy } from '../runner/retry-policy'
import { createRunnerDaemon } from '../runner/daemon'
import { defaultOpzavaAdminSettings, parseOpzavaAdminSettings } from './settings'
import {
  projectProviderAdapterDefaults,
  projectRetryPolicyOptions,
  projectRunnerDaemonOptions,
  projectRuntimeOptions,
} from './runtime-options'

describe('Opzava admin settings runtime option projections', () => {
  it('projects only runner daemon options consumed by the runner loop', () => {
    const settings = parseOpzavaAdminSettings({
      ...defaultOpzavaAdminSettings(),
      runner: {
        idleDelayMs: 2_500,
        errorDelayMs: 7_500,
        shutdownGraceMs: 12_000,
      },
    })

    expect(projectRunnerDaemonOptions(settings)).toEqual({
      idleDelayMs: 2_500,
      errorDelayMs: 7_500,
    })
  })

  it('projects retry policy options without leaking maxAttempts into policy construction', () => {
    const settings = parseOpzavaAdminSettings({
      ...defaultOpzavaAdminSettings(),
      retry: {
        initialDelayMs: 15_000,
        multiplier: 3,
        maxDelayMs: 120_000,
        maxAttempts: 5,
      },
    })

    expect(projectRetryPolicyOptions(settings)).toEqual({
      initialDelayMs: 15_000,
      multiplier: 3,
      maxDelayMs: 120_000,
    })
  })

  it('projects provider adapter defaults used by provider request construction', () => {
    const settings = parseOpzavaAdminSettings({
      ...defaultOpzavaAdminSettings(),
      providers: {
        ...defaultOpzavaAdminSettings().providers,
        requestTimeoutMs: 45_000,
      },
      retry: {
        ...defaultOpzavaAdminSettings().retry,
        maxAttempts: 4,
      },
    })

    const defaults = projectProviderAdapterDefaults(settings)

    expect(defaults).toEqual({
      timeoutMs: 45_000,
      retry: {
        maxAttempts: 4,
      },
    })
    expect(Object.keys(defaults)).toEqual(['timeoutMs', 'retry'])
    expect(Object.keys(defaults.retry)).toEqual(['maxAttempts'])
  })

  it('projects a stable composed runtime options shape without mutating settings', () => {
    const settings = defaultOpzavaAdminSettings()
    const before = JSON.stringify(settings)

    expect(projectRuntimeOptions(settings)).toEqual({
      runner: projectRunnerDaemonOptions(settings),
      retry: projectRetryPolicyOptions(settings),
      provider: projectProviderAdapterDefaults(settings),
    })
    expect(Object.keys(projectRuntimeOptions(settings))).toEqual(['runner', 'retry', 'provider'])
    expect(JSON.stringify(settings)).toBe(before)
  })

  it('produces options accepted by existing runner and retry constructors', () => {
    const settings = defaultOpzavaAdminSettings()
    const runtime = projectRuntimeOptions(settings)
    const controller = new AbortController()

    expect(() => createRunnerDaemon({
      worker: { runNext: async () => ({ status: 'idle' }) },
      signal: controller.signal,
      ...runtime.runner,
    })).not.toThrow()
    expect(() => createExponentialRetryPolicy(runtime.retry)).not.toThrow()
  })
})

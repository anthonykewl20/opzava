import type { ExponentialRetryPolicyOptions } from '../runner/retry-policy'
import type { OpzavaAdminSettings } from './settings'

export type RunnerDaemonSettingsProjection = Readonly<{
  idleDelayMs: number
  errorDelayMs: number
}>

export type ProviderAdapterDefaultsProjection = Readonly<{
  timeoutMs: number
  retry: Readonly<{
    maxAttempts: number
  }>
}>

export type OpzavaRuntimeOptionsProjection = Readonly<{
  runner: RunnerDaemonSettingsProjection
  retry: ExponentialRetryPolicyOptions
  provider: ProviderAdapterDefaultsProjection
}>

export function projectRunnerDaemonOptions(settings: OpzavaAdminSettings): RunnerDaemonSettingsProjection {
  return Object.freeze({
    idleDelayMs: settings.runner.idleDelayMs,
    errorDelayMs: settings.runner.errorDelayMs,
  })
}

export function projectRetryPolicyOptions(settings: OpzavaAdminSettings): ExponentialRetryPolicyOptions {
  return Object.freeze({
    initialDelayMs: settings.retry.initialDelayMs,
    multiplier: settings.retry.multiplier,
    maxDelayMs: settings.retry.maxDelayMs,
  })
}

export function projectProviderAdapterDefaults(settings: OpzavaAdminSettings): ProviderAdapterDefaultsProjection {
  return Object.freeze({
    timeoutMs: settings.providers.requestTimeoutMs,
    retry: Object.freeze({
      maxAttempts: settings.retry.maxAttempts,
    }),
  })
}

export function projectRuntimeOptions(settings: OpzavaAdminSettings): OpzavaRuntimeOptionsProjection {
  return Object.freeze({
    runner: projectRunnerDaemonOptions(settings),
    retry: projectRetryPolicyOptions(settings),
    provider: projectProviderAdapterDefaults(settings),
  })
}

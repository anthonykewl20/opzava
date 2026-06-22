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

// Operator-tunable rate/cost ceilings projected for the provider-execution layer (F6b). `burst` is
// the token-bucket capacity used by the sub-minute rate limiter (composition layer); the per-minute,
// hourly, and daily ceilings are enforced by `evaluateProviderLimits`.
export type ProviderLimitsProjection = Readonly<{
  requestsPerMinute: number
  burst: number
  usdPerHourLimit: number
  usdPerDayLimit: number
}>

export type OpzavaRuntimeOptionsProjection = Readonly<{
  runner: RunnerDaemonSettingsProjection
  retry: ExponentialRetryPolicyOptions
  provider: ProviderAdapterDefaultsProjection
  limits: ProviderLimitsProjection
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

export function projectProviderLimits(settings: OpzavaAdminSettings): ProviderLimitsProjection {
  return Object.freeze({
    requestsPerMinute: settings.providers.requestsPerMinute,
    burst: settings.providers.burst,
    usdPerHourLimit: settings.providers.usdPerHourLimit,
    usdPerDayLimit: settings.providers.usdPerDayLimit,
  })
}

export function projectRuntimeOptions(settings: OpzavaAdminSettings): OpzavaRuntimeOptionsProjection {
  return Object.freeze({
    runner: projectRunnerDaemonOptions(settings),
    retry: projectRetryPolicyOptions(settings),
    provider: projectProviderAdapterDefaults(settings),
    limits: projectProviderLimits(settings),
  })
}

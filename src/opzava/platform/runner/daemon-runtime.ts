import type { RuntimeSettingsLoader, RuntimeSettingsUnavailable } from '../admin-config/runtime-loader'
import { createRunnerDaemon, type RunnerDaemon, type RunnerDaemonOptions } from './daemon'
import type { RunnerWorker } from './worker'

export type RuntimeRunnerDaemonCreateResult =
  | Readonly<{ ok: true, value: RunnerDaemon }>
  | Readonly<{ ok: false, error: RuntimeSettingsUnavailable }>

export type RuntimeRunnerDaemonFactoryOptions = Readonly<{
  loader: RuntimeSettingsLoader
  worker: RunnerWorker
  signal: AbortSignal
  createDaemon?: (options: RunnerDaemonOptions) => RunnerDaemon
}>

export async function createRuntimeRunnerDaemon(
  options: RuntimeRunnerDaemonFactoryOptions,
): Promise<RuntimeRunnerDaemonCreateResult> {
  const settings = await options.loader.loadRuntimeSettings()
  if (!settings.ok) {
    return Object.freeze({
      ok: false,
      error: settings.error,
    })
  }

  const createDaemon = options.createDaemon ?? createRunnerDaemon

  return Object.freeze({
    ok: true,
    value: createDaemon({
      worker: options.worker,
      signal: options.signal,
      ...settings.value.options.runner,
    }),
  })
}

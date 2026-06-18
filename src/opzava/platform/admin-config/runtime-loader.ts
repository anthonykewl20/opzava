import type { AdminSettingsRepository } from './repository'
import { projectRuntimeOptions, type OpzavaRuntimeOptionsProjection } from './runtime-options'

export type RuntimeSettings = Readonly<{
  version: number
  updatedAt: string
  updatedBy: string
  options: OpzavaRuntimeOptionsProjection
}>

export type RuntimeSettingsUnavailable = Readonly<{
  kind: 'unavailable'
  reason: 'not_persisted'
}>

export type RuntimeSettingsLoadResult =
  | Readonly<{ ok: true, value: RuntimeSettings }>
  | Readonly<{ ok: false, error: RuntimeSettingsUnavailable }>

export type RuntimeSettingsLoader = Readonly<{
  loadRuntimeSettings: () => Promise<RuntimeSettingsLoadResult>
}>

export type RuntimeSettingsLoaderOptions = Readonly<{
  repository: Pick<AdminSettingsRepository, 'getSettings'>
}>

export function createRuntimeSettingsLoader(options: RuntimeSettingsLoaderOptions): RuntimeSettingsLoader {
  async function loadRuntimeSettings(): Promise<RuntimeSettingsLoadResult> {
    const record = options.repository.getSettings()
    if (record === null) {
      // Missing settings are operationally recoverable; corrupt persisted metadata is not.
      return Object.freeze({
        ok: false,
        error: Object.freeze({
          kind: 'unavailable',
          reason: 'not_persisted',
        }),
      })
    }

    assertPositiveInteger(record.version, 'version')
    assertValidDateString(record.updatedAt, 'updatedAt')

    return Object.freeze({
      ok: true,
      value: Object.freeze({
        version: record.version,
        updatedAt: record.updatedAt,
        updatedBy: record.updatedBy,
        options: projectRuntimeOptions(record.settings),
      }),
    })
  }

  return Object.freeze({ loadRuntimeSettings })
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
}

function assertValidDateString(value: string, name: string): void {
  if (Number.isNaN(new Date(value).getTime())) {
    throw new Error(`${name} must be a valid date string`)
  }
}

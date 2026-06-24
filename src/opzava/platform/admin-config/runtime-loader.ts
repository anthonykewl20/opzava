import type { AdminSettingsRepository } from './repository'
import { projectRuntimeOptions, type OpzavaRuntimeOptionsProjection } from './runtime-options'
import { defaultOpzavaAdminSettings } from './settings'

// Stable metadata for the synthesized "defaults" settings a fresh deploy uses before an operator
// persists any. version 0 marks it as the unconfigured baseline.
export const DEFAULT_RUNTIME_SETTINGS_UPDATED_AT = '1970-01-01T00:00:00.000Z'
export const DEFAULT_RUNTIME_SETTINGS_UPDATED_BY = 'system:default'

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

export function createStrictRuntimeSettingsLoader(options: RuntimeSettingsLoaderOptions): RuntimeSettingsLoader {
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

/**
 * Like `createStrictRuntimeSettingsLoader`, but falls back to the built-in `defaultOpzavaAdminSettings()`
 * (at version 0) when nothing is persisted, instead of reporting `unavailable`. The provider-execution
 * layer (F1b live send) needs runtime options to exist; this lets a fresh deploy run on the defaults
 * until an operator persists their own.
 */
export function createLiveRuntimeSettingsLoader(options: RuntimeSettingsLoaderOptions): RuntimeSettingsLoader {
  async function loadRuntimeSettings(): Promise<RuntimeSettingsLoadResult> {
    const record = options.repository.getSettings()
    if (record === null) {
      return Object.freeze({
        ok: true,
        value: Object.freeze({
          version: 0,
          updatedAt: DEFAULT_RUNTIME_SETTINGS_UPDATED_AT,
          updatedBy: DEFAULT_RUNTIME_SETTINGS_UPDATED_BY,
          options: projectRuntimeOptions(defaultOpzavaAdminSettings()),
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

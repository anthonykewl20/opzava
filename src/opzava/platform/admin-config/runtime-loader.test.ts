import { describe, expect, it, vi } from 'vitest'

import type { AdminSettingsRepository, AdminSettingsStorageRecord } from './repository'
import {
  projectProviderAdapterDefaults,
  projectRetryPolicyOptions,
  projectRunnerDaemonOptions,
  projectRuntimeOptions,
} from './runtime-options'
import {
  createStrictRuntimeSettingsLoader,
  createLiveRuntimeSettingsLoader,
  DEFAULT_RUNTIME_SETTINGS_UPDATED_AT,
  DEFAULT_RUNTIME_SETTINGS_UPDATED_BY,
} from './runtime-loader'
import { defaultOpzavaAdminSettings } from './settings'

describe('Opzava runtime settings loader', () => {
  it('returns typed unavailable when settings are not persisted', async () => {
    const loader = createStrictRuntimeSettingsLoader({ repository: fakeRepository(null) })

    await expect(loader.loadRuntimeSettings()).resolves.toEqual({
      ok: false,
      error: {
        kind: 'unavailable',
        reason: 'not_persisted',
      },
    })
  })

  it('loads persisted settings into runtime projections without mutating settings', async () => {
    const record = storageRecord()
    const before = JSON.stringify(record.settings)
    const loader = createStrictRuntimeSettingsLoader({ repository: fakeRepository(record) })

    const result = await loader.loadRuntimeSettings()

    expect(result).toEqual({
      ok: true,
      value: {
        version: 3,
        updatedAt: '2026-06-15T00:00:00.000Z',
        updatedBy: 'admin:1',
        options: projectRuntimeOptions(record.settings),
      },
    })
    expect(JSON.stringify(record.settings)).toBe(before)
  })

  it('uses the same projection contracts as runtime option construction', async () => {
    const record = storageRecord()
    const loader = createStrictRuntimeSettingsLoader({ repository: fakeRepository(record) })
    const result = await loader.loadRuntimeSettings()

    if (!result.ok) throw new Error('expected runtime settings to load')
    expect(result.value.options.runner).toEqual(projectRunnerDaemonOptions(record.settings))
    expect(result.value.options.retry).toEqual(projectRetryPolicyOptions(record.settings))
    expect(result.value.options.provider).toEqual(projectProviderAdapterDefaults(record.settings))
  })

  it('rejects invalid persisted versions as programmer errors', async () => {
    const loader = createStrictRuntimeSettingsLoader({
      repository: fakeRepository({ ...storageRecord(), version: 0 }),
    })

    await expect(loader.loadRuntimeSettings()).rejects.toThrow(/version/)
  })

  it('rejects invalid persisted update timestamps as programmer errors', async () => {
    const loader = createStrictRuntimeSettingsLoader({
      repository: fakeRepository({ ...storageRecord(), updatedAt: 'not-a-date' }),
    })

    await expect(loader.loadRuntimeSettings()).rejects.toThrow(/updatedAt/)
  })

  it('does not wrap repository failures', async () => {
    const error = new Error('database unavailable')
    const repository = fakeRepository(null)
    vi.spyOn(repository, 'getSettings').mockImplementation(() => {
      throw error
    })
    const loader = createStrictRuntimeSettingsLoader({ repository })

    await expect(loader.loadRuntimeSettings()).rejects.toBe(error)
  })
})

describe('Opzava defaulting runtime settings loader', () => {
  it('falls back to default options at version 0 when nothing is persisted', async () => {
    const loader = createLiveRuntimeSettingsLoader({ repository: fakeRepository(null) })

    await expect(loader.loadRuntimeSettings()).resolves.toEqual({
      ok: true,
      value: {
        version: 0,
        updatedAt: DEFAULT_RUNTIME_SETTINGS_UPDATED_AT,
        updatedBy: DEFAULT_RUNTIME_SETTINGS_UPDATED_BY,
        options: projectRuntimeOptions(defaultOpzavaAdminSettings()),
      },
    })
  })

  it('uses persisted settings when present (same projection as the strict loader)', async () => {
    const record = storageRecord()
    const loader = createLiveRuntimeSettingsLoader({ repository: fakeRepository(record) })

    await expect(loader.loadRuntimeSettings()).resolves.toEqual({
      ok: true,
      value: {
        version: 3,
        updatedAt: '2026-06-15T00:00:00.000Z',
        updatedBy: 'admin:1',
        options: projectRuntimeOptions(record.settings),
      },
    })
  })

  it('still rejects a corrupt persisted version', async () => {
    const loader = createLiveRuntimeSettingsLoader({
      repository: fakeRepository({ ...storageRecord(), version: 0 }),
    })
    await expect(loader.loadRuntimeSettings()).rejects.toThrow(/version/)
  })

  it('still rejects a corrupt persisted update timestamp (named in the error)', async () => {
    const loader = createLiveRuntimeSettingsLoader({
      repository: fakeRepository({ ...storageRecord(), updatedAt: 'not-a-date' }),
    })
    await expect(loader.loadRuntimeSettings()).rejects.toThrow(/updatedAt/)
  })

  it('pins the default metadata sentinels', () => {
    expect(DEFAULT_RUNTIME_SETTINGS_UPDATED_AT).toBe('1970-01-01T00:00:00.000Z')
    expect(DEFAULT_RUNTIME_SETTINGS_UPDATED_BY).toBe('system:default')
  })
})

function storageRecord(overrides: Partial<AdminSettingsStorageRecord> = {}): AdminSettingsStorageRecord {
  return {
    settings: defaultOpzavaAdminSettings(),
    version: 3,
    updatedAt: '2026-06-15T00:00:00.000Z',
    updatedBy: 'admin:1',
    ...overrides,
  }
}

function fakeRepository(record: AdminSettingsStorageRecord | null): AdminSettingsRepository {
  return {
    ensureSchema: () => undefined,
    getSettings: () => record,
    saveSettings: () => {
      throw new Error('saveSettings is not used by runtime settings loader')
    },
    listAuditEvents: () => [],
  }
}

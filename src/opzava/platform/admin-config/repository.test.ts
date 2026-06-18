import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { createSecretReference } from './contracts'
import { createAdminSettingsRepository } from './repository'
import { defaultOpzavaAdminSettings, parseOpzavaAdminSettings } from './settings'

describe('Opzava admin settings repository', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  function repository() {
    db = new Database(':memory:')
    return createAdminSettingsRepository(db)
  }

  it('returns null before settings have been saved', () => {
    const repo = repository()

    expect(repo.getSettings()).toBeNull()
  })

  it('round-trips validated settings with secret references intact', () => {
    const repo = repository()
    const settings = parseOpzavaAdminSettings({
      ...defaultOpzavaAdminSettings(),
      providerCredentials: {
        'live-llm': createSecretReference({
          id: 'secret_live_llm_key',
          scope: 'provider-credential',
          purpose: 'llm-provider-api-key',
        }),
      },
    })

    repo.saveSettings({
      settings,
      actorId: 'admin:1',
      reason: 'Configure live LLM credential reference',
      correlationId: 'settings-save-001',
      updatedAt: '2026-06-15T00:00:00.000Z',
      auditEventId: 'audit_admin_settings_save_001',
    })

    expect(repo.getSettings()?.settings).toEqual(settings)
    expect(repo.getSettings()?.version).toBe(1)
  })

  it('emits value-free audit records for settings saves', () => {
    const repo = repository()
    const settings = parseOpzavaAdminSettings({
      ...defaultOpzavaAdminSettings(),
      runner: {
        ...defaultOpzavaAdminSettings().runner,
        idleDelayMs: 2_000,
      },
      providerCredentials: {
        'live-llm': createSecretReference({
          id: 'secret_live_llm_key',
          scope: 'provider-credential',
          purpose: 'llm-provider-api-key',
        }),
      },
    })

    const saved = repo.saveSettings({
      settings,
      actorId: 'admin:1',
      reason: 'Tune runner polling and add provider credential reference',
      correlationId: 'settings-save-002',
      updatedAt: '2026-06-15T00:01:00.000Z',
      auditEventId: 'audit_admin_settings_save_002',
    })
    const audits = repo.listAuditEvents()
    const serializedAudit = JSON.stringify(audits)

    expect(saved.version).toBe(1)
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({
      auditEventId: 'audit_admin_settings_save_002',
      actorId: 'admin:1',
      action: 'admin.settings.updated',
      target: {
        kind: 'opzava-admin-settings',
        id: 'singleton',
      },
      afterSummary: {
        versionBefore: null,
        versionAfter: 1,
        changedPaths: ['providerCredentials.live-llm', 'runner.idleDelayMs'],
      },
      correlationId: 'settings-save-002',
      occurredAt: '2026-06-15T00:01:00.000Z',
    })
    expect(serializedAudit).not.toContain('secret_live_llm_key')
    expect(serializedAudit).not.toContain('llm-provider-api-key')
    expect(serializedAudit).not.toContain('2000')
  })

  it('increments version and audits only changed paths on later saves', () => {
    const repo = repository()
    const first = defaultOpzavaAdminSettings()
    const second = parseOpzavaAdminSettings({
      ...first,
      providers: {
        ...first.providers,
        requestTimeoutMs: 45_000,
      },
    })

    repo.saveSettings({ settings: first, actorId: 'admin:1', reason: 'Initial settings', correlationId: 'settings-save-003', updatedAt: '2026-06-15T00:02:00.000Z', auditEventId: 'audit_admin_settings_save_003' })
    const saved = repo.saveSettings({ settings: second, actorId: 'admin:2', reason: 'Tune provider timeout', correlationId: 'settings-save-004', updatedAt: '2026-06-15T00:03:00.000Z', auditEventId: 'audit_admin_settings_save_004' })
    const audits = repo.listAuditEvents()

    expect(saved.version).toBe(2)
    expect(repo.getSettings()?.version).toBe(2)
    expect(audits[1]?.afterSummary).toEqual({
      versionBefore: 1,
      versionAfter: 2,
      changedPaths: ['providers.requestTimeoutMs'],
    })
  })

  it('applies schema creation idempotently', () => {
    const repo = repository()

    repo.ensureSchema()
    repo.ensureSchema()

    expect(repo.getSettings()).toBeNull()
  })
})

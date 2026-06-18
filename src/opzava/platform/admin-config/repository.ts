import type Database from 'better-sqlite3'

import { parseAuditEvent, type AuditEvent } from '../audit/contracts'
import {
  defaultOpzavaAdminSettings,
  diffOpzavaAdminSettings,
  parseOpzavaAdminSettings,
  type OpzavaAdminSettings,
} from './settings'

const SETTINGS_ID = 'singleton'

type JsonRow = { record_json: string }

export type AdminSettingsStorageRecord = Readonly<{
  settings: OpzavaAdminSettings
  version: number
  updatedAt: string
  updatedBy: string
}>

export type SaveAdminSettingsInput = Readonly<{
  settings: OpzavaAdminSettings
  actorId: string
  reason: string
  correlationId: string
  updatedAt: string
  auditEventId: string
}>

export type SaveAdminSettingsResult = AdminSettingsStorageRecord & Readonly<{
  auditEvent: AuditEvent
}>

export type AdminSettingsRepository = Readonly<{
  ensureSchema: () => void
  getSettings: () => AdminSettingsStorageRecord | null
  saveSettings: (input: SaveAdminSettingsInput) => SaveAdminSettingsResult
  listAuditEvents: () => AuditEvent[]
}>

export function createAdminSettingsRepository(db: Database.Database): AdminSettingsRepository {
  function ensureSchema(): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS opzava_admin_settings (
        settings_id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS opzava_admin_settings_audit_events (
        audit_event_id TEXT PRIMARY KEY,
        occurred_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_opzava_admin_settings_audit_events_occurred_at
      ON opzava_admin_settings_audit_events(occurred_at, audit_event_id);
    `)
  }

  function getSettings(): AdminSettingsStorageRecord | null {
    ensureSchema()
    const row = db.prepare('SELECT record_json FROM opzava_admin_settings WHERE settings_id = ?').get(SETTINGS_ID) as JsonRow | undefined
    if (!row) return null

    return parseStorageRecord(JSON.parse(row.record_json))
  }

  function saveSettings(input: SaveAdminSettingsInput): SaveAdminSettingsResult {
    ensureSchema()
    const tx = db.transaction(() => {
      const previous = getSettings()
      const versionBefore = previous?.version ?? null
      const versionAfter = (previous?.version ?? 0) + 1
      const settings = parseOpzavaAdminSettings(input.settings)
      const record = parseStorageRecord({
        settings,
        version: versionAfter,
        updatedAt: input.updatedAt,
        updatedBy: input.actorId,
      })
      const changedPaths = diffOpzavaAdminSettings(previous?.settings ?? defaultOpzavaAdminSettings(), settings).map((change) => change.path)
      const auditEvent = parseAuditEvent({
        schemaVersion: 1,
        auditEventId: input.auditEventId,
        actorId: input.actorId,
        action: 'admin.settings.updated',
        target: {
          kind: 'opzava-admin-settings',
          id: SETTINGS_ID,
        },
        beforeSummary: null,
        afterSummary: {
          versionBefore,
          versionAfter,
          changedPaths,
        },
        correlationId: input.correlationId,
        occurredAt: input.updatedAt,
      })

      db.prepare(`
        INSERT INTO opzava_admin_settings (settings_id, version, updated_at, updated_by, record_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(settings_id) DO UPDATE SET
          version = excluded.version,
          updated_at = excluded.updated_at,
          updated_by = excluded.updated_by,
          record_json = excluded.record_json
      `).run(SETTINGS_ID, record.version, record.updatedAt, record.updatedBy, JSON.stringify(record))
      db.prepare(`
        INSERT INTO opzava_admin_settings_audit_events (audit_event_id, occurred_at, record_json)
        VALUES (?, ?, ?)
      `).run(auditEvent.auditEventId, auditEvent.occurredAt, JSON.stringify(auditEvent))

      return Object.freeze({ ...record, auditEvent })
    })

    return tx()
  }

  function listAuditEvents(): AuditEvent[] {
    ensureSchema()
    const rows = db.prepare(`
      SELECT record_json FROM opzava_admin_settings_audit_events
      ORDER BY occurred_at ASC, audit_event_id ASC
    `).all() as JsonRow[]

    return rows.map((row) => parseAuditEvent(JSON.parse(row.record_json)))
  }

  return Object.freeze({ ensureSchema, getSettings, saveSettings, listAuditEvents })
}

function parseStorageRecord(input: unknown): AdminSettingsStorageRecord {
  const record = input as AdminSettingsStorageRecord
  return Object.freeze({
    settings: parseOpzavaAdminSettings(record.settings),
    version: assertPositiveInteger(record.version, 'version'),
    updatedAt: assertString(record.updatedAt, 'updatedAt'),
    updatedBy: assertString(record.updatedBy, 'updatedBy'),
  })
}

function assertPositiveInteger(value: unknown, name: string): number {
  if (!Number.isInteger(value) || typeof value !== 'number' || value <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }

  return value
}

function assertString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }

  return value
}

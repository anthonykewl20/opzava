import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

import { registerOpzavaRunnerMigrations } from './migrations'

describe('Opzava runner migrations', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  it('registers runner repository tables with the project migration runner', () => {
    db = new Database(':memory:')

    registerOpzavaRunnerMigrations()
    registerOpzavaRunnerMigrations()
    runMigrations(db)

    const migrations = db.prepare(`
      SELECT id FROM schema_migrations WHERE id LIKE 'opzava_runner_%' ORDER BY id
    `).all() as Array<{ id: string }>
    const tables = db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'opzava_runner_%'
      ORDER BY name
    `).all() as Array<{ name: string }>

    expect(migrations.map((migration) => migration.id)).toEqual([
      'opzava_runner_001_repository',
      'opzava_runner_002_job_priority_index',
      'opzava_runner_003_external_call_reservations',
    ])
    expect(tables.map((table) => table.name)).toEqual([
      'opzava_runner_attempts',
      'opzava_runner_dead_letters',
      'opzava_runner_external_call_reservations',
      'opzava_runner_jobs',
      'opzava_runner_operational_events',
    ])
  })

  it('upgrades an existing runner jobs table that predates the priority index', () => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      INSERT INTO schema_migrations (id) VALUES ('opzava_runner_001_repository');
      CREATE TABLE opzava_runner_jobs (
        job_id TEXT PRIMARY KEY,
        workflow_run_id TEXT NOT NULL,
        step_run_id TEXT,
        status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        scheduled_at TEXT NOT NULL,
        lease_expires_at TEXT,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `)

    registerOpzavaRunnerMigrations()
    runMigrations(db)

    const columns = db.prepare('PRAGMA table_info(opzava_runner_jobs)').all() as Array<{ name: string }>
    const migration = db.prepare(`
      SELECT id FROM schema_migrations WHERE id = ?
    `).get('opzava_runner_002_job_priority_index') as { id: string } | undefined

    expect(columns.some((column) => column.name === 'priority')).toBe(true)
    expect(migration?.id).toBe('opzava_runner_002_job_priority_index')
  })
})

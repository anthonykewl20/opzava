import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

// Migration 059 (orchestration-fleet-schema):
//   (a) tasks.account_profile TEXT nullable + covering index
//   (b) opzava_card_workflow_graph table + indexes (incl. partial unique on active)
//   (c) opzava_orchestration_audit table + index

// ─── (a) tasks.account_profile ─────────────────────────────────────────────

describe('main migrations — 059 orchestration_fleet_schema (a): tasks.account_profile', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  it('adds tasks.account_profile column after migration', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const cols = db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>
    const names = new Set(cols.map((c) => c.name))
    expect(names.has('account_profile'), 'tasks.account_profile should exist after 059').toBe(true)
  })

  it('creates idx_tasks_account_profile_status index', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_tasks_account_profile_status'",
      )
      .get() as { name: string } | undefined
    expect(idx?.name).toBe('idx_tasks_account_profile_status')
  })

  it('re-running migrations is a no-op (no throw, no double-record)', () => {
    db = new Database(':memory:')
    runMigrations(db)
    runMigrations(db)
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = '059_orchestration_fleet_schema'")
      .get() as { n: number }
    expect(count.n).toBe(1)
  })

  it('migration is recorded in schema_migrations', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const applied = db
      .prepare("SELECT id FROM schema_migrations WHERE id = '059_orchestration_fleet_schema'")
      .get() as { id: string } | undefined
    expect(applied?.id).toBe('059_orchestration_fleet_schema')
  })
})

// ─── (b) opzava_card_workflow_graph ────────────────────────────────────────

describe('main migrations — 059 orchestration_fleet_schema (b): opzava_card_workflow_graph', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  it('creates opzava_card_workflow_graph table with expected columns', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'opzava_card_workflow_graph'",
      )
      .get() as { name: string } | undefined
    expect(table?.name).toBe('opzava_card_workflow_graph')

    const cols = db
      .prepare('PRAGMA table_info(opzava_card_workflow_graph)')
      .all() as Array<{ name: string }>
    const names = new Set(cols.map((c) => c.name))
    for (const col of ['id', 'task_id', 'workspace_id', 'graph_json', 'status', 'created_at', 'updated_at']) {
      expect(names.has(col), `opzava_card_workflow_graph.${col} should exist`).toBe(true)
    }
  })

  it('creates idx_opzava_card_workflow_graph_task_id index', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_opzava_card_workflow_graph_task_id'",
      )
      .get() as { name: string } | undefined
    expect(idx?.name).toBe('idx_opzava_card_workflow_graph_task_id')
  })

  it('partial unique index rejects a 2nd active row for the same task_id', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const ins = db.prepare(
      "INSERT INTO opzava_card_workflow_graph (task_id, workspace_id, graph_json, status) VALUES (?, ?, ?, ?)",
    )
    ins.run(10, 1, '{}', 'active') // first active — ok
    expect(() => ins.run(10, 1, '{}', 'active')).toThrow() // second active for same task_id — violates partial unique
  })

  it('partial unique index allows a non-active duplicate task_id', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const ins = db.prepare(
      "INSERT INTO opzava_card_workflow_graph (task_id, workspace_id, graph_json, status) VALUES (?, ?, ?, ?)",
    )
    ins.run(20, 1, '{}', 'active')
    // superceded (non-active) rows are outside the partial index — must not throw
    expect(() => ins.run(20, 1, '{}', 'superceded')).not.toThrow()
    expect(() => ins.run(20, 1, '{}', 'archived')).not.toThrow()
  })

  it('re-run is idempotent for the table + indexes', () => {
    db = new Database(':memory:')
    runMigrations(db)
    // must not throw on a second pass
    expect(() => runMigrations(db!)).not.toThrow()
  })
})

// ─── (c) opzava_orchestration_audit ────────────────────────────────────────

describe('main migrations — 059 orchestration_fleet_schema (c): opzava_orchestration_audit', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  it('creates opzava_orchestration_audit table with expected columns', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'opzava_orchestration_audit'",
      )
      .get() as { name: string } | undefined
    expect(table?.name).toBe('opzava_orchestration_audit')

    const cols = db
      .prepare('PRAGMA table_info(opzava_orchestration_audit)')
      .all() as Array<{ name: string }>
    const names = new Set(cols.map((c) => c.name))
    for (const col of ['id', 'workspace_id', 'action_kind', 'card_id', 'graph_id', 'step_id', 'verdict', 'denials_json', 'created_at']) {
      expect(names.has(col), `opzava_orchestration_audit.${col} should exist`).toBe(true)
    }
  })

  it('creates idx_opzava_orchestration_audit_workspace_created_at index', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const idx = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_opzava_orchestration_audit_workspace_created_at'",
      )
      .get() as { name: string } | undefined
    expect(idx?.name).toBe('idx_opzava_orchestration_audit_workspace_created_at')
  })

  it('re-run is idempotent for the table + index', () => {
    db = new Database(':memory:')
    runMigrations(db)
    expect(() => runMigrations(db!)).not.toThrow()
  })
})

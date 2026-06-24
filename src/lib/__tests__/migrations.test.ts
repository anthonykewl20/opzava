import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

// A1 (MASTER-PLAN): migration 055 splits the shared dispatch_attempts counter into
// independent budgets, arms the lease (claimed_at), and adds client_request_id for
// idempotent task capture. This proves it lands on a fresh DB, the partial unique
// index behaves (rejects duplicate keys, allows NULL, scoped per workspace), and the
// migration runner is idempotent.

describe('main migrations — 055 counters/lease/idempotency', () => {
  let db: Database.Database | null = null

  afterEach(() => {
    db?.close()
    db = null
  })

  it('adds the counter/lease/idempotency columns + records the migration + creates the index', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const cols = db.prepare('PRAGMA table_info(tasks)').all() as Array<{ name: string }>
    const names = new Set(cols.map((c) => c.name))
    for (const col of ['review_attempts', 'aegis_error_count', 'aegis_error_not_before', 'claimed_at', 'client_request_id']) {
      expect(names.has(col), `tasks.${col} should exist after 055`).toBe(true)
    }

    const idx = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_tasks_client_request_id'")
      .get() as { name: string } | undefined
    expect(idx?.name).toBe('idx_tasks_client_request_id')

    const applied = db
      .prepare("SELECT id FROM schema_migrations WHERE id = '055_task_counters_lease_idempotency'")
      .get() as { id: string } | undefined
    expect(applied?.id).toBe('055_task_counters_lease_idempotency')
  })

  it('partial unique index rejects duplicate (workspace_id, client_request_id), allows NULL, is workspace-scoped', () => {
    db = new Database(':memory:')
    runMigrations(db)

    const ins = db.prepare('INSERT INTO tasks (workspace_id, title, client_request_id) VALUES (?, ?, ?)')
    ins.run(1, 'a', 'k1') // ok — first
    ins.run(1, 'b', null) // ok — NULL excluded by the partial index WHERE
    ins.run(1, 'c', null) // ok — two NULLs allowed
    expect(() => ins.run(1, 'd', 'k1')).toThrow() // duplicate (1, 'k1') -> UNIQUE violation
    expect(() => ins.run(2, 'e', 'k1')).not.toThrow() // same key, different workspace -> allowed
  })

  it('runMigrations is idempotent (re-applying is a no-op)', () => {
    db = new Database(':memory:')
    runMigrations(db)
    // A second run must not throw and must not double-record the migration.
    runMigrations(db)
    const count = db
      .prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE id = '055_task_counters_lease_idempotency'")
      .get() as { n: number }
    expect(count.n).toBe(1)
  })
})

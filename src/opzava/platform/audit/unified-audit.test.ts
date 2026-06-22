import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach } from 'vitest'
import { applyOpzavaRunnerRepositorySchema } from '../runner/migrations'
import {
  projectUnifiedAuditSummary,
  readOpzavaAuditCount,
  readInheritedAuditCount,
  readUnifiedAuditSummary,
} from './unified-audit'

describe('projectUnifiedAuditSummary', () => {
  it('sums the two engine counts', () => {
    expect(projectUnifiedAuditSummary(3, 5)).toEqual({ opzavaCount: 3, inheritedCount: 5, totalCount: 8 })
    expect(projectUnifiedAuditSummary(0, 0)).toEqual({ opzavaCount: 0, inheritedCount: 0, totalCount: 0 })
  })
})

let db: Database.Database
beforeEach(() => {
  db = new Database(':memory:')
})

function seedOpzavaEvent(database: Database.Database, recordId: string, kind: string): void {
  database
    .prepare(
      'INSERT INTO opzava_runner_operational_events (record_id, kind, workflow_run_id, step_run_id, occurred_at, record_json) VALUES (?,?,?,?,?,?)',
    )
    .run(recordId, kind, 'wf-1', 'step-1', '2026-07-05T00:00:00.000Z', '{}')
}

function createInheritedAuditLog(database: Database.Database): void {
  database.exec('CREATE TABLE audit_log (id INTEGER PRIMARY KEY, action TEXT, created_at INTEGER)')
}

describe('readOpzavaAuditCount', () => {
  it('counts only kind=audit operational events; zero when the table is absent', () => {
    expect(readOpzavaAuditCount(db)).toBe(0) // table absent
    applyOpzavaRunnerRepositorySchema(db)
    seedOpzavaEvent(db, 'a1', 'audit')
    seedOpzavaEvent(db, 'a2', 'audit')
    seedOpzavaEvent(db, 'c1', 'cost') // not audit
    expect(readOpzavaAuditCount(db)).toBe(2)
  })
})

describe('readInheritedAuditCount', () => {
  it('counts audit_log rows; zero when the table is absent', () => {
    expect(readInheritedAuditCount(db)).toBe(0) // table absent
    createInheritedAuditLog(db)
    db.prepare('INSERT INTO audit_log (action, created_at) VALUES (?, ?)').run('login', 1)
    db.prepare('INSERT INTO audit_log (action, created_at) VALUES (?, ?)').run('logout', 2)
    db.prepare('INSERT INTO audit_log (action, created_at) VALUES (?, ?)').run('update', 3)
    expect(readInheritedAuditCount(db)).toBe(3)
  })
})

describe('readUnifiedAuditSummary', () => {
  it('merges both engines audit counts', () => {
    applyOpzavaRunnerRepositorySchema(db)
    seedOpzavaEvent(db, 'a1', 'audit')
    createInheritedAuditLog(db)
    db.prepare('INSERT INTO audit_log (action, created_at) VALUES (?, ?)').run('login', 1)
    db.prepare('INSERT INTO audit_log (action, created_at) VALUES (?, ?)').run('logout', 2)
    expect(readUnifiedAuditSummary(db)).toEqual({ opzavaCount: 1, inheritedCount: 2, totalCount: 3 })
  })
})

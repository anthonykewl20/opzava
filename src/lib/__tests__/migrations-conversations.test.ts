import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'

// S0 (#36) — the opzava_conversation + opzava_conversation_turn schema (doc 95 §D1).
// Source of truth is the central migration (mirrors migration 059 for the orchestration
// fleet); Engine-B code/tests reach it via runMigrations(:memory:).

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
})

afterEach(() => {
  db.close()
})

describe('opzava conversation schema (migration)', () => {
  it('persists an Ask-Opzava orchestrator conversation and a correlated AI turn', () => {
    db.prepare(
      `INSERT INTO opzava_conversation
        (conversation_id, type, project_id, participants, title, record_json, created_at, last_message_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('coord:admin:opzava', 'orchestrator', null, '["admin"]', 'Ask Opzava', '{}', 't0', 't0')

    db.prepare(
      `INSERT INTO opzava_conversation_turn
        (turn_id, conversation_id, parent_turn_id, author, role, body, ref_type, ref_id, message_anchor, status, record_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('turn_1', 'coord:admin:opzava', null, 'Opzava', 'ai', 'Everything is on track.', null, null, null, 'final', '{}', 't1')

    const conv = db
      .prepare('SELECT * FROM opzava_conversation WHERE conversation_id = ?')
      .get('coord:admin:opzava') as { type: string; project_id: number | null }
    expect(conv.type).toBe('orchestrator')
    expect(conv.project_id).toBeNull()

    const turn = db
      .prepare('SELECT * FROM opzava_conversation_turn WHERE turn_id = ?')
      .get('turn_1') as { conversation_id: string; role: string; message_anchor: number | null }
    expect(turn.conversation_id).toBe('coord:admin:opzava')
    expect(turn.role).toBe('ai')
    expect(turn.message_anchor).toBeNull() // AI turns reference messages by anchor, never copy
  })

  it('persists a pending action-block turn (the proposed-action source of truth)', () => {
    db.prepare(
      `INSERT INTO opzava_conversation (conversation_id, type, participants, record_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('coord:admin:opzava', 'orchestrator', '[]', '{}', 't0')

    db.prepare(
      `INSERT INTO opzava_conversation_turn
        (turn_id, conversation_id, author, role, body, status, ref_type, ref_id, record_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run('turn_act', 'coord:admin:opzava', 'Opzava', 'ai', '', 'pending', 'approval', 'apr-1', '{"action":{"actionType":"approve_and_send"}}', 't2')

    const turn = db
      .prepare('SELECT * FROM opzava_conversation_turn WHERE turn_id = ?')
      .get('turn_act') as { status: string; ref_type: string; ref_id: string }
    expect(turn.status).toBe('pending')
    expect(turn.ref_type).toBe('approval')
    expect(turn.ref_id).toBe('apr-1')
  })

  it('enforces conversation_id as the primary key (idempotent room identity)', () => {
    const insert = () =>
      db
        .prepare(
          `INSERT INTO opzava_conversation (conversation_id, type, participants, record_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('coord:admin:opzava', 'orchestrator', '[]', '{}', 't0')
    insert()
    expect(insert).toThrow()
  })
})

import type Database from 'better-sqlite3'

import {
  parseConversation,
  parseConversationTurn,
  type Conversation,
  type ConversationTurn,
  type ConversationType,
} from './contracts'

// Persistence for the self-contained Ask-Opzava conversation store (opzava_conversation +
// opzava_conversation_turn, migration 060). Schema is owned by the migration (source of truth,
// per the 059/CardDecomposition precedent); this repo is CRUD only — no ensureSchema duplication.

export interface ConversationRepository {
  saveConversation(conversation: Conversation): void
  getConversationById(conversationId: string): Conversation | null
  listConversations(filter?: Readonly<{ type?: ConversationType; projectId?: number }>): Conversation[]
  touchLastMessageAt(conversationId: string, at: string): void
  appendTurn(turn: ConversationTurn): void
  listTurns(conversationId: string): ConversationTurn[]
  deleteConversation(conversationId: string): void
}

interface ConversationRow {
  conversation_id: string
  type: string
  project_id: number | null
  participants: string
  title: string | null
  record_json: string
  created_at: string
  last_message_at: string | null
}

interface TurnRow {
  turn_id: string
  conversation_id: string
  parent_turn_id: string | null
  author: string
  role: string
  body: string
  ref_type: string | null
  ref_id: string | null
  message_anchor: number | null
  status: string | null
  record_json: string
  created_at: string
}

function rowToConversation(row: ConversationRow): Conversation {
  return parseConversation({
    conversationId: row.conversation_id,
    type: row.type,
    projectId: row.project_id,
    participants: JSON.parse(row.participants),
    title: row.title,
    record: JSON.parse(row.record_json),
    createdAt: row.created_at,
    lastMessageAt: row.last_message_at,
  })
}

function rowToTurn(row: TurnRow): ConversationTurn {
  return parseConversationTurn({
    turnId: row.turn_id,
    conversationId: row.conversation_id,
    parentTurnId: row.parent_turn_id,
    author: row.author,
    role: row.role,
    body: row.body,
    refType: row.ref_type,
    refId: row.ref_id,
    messageAnchor: row.message_anchor,
    status: row.status,
    record: JSON.parse(row.record_json),
    createdAt: row.created_at,
  })
}

export function createConversationRepository(db: Database.Database): ConversationRepository {
  return {
    saveConversation(conversation) {
      const c = parseConversation(conversation)
      db.prepare(
        `INSERT INTO opzava_conversation
           (conversation_id, type, project_id, participants, title, record_json, created_at, last_message_at)
         VALUES (@conversation_id, @type, @project_id, @participants, @title, @record_json, @created_at, @last_message_at)
         ON CONFLICT(conversation_id) DO UPDATE SET
           type = excluded.type,
           project_id = excluded.project_id,
           participants = excluded.participants,
           title = excluded.title,
           record_json = excluded.record_json,
           last_message_at = excluded.last_message_at`,
      ).run({
        conversation_id: c.conversationId,
        type: c.type,
        project_id: c.projectId,
        participants: JSON.stringify(c.participants),
        title: c.title,
        record_json: JSON.stringify(c.record),
        created_at: c.createdAt,
        last_message_at: c.lastMessageAt,
      })
    },

    getConversationById(conversationId) {
      const row = db
        .prepare('SELECT * FROM opzava_conversation WHERE conversation_id = ?')
        .get(conversationId) as ConversationRow | undefined
      return row ? rowToConversation(row) : null
    },

    listConversations(filter) {
      const clauses: string[] = []
      const params: Array<string | number> = []
      if (filter?.type) {
        clauses.push('type = ?')
        params.push(filter.type)
      }
      if (filter?.projectId !== undefined) {
        clauses.push('project_id = ?')
        params.push(filter.projectId)
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
      const rows = db
        .prepare(
          `SELECT * FROM opzava_conversation ${where} ORDER BY COALESCE(last_message_at, created_at) DESC`,
        )
        .all(...params) as ConversationRow[]
      return rows.map(rowToConversation)
    },

    touchLastMessageAt(conversationId, at) {
      db.prepare('UPDATE opzava_conversation SET last_message_at = ? WHERE conversation_id = ?').run(
        at,
        conversationId,
      )
    },

    appendTurn(turn) {
      const t = parseConversationTurn(turn)
      db.prepare(
        `INSERT INTO opzava_conversation_turn
           (turn_id, conversation_id, parent_turn_id, author, role, body, ref_type, ref_id, message_anchor, status, record_json, created_at)
         VALUES (@turn_id, @conversation_id, @parent_turn_id, @author, @role, @body, @ref_type, @ref_id, @message_anchor, @status, @record_json, @created_at)
         ON CONFLICT(turn_id) DO UPDATE SET
           body = excluded.body,
           status = excluded.status,
           ref_type = excluded.ref_type,
           ref_id = excluded.ref_id,
           record_json = excluded.record_json`,
      ).run({
        turn_id: t.turnId,
        conversation_id: t.conversationId,
        parent_turn_id: t.parentTurnId,
        author: t.author,
        role: t.role,
        body: t.body,
        ref_type: t.refType,
        ref_id: t.refId,
        message_anchor: t.messageAnchor,
        status: t.status,
        record_json: JSON.stringify(t.record),
        created_at: t.createdAt,
      })
    },

    listTurns(conversationId) {
      const rows = db
        .prepare(
          'SELECT * FROM opzava_conversation_turn WHERE conversation_id = ? ORDER BY created_at ASC, turn_id ASC',
        )
        .all(conversationId) as TurnRow[]
      return rows.map(rowToTurn)
    },

    deleteConversation(conversationId) {
      db.transaction(() => {
        db.prepare('DELETE FROM opzava_conversation_turn WHERE conversation_id = ?').run(conversationId)
        db.prepare('DELETE FROM opzava_conversation WHERE conversation_id = ?').run(conversationId)
      })()
    },
  }
}

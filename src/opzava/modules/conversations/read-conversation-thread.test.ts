import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import { createConversationRepository } from './conversation-repository'
import { readConversationThread } from './read-conversation-thread'

let db: Database.Database
let repo: ReturnType<typeof createConversationRepository>

const ADMIN = { role: 'admin', name: 'admin' }

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = createConversationRepository(db)
  repo.saveConversation({
    conversationId: 'coord:admin:opzava',
    type: 'orchestrator',
    projectId: null,
    participants: ['admin'],
    title: 'Ask Opzava',
    record: {},
    createdAt: 't0',
    lastMessageAt: null,
  })
  repo.appendTurn({
    turnId: 't1', conversationId: 'coord:admin:opzava', parentTurnId: null, author: 'admin',
    role: 'human', body: "How's everything?", refType: null, refId: null, messageAnchor: null,
    status: null, record: {}, createdAt: 't1',
  })
  repo.appendTurn({
    turnId: 't2', conversationId: 'coord:admin:opzava', parentTurnId: null, author: 'Opzava',
    role: 'ai', body: 'On track.', refType: null, refId: null, messageAnchor: null,
    status: null, record: {}, createdAt: 't2',
  })
})

afterEach(() => db.close())

describe('readConversationThread', () => {
  it('returns the conversation and its turns oldest-first (no messages merge)', () => {
    const thread = readConversationThread(repo, 'coord:admin:opzava', ADMIN)
    expect(thread?.conversation.conversationId).toBe('coord:admin:opzava')
    expect(thread?.timeline.map((t) => t.turnId)).toEqual(['t1', 't2'])
    expect(thread?.timeline.every((t) => t.messageAnchor === null)).toBe(true)
  })

  it('returns null for a non-participant, non-admin viewer (ACL)', () => {
    expect(readConversationThread(repo, 'coord:admin:opzava', { role: 'member', name: 'mallory' })).toBeNull()
  })

  it('returns null for a missing conversation', () => {
    expect(readConversationThread(repo, 'coord:ghost:opzava', ADMIN)).toBeNull()
  })
})

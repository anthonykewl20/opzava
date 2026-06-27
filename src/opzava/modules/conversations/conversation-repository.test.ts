import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import { createConversationRepository } from './conversation-repository'
import type { Conversation, ConversationTurn } from './contracts'

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    conversationId: 'coord:admin:opzava',
    type: 'orchestrator',
    projectId: null,
    participants: ['admin'],
    title: 'Ask Opzava',
    record: {},
    createdAt: '2026-06-27T00:00:00.000Z',
    lastMessageAt: null,
    ...overrides,
  }
}

function turn(overrides: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    turnId: 'turn_1',
    conversationId: 'coord:admin:opzava',
    parentTurnId: null,
    author: 'Opzava',
    role: 'ai',
    body: 'Everything is on track.',
    refType: null,
    refId: null,
    messageAnchor: null,
    status: null,
    record: {},
    createdAt: '2026-06-27T00:00:01.000Z',
    ...overrides,
  }
}

let db: Database.Database
let repo: ReturnType<typeof createConversationRepository>

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  repo = createConversationRepository(db)
})

afterEach(() => db.close())

describe('createConversationRepository', () => {
  it('round-trips an orchestrator conversation via save + getById', () => {
    const c = conversation()
    repo.saveConversation(c)
    expect(repo.getConversationById('coord:admin:opzava')).toEqual(c)
    expect(repo.getConversationById('does-not-exist')).toBeNull()
  })

  it('appends turns and lists them oldest-first within a conversation', () => {
    repo.saveConversation(conversation())
    repo.appendTurn(turn({ turnId: 't1', role: 'human', author: 'admin', body: "How's everything?", createdAt: '2026-06-27T00:00:01.000Z' }))
    repo.appendTurn(turn({ turnId: 't2', role: 'ai', author: 'Opzava', body: 'On track.', createdAt: '2026-06-27T00:00:02.000Z' }))
    const turns = repo.listTurns('coord:admin:opzava')
    expect(turns.map((t) => t.turnId)).toEqual(['t1', 't2'])
    expect(turns[0]?.role).toBe('human')
  })

  it('round-trips a pending action-block turn (record carries the action vocabulary)', () => {
    repo.saveConversation(conversation())
    repo.appendTurn(
      turn({
        turnId: 'tA',
        role: 'ai',
        body: '',
        status: 'pending',
        refType: 'approval',
        refId: 'apr-1',
        record: { action: { kind: 'external-guarded', actionType: 'approve_and_send' } },
      }),
    )
    const [t] = repo.listTurns('coord:admin:opzava')
    expect(t?.status).toBe('pending')
    expect(t?.record).toEqual({ action: { kind: 'external-guarded', actionType: 'approve_and_send' } })
  })

  it('lists conversations filtered by type, newest activity first', () => {
    repo.saveConversation(conversation({ conversationId: 'coord:admin:opzava', type: 'orchestrator', lastMessageAt: '2026-06-27T00:00:05.000Z' }))
    repo.saveConversation(conversation({ conversationId: 'project:7:agent:atlas', type: 'assistant', title: 'Atlas', lastMessageAt: '2026-06-27T00:00:09.000Z' }))
    repo.saveConversation(conversation({ conversationId: 'coord:other:opzava', type: 'orchestrator', lastMessageAt: '2026-06-27T00:00:01.000Z' }))
    const orchestrators = repo.listConversations({ type: 'orchestrator' })
    expect(orchestrators.map((c) => c.conversationId)).toEqual(['coord:admin:opzava', 'coord:other:opzava'])
  })

  it('touchLastMessageAt updates the activity timestamp', () => {
    repo.saveConversation(conversation())
    repo.touchLastMessageAt('coord:admin:opzava', '2026-06-27T09:00:00.000Z')
    expect(repo.getConversationById('coord:admin:opzava')?.lastMessageAt).toBe('2026-06-27T09:00:00.000Z')
  })

  it('deleteConversation removes the conversation and cascades its turns', () => {
    repo.saveConversation(conversation())
    repo.appendTurn(turn({ turnId: 't1' }))
    repo.deleteConversation('coord:admin:opzava')
    expect(repo.getConversationById('coord:admin:opzava')).toBeNull()
    expect(repo.listTurns('coord:admin:opzava')).toEqual([])
  })
})

export { conversation, turn }

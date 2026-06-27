import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import { createConversationRepository } from '@/opzava/modules/conversations'
import { parseApproval, type Approval } from '@/opzava/core/approvals/contracts'
import {
  createConversationOutcomeTurnSink,
  resolveApprovedActionHandlers,
} from './post-approval-dispatcher'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
  createConversationRepository(db).saveConversation({
    conversationId: 'coord:admin:opzava',
    type: 'orchestrator',
    projectId: null,
    participants: ['admin'],
    title: 'Ask Opzava',
    record: {},
    createdAt: 't0',
    lastMessageAt: null,
  })
})

afterEach(() => db.close())

describe('createConversationOutcomeTurnSink', () => {
  it('posts a single outcome turn into the launching thread (idempotent on approvalId) and broadcasts', () => {
    const broadcast = vi.fn()
    const sink = createConversationOutcomeTurnSink(db, { now: () => 't1', workspaceId: 1, broadcast })

    const input = {
      correlation: { conversationId: 'coord:admin:opzava', runId: 'run-1' },
      approvalId: 'apr-1',
      outcome: { kind: 'triggered' as const, summary: 'Campaign send enqueued' },
    }
    sink.postOutcomeTurn(input)
    sink.postOutcomeTurn(input) // idempotent — same deterministic turnId

    const turns = createConversationRepository(db).listTurns('coord:admin:opzava')
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ role: 'system', refType: 'approval', refId: 'apr-1' })
    expect(turns[0]?.body).toContain('Campaign send enqueued')
    expect(broadcast).toHaveBeenCalledWith('conversation.turn_added', expect.objectContaining({ conversation_id: 'coord:admin:opzava' }))
  })
})

describe('resolveApprovedActionHandlers (conformance)', () => {
  function approved(requestedAction: string): Approval {
    return parseApproval({
      schemaVersion: 1,
      approvalId: `apr-${requestedAction}`,
      requestedAction,
      target: { kind: 'external-action', id: 'campaign-send:c1' },
      status: 'approved',
      requesterId: 'system',
      approverId: 'admin',
      decisionReason: 'ok',
      requestedAt: 't0',
      decidedAt: 't1',
      expiresAt: null,
      correlation: null,
    })
  }

  it('registers a handler for every dispatchable (external-action send) requestedAction', () => {
    const registry = resolveApprovedActionHandlers(db)
    // campaign.send is the one external-action send routed through the dispatcher in v1.
    expect(registry.get('campaign.send')).toBeDefined()
    // Artifact-milestone approvals are workflow-inline, NOT dispatched — absent is correct.
    expect(registry.get('publish-wordpress-draft')).toBeUndefined()
  })
})

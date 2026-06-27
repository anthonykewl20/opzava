import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import type { GatewaySession } from '@/lib/sessions'
import {
  composeAskOrchestratorDeps,
  createConciergeProvider,
  createFollowupTaskPort,
  notifyOwnerPort,
  probeCoordinatorStatus,
} from './compose'

function gatewaySession(overrides: Partial<GatewaySession> = {}): GatewaySession {
  return {
    key: 'agent:coordinator:main',
    agent: 'coordinator',
    sessionId: 'sess-1',
    updatedAt: Date.now(),
    chatType: 'chat',
    channel: '',
    model: '',
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    contextTokens: 0,
    active: true,
    ...overrides,
  }
}

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
})

afterEach(() => db.close())

describe('createFollowupTaskPort', () => {
  it('inserts a task and returns its card id', () => {
    const { cardId } = createFollowupTaskPort(db).createFollowupTask({
      title: 'Chase the investor reply',
      projectId: 3,
      actor: 'admin',
      workspaceId: 1,
    })
    const row = db.prepare('SELECT title, status, project_id, created_by FROM tasks WHERE id = ?').get(cardId) as {
      title: string
      status: string
      project_id: number
      created_by: string
    }
    expect(row).toEqual({ title: 'Chase the investor reply', status: 'inbox', project_id: 3, created_by: 'admin' })
  })
})

describe('notifyOwnerPort', () => {
  it('inserts a notification addressed to the actor', () => {
    notifyOwnerPort(db).notifyOwner({ message: 'Your approval is needed', actor: 'admin', workspaceId: 1 })
    const row = db
      .prepare("SELECT recipient, type, message FROM notifications WHERE recipient = 'admin'")
      .get() as { recipient: string; type: string; message: string }
    expect(row).toEqual({ recipient: 'admin', type: 'conversation', message: 'Your approval is needed' })
  })
})

describe('createConciergeProvider', () => {
  it('is unavailable and refuses to invoke without a resolved gateway session', async () => {
    const provider = createConciergeProvider({ sessionKey: null, model: '' })
    expect(provider.isAvailable()).toBe(false)
    await expect(provider.invoke({ prompt: 'hi', model: '' })).rejects.toThrow()
  })

  it('sends via the gateway and returns the completed text', async () => {
    const calls: string[] = []
    const provider = createConciergeProvider({
      sessionKey: 'agent:coordinator:main',
      model: '',
      gatewayCall: async <T>(method: string): Promise<T> => {
        calls.push(method)
        if (method === 'chat.send') return { runId: 'run-1' } as T
        return { status: 'complete', text: 'All on track.' } as T
      },
    })
    const result = await provider.invoke({ prompt: "How's everything?", model: '' })
    expect(result.text).toBe('All on track.')
    expect(calls).toEqual(['chat.send', 'agent.wait'])
  })
})

describe('probeCoordinatorStatus (real telemetry for the offline card)', () => {
  it('reports offline with reason no_coordinator_session when no session exists', () => {
    expect(probeCoordinatorStatus([], 'coordinator')).toEqual({
      status: 'offline',
      runId: null,
      lastSeen: null,
      reason: 'no_coordinator_session',
    })
  })

  it('reports online with the real session id + lastSeen when a live session exists', () => {
    const at = Date.UTC(2026, 5, 27, 9, 0, 0)
    const status = probeCoordinatorStatus([gatewaySession({ active: true, sessionId: 'sess-live', updatedAt: at })], 'coordinator')
    expect(status).toEqual({ status: 'online', runId: 'sess-live', lastSeen: new Date(at).toISOString(), reason: null })
  })

  it('reports offline with gateway_session_expired (real run_id + lastSeen) for a stale session', () => {
    const at = Date.UTC(2026, 5, 23, 9, 1, 44)
    const status = probeCoordinatorStatus([gatewaySession({ active: false, sessionId: 'sess-old', updatedAt: at })], 'coordinator')
    expect(status).toEqual({
      status: 'offline',
      runId: 'sess-old',
      lastSeen: new Date(at).toISOString(),
      reason: 'gateway_session_expired',
    })
  })

  it('ignores sessions for other agents (matches the coordinator only)', () => {
    expect(probeCoordinatorStatus([gatewaySession({ agent: 'main', key: 'agent:main:main', active: true })], 'coordinator').status).toBe('offline')
  })
})

describe('composeAskOrchestratorDeps', () => {
  it('wires the v1 internal-reversible action registry', () => {
    const deps = composeAskOrchestratorDeps(db, { username: 'admin', workspace_id: 1 })
    expect(deps.actionRegistry.get('create_followup_task')?.kind).toBe('internal-reversible')
    expect(deps.actionRegistry.get('notify_owner')?.kind).toBe('internal-reversible')
    expect(deps.actionRegistry.get('approve_and_send')).toBeUndefined() // S2
  })
})

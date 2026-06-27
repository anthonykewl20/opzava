import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import {
  composeAskOrchestratorDeps,
  createConciergeProvider,
  createFollowupTaskPort,
  notifyOwnerPort,
} from './compose'

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

describe('composeAskOrchestratorDeps', () => {
  it('wires the v1 internal-reversible action registry', () => {
    const deps = composeAskOrchestratorDeps(db, { username: 'admin', workspace_id: 1 })
    expect(deps.actionRegistry.get('create_followup_task')?.kind).toBe('internal-reversible')
    expect(deps.actionRegistry.get('notify_owner')?.kind).toBe('internal-reversible')
    expect(deps.actionRegistry.get('approve_and_send')).toBeUndefined() // S2
  })
})

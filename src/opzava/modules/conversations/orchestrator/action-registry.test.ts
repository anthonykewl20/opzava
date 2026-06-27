import { describe, expect, it, vi } from 'vitest'

import {
  createOrchestratorActionRegistry,
  makeCreateFollowupTaskAction,
  makeNotifyOwnerAction,
  type ActionExecCtx,
  type OrchestratorAction,
} from './action-registry'

function ctx(args: Record<string, unknown>): ActionExecCtx {
  return {
    conversationId: 'coord:admin:opzava',
    workspaceId: 1,
    actor: 'admin',
    actionId: 'act-1',
    args,
    now: () => 'now',
    newId: () => 'id-1',
  }
}

const fakeInternal = (actionType: string): OrchestratorAction => ({
  kind: 'internal-reversible',
  actionType,
  execute: async () => ({ resultTurn: { body: 'done' } }),
})

describe('OrchestratorActionRegistry (discriminated-union seam)', () => {
  it('resolves a registered action by type and lists all', () => {
    const reg = createOrchestratorActionRegistry([fakeInternal('a'), fakeInternal('b')])
    expect(reg.get('a')?.actionType).toBe('a')
    expect(reg.get('missing')).toBeUndefined()
    expect(reg.all().map((x) => x.actionType)).toEqual(['a', 'b'])
  })

  it('rejects a duplicate actionType at construction (closed registry)', () => {
    expect(() => createOrchestratorActionRegistry([fakeInternal('a'), fakeInternal('a')])).toThrow(/duplicate/i)
  })
})

describe('create_followup_task (internal-reversible)', () => {
  it('creates a follow-up task via the injected port and returns a result turn', async () => {
    const createFollowupTask = vi.fn(() => ({ cardId: 42 }))
    const action = makeCreateFollowupTaskAction({ createFollowupTask })
    expect(action.kind).toBe('internal-reversible')
    expect(action.actionType).toBe('create_followup_task')

    const result =
      action.kind === 'internal-reversible'
        ? await action.execute(ctx({ title: 'Chase the investor reply', projectId: 7 }))
        : null
    expect(createFollowupTask).toHaveBeenCalledWith({
      title: 'Chase the investor reply',
      projectId: 7,
      actor: 'admin',
      workspaceId: 1,
    })
    expect(result?.resultTurn.body).toContain('42')
  })
})

describe('notify_owner (internal-reversible)', () => {
  it('notifies the owner via the injected port and returns a result turn', async () => {
    const notifyOwner = vi.fn()
    const action = makeNotifyOwnerAction({ notifyOwner })
    const result =
      action.kind === 'internal-reversible'
        ? await action.execute(ctx({ projectId: 7, message: 'Your approval is needed' }))
        : null
    expect(notifyOwner).toHaveBeenCalledWith({ projectId: 7, message: 'Your approval is needed', actor: 'admin', workspaceId: 1 })
    expect(result?.resultTurn.body.length).toBeGreaterThan(0)
  })
})

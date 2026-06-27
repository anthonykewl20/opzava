import { describe, expect, it, vi } from 'vitest'

import { parseApproval, type Approval } from './contracts'
import {
  createApprovedActionRegistry,
  createPostApprovalDispatcher,
  type ApprovedActionHandler,
  type ApprovedActionOutcome,
  type ApprovedActionTurnSink,
} from './post-approval-dispatcher'

function approved(overrides: Partial<Approval> = {}): Approval {
  return parseApproval({
    schemaVersion: 1,
    approvalId: 'apr-1',
    requestedAction: 'campaign.send',
    target: { kind: 'external-action', id: 'campaign-send:c1' },
    status: 'approved',
    requesterId: 'system',
    approverId: 'admin',
    decisionReason: 'ok',
    requestedAt: 't0',
    decidedAt: 't1',
    expiresAt: null,
    correlation: { conversationId: 'coord:admin:opzava', runId: 'run-1' },
    ...overrides,
  })
}

function recordingSink() {
  const posted: Array<{ approvalId: string; outcome: ApprovedActionOutcome }> = []
  const sink: ApprovedActionTurnSink = {
    postOutcomeTurn: (input) => {
      posted.push({ approvalId: input.approvalId, outcome: input.outcome })
    },
  }
  return { sink, posted }
}

const triggeredHandler = (
  requestedAction: string,
  trigger = vi.fn(async (): Promise<ApprovedActionOutcome> => ({ kind: 'triggered', summary: 'sent' })),
): { handler: ApprovedActionHandler; trigger: typeof trigger } => ({
  handler: { requestedAction, trigger },
  trigger,
})

describe('PostApprovalDispatcher', () => {
  it('triggers the registered handler and posts a correlated outcome turn', async () => {
    const { handler, trigger } = triggeredHandler('campaign.send')
    const { sink, posted } = recordingSink()
    const dispatcher = createPostApprovalDispatcher({
      registry: createApprovedActionRegistry([handler]),
      turnSink: sink,
    })

    const result = await dispatcher.dispatch(approved())

    expect(trigger).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ status: 'dispatched', requestedAction: 'campaign.send', turnPosted: true })
    expect(posted).toEqual([{ approvalId: 'apr-1', outcome: { kind: 'triggered', summary: 'sent' } }])
  })

  it('is a no-op for an approval that is not granted (handler never runs)', async () => {
    const { handler, trigger } = triggeredHandler('campaign.send')
    const { sink, posted } = recordingSink()
    const dispatcher = createPostApprovalDispatcher({ registry: createApprovedActionRegistry([handler]), turnSink: sink })

    const result = await dispatcher.dispatch(
      approved({ status: 'requested', approverId: null, decisionReason: null, decidedAt: null }),
    )

    expect(result).toEqual({ status: 'no-op', reason: 'not-approved' })
    expect(trigger).not.toHaveBeenCalled()
    expect(posted).toEqual([])
  })

  it('is a no-op for an unknown requestedAction and signals onUnknownAction', async () => {
    const { sink, posted } = recordingSink()
    const onUnknownAction = vi.fn()
    const dispatcher = createPostApprovalDispatcher({
      registry: createApprovedActionRegistry([]),
      turnSink: sink,
      onUnknownAction,
    })

    const result = await dispatcher.dispatch(approved({ requestedAction: 'mint.coins' }))

    expect(result).toEqual({ status: 'no-op', reason: 'unknown-action' })
    expect(onUnknownAction).toHaveBeenCalledOnce()
    expect(posted).toEqual([])
  })

  it('triggers the handler but posts NO turn when the approval is un-correlated (→ Digest)', async () => {
    const { handler, trigger } = triggeredHandler('campaign.send')
    const { sink, posted } = recordingSink()
    const dispatcher = createPostApprovalDispatcher({ registry: createApprovedActionRegistry([handler]), turnSink: sink })

    const result = await dispatcher.dispatch(approved({ correlation: null }))

    expect(trigger).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ status: 'dispatched', turnPosted: false })
    expect(posted).toEqual([])
  })

  it('surfaces a failed outcome turn when the handler throws — never rethrows', async () => {
    const trigger = vi.fn(async (): Promise<ApprovedActionOutcome> => {
      throw new Error('provider exploded')
    })
    const { sink, posted } = recordingSink()
    const onError = vi.fn()
    const dispatcher = createPostApprovalDispatcher({
      registry: createApprovedActionRegistry([{ requestedAction: 'campaign.send', trigger }]),
      turnSink: sink,
      onError,
    })

    const result = await dispatcher.dispatch(approved())

    expect(result.status).toBe('dispatched')
    expect(result).toMatchObject({ outcome: { kind: 'failed', errorKind: 'handler-threw' }, turnPosted: true })
    expect(posted[0]?.outcome.kind).toBe('failed')
    expect(onError).toHaveBeenCalledWith('trigger', expect.anything(), expect.any(Error))
  })

  it('is safe to dispatch twice — idempotency is delegated to the handler (already-done)', async () => {
    let calls = 0
    const trigger = vi.fn(async (): Promise<ApprovedActionOutcome> => {
      calls += 1
      return calls === 1 ? { kind: 'triggered', summary: 'sent' } : { kind: 'already-done', summary: 'already sent' }
    })
    const { sink, posted } = recordingSink()
    const dispatcher = createPostApprovalDispatcher({
      registry: createApprovedActionRegistry([{ requestedAction: 'campaign.send', trigger }]),
      turnSink: sink,
    })

    await dispatcher.dispatch(approved())
    await dispatcher.dispatch(approved())

    expect(posted.map((p) => p.outcome.kind)).toEqual(['triggered', 'already-done'])
  })

  it('rejects a duplicate handler registration', () => {
    expect(() =>
      createApprovedActionRegistry([
        { requestedAction: 'campaign.send', trigger: vi.fn() },
        { requestedAction: 'campaign.send', trigger: vi.fn() },
      ]),
    ).toThrow(/duplicate/i)
  })
})

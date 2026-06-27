import { describe, expect, it } from 'vitest'

import {
  isApprovalGranted,
  parseApproval,
  transitionApprovalStatus,
} from './contracts'

describe('Opzava approval contracts', () => {
  it('accepts approval requests for external actions without granting them by default', () => {
    const approval = parseApproval({
      schemaVersion: 1,
      approvalId: 'approval_wordpress_draft_001',
      requestedAction: 'create-wordpress-draft',
      target: {
        kind: 'external-action',
        id: 'external_action_wordpress_draft_001',
      },
      status: 'requested',
      requesterId: 'system:workflow-runner',
      approverId: null,
      decisionReason: null,
      requestedAt: '2026-06-15T00:00:00.000Z',
      decidedAt: null,
      expiresAt: '2026-06-22T00:00:00.000Z',
    })

    expect(approval.status).toBe('requested')
    expect(isApprovalGranted(approval)).toBe(false)
  })

  it('grants side effects only after an explicit approved transition', () => {
    const requested = parseApproval({
      schemaVersion: 1,
      approvalId: 'approval_wordpress_draft_001',
      requestedAction: 'create-wordpress-draft',
      target: {
        kind: 'external-action',
        id: 'external_action_wordpress_draft_001',
      },
      status: 'requested',
      requesterId: 'system:workflow-runner',
      approverId: null,
      decisionReason: null,
      requestedAt: '2026-06-15T00:00:00.000Z',
      decidedAt: null,
      expiresAt: '2026-06-22T00:00:00.000Z',
    })

    const approved = transitionApprovalStatus(requested, {
      status: 'approved',
      approverId: 'admin:1',
      decisionReason: 'Draft reviewed and approved for creation',
      decidedAt: '2026-06-15T01:00:00.000Z',
    })

    expect(approved.status).toBe('approved')
    expect(approved.approverId).toBe('admin:1')
    expect(isApprovalGranted(approved)).toBe(true)
  })

  it('carries an optional conversation correlation lineage, defaulting to null', () => {
    const withCorrelation = parseApproval({
      schemaVersion: 1,
      approvalId: 'approval_corr_001',
      requestedAction: 'campaign.send',
      target: { kind: 'external-action', id: 'campaign-send:c1' },
      status: 'requested',
      requesterId: 'system:workflow-runner',
      approverId: null,
      decisionReason: null,
      requestedAt: '2026-06-27T00:00:00.000Z',
      decidedAt: null,
      expiresAt: null,
      correlation: { conversationId: 'coord:admin:opzava', runId: 'run_abc' },
    })
    expect(withCorrelation.correlation).toEqual({ conversationId: 'coord:admin:opzava', runId: 'run_abc' })

    const withoutCorrelation = parseApproval({
      schemaVersion: 1,
      approvalId: 'approval_corr_002',
      requestedAction: 'campaign.send',
      target: { kind: 'external-action', id: 'campaign-send:c2' },
      status: 'requested',
      requesterId: 'system:workflow-runner',
      approverId: null,
      decisionReason: null,
      requestedAt: '2026-06-27T00:00:00.000Z',
      decidedAt: null,
      expiresAt: null,
    })
    expect(withoutCorrelation.correlation).toBeNull()
  })

  it('preserves correlation lineage across a status transition', () => {
    const requested = parseApproval({
      schemaVersion: 1,
      approvalId: 'approval_corr_003',
      requestedAction: 'campaign.send',
      target: { kind: 'external-action', id: 'campaign-send:c3' },
      status: 'requested',
      requesterId: 'system:workflow-runner',
      approverId: null,
      decisionReason: null,
      requestedAt: '2026-06-27T00:00:00.000Z',
      decidedAt: null,
      expiresAt: null,
      correlation: { conversationId: 'coord:admin:opzava', runId: 'run_xyz' },
    })

    const approved = transitionApprovalStatus(requested, {
      status: 'approved',
      approverId: 'admin:1',
      decisionReason: 'send it',
      decidedAt: '2026-06-27T01:00:00.000Z',
    })

    expect(approved.correlation).toEqual({ conversationId: 'coord:admin:opzava', runId: 'run_xyz' })
  })

  it('rejects attempts to reopen terminal approval decisions', () => {
    const rejected = parseApproval({
      schemaVersion: 1,
      approvalId: 'approval_wordpress_draft_001',
      requestedAction: 'create-wordpress-draft',
      target: {
        kind: 'external-action',
        id: 'external_action_wordpress_draft_001',
      },
      status: 'rejected',
      requesterId: 'system:workflow-runner',
      approverId: 'admin:1',
      decisionReason: 'Sources need another review',
      requestedAt: '2026-06-15T00:00:00.000Z',
      decidedAt: '2026-06-15T01:00:00.000Z',
      expiresAt: '2026-06-22T00:00:00.000Z',
    })

    expect(() =>
      transitionApprovalStatus(rejected, {
        status: 'requested',
        approverId: null,
        decisionReason: null,
        decidedAt: null,
      }),
    ).toThrow(/invalid approval transition/i)
  })
})

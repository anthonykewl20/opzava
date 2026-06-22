import { describe, it, expect } from 'vitest'
import {
  createCampaignSendApproval,
  isCampaignSendApproved,
  campaignSendApprovalId,
  CAMPAIGN_SEND_REQUESTED_ACTION,
} from './campaign-send-approval'
import { parseApproval } from '@/opzava/core/approvals/contracts'

const NOW = '2026-07-05T00:00:00.000Z'

describe('campaign send approval', () => {
  it('mints a granted approval targeting the campaign send action', () => {
    const approval = createCampaignSendApproval({ campaignId: 'camp-1', approverId: 'admin', now: NOW })
    expect(approval.status).toBe('approved')
    expect(approval.approvalId).toBe(campaignSendApprovalId('camp-1'))
    expect(approval.requestedAction).toBe(CAMPAIGN_SEND_REQUESTED_ACTION)
    expect(approval.target).toEqual({ kind: 'external-action', id: 'camp-1' })
    expect(approval.approverId).toBe('admin')
    expect(approval.decidedAt).toBe(NOW)
  })

  it('mints a bounded expiry (default 7 days from now), required by the live-provider guard', () => {
    const approval = createCampaignSendApproval({ campaignId: 'camp-1', approverId: 'admin', now: NOW })
    expect(approval.expiresAt).toBe('2026-07-12T00:00:00.000Z') // NOW + 7 days
  })

  it('honours an explicit expiry and a custom ttl', () => {
    expect(
      createCampaignSendApproval({ campaignId: 'c', approverId: 'a', now: NOW, expiresAt: '2026-08-01T00:00:00.000Z' }).expiresAt,
    ).toBe('2026-08-01T00:00:00.000Z')
    expect(
      createCampaignSendApproval({ campaignId: 'c', approverId: 'a', now: NOW, ttlMs: 60 * 60 * 1000 }).expiresAt,
    ).toBe('2026-07-05T01:00:00.000Z') // NOW + 1 hour
  })

  it('accepts a granted approval that targets the campaign', () => {
    const approval = createCampaignSendApproval({ campaignId: 'camp-1', approverId: 'admin', now: NOW })
    expect(isCampaignSendApproved(approval, 'camp-1')).toBe(true)
  })

  it('rejects a missing approval', () => {
    expect(isCampaignSendApproved(null, 'camp-1')).toBe(false)
  })

  it('rejects an approval for a different campaign', () => {
    const approval = createCampaignSendApproval({ campaignId: 'other', approverId: 'admin', now: NOW })
    expect(isCampaignSendApproved(approval, 'camp-1')).toBe(false)
  })

  it('rejects a granted approval for a different requested action', () => {
    const wrongAction = parseApproval({
      schemaVersion: 1,
      approvalId: campaignSendApprovalId('camp-1'),
      requestedAction: 'campaign.publish',
      target: { kind: 'external-action', id: 'camp-1' },
      status: 'approved',
      requesterId: 'admin',
      approverId: 'admin',
      decisionReason: 'ok',
      requestedAt: NOW,
      decidedAt: NOW,
      expiresAt: null,
    })
    expect(isCampaignSendApproved(wrongAction, 'camp-1')).toBe(false)
  })

  it('rejects a granted approval whose target is not an external action', () => {
    const wrongKind = parseApproval({
      schemaVersion: 1,
      approvalId: campaignSendApprovalId('camp-1'),
      requestedAction: CAMPAIGN_SEND_REQUESTED_ACTION,
      target: { kind: 'artifact', id: 'camp-1' },
      status: 'approved',
      requesterId: 'admin',
      approverId: 'admin',
      decisionReason: 'ok',
      requestedAt: NOW,
      decidedAt: NOW,
      expiresAt: null,
    })
    expect(isCampaignSendApproved(wrongKind, 'camp-1')).toBe(false)
  })

  it('rejects a non-granted approval (e.g. rejected)', () => {
    const rejected = parseApproval({
      schemaVersion: 1,
      approvalId: campaignSendApprovalId('camp-1'),
      requestedAction: CAMPAIGN_SEND_REQUESTED_ACTION,
      target: { kind: 'external-action', id: 'camp-1' },
      status: 'rejected',
      requesterId: 'admin',
      approverId: 'admin',
      decisionReason: 'no',
      requestedAt: NOW,
      decidedAt: NOW,
      expiresAt: null,
    })
    expect(isCampaignSendApproved(rejected, 'camp-1')).toBe(false)
  })
})

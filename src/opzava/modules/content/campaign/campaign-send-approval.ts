import { parseApproval, isApprovalGranted, type Approval } from '@/opzava/core/approvals/contracts'

/**
 * A campaign send is a live external action and must be gated by a real, persisted `Approval`
 * record — not a hardcoded flag. Approving a campaign mints a granted approval (F1); the send path
 * refuses unless that approval exists, is granted, and targets this campaign.
 */
export const CAMPAIGN_SEND_REQUESTED_ACTION = 'campaign.send'

// A live send is gated by the provider guard, which requires every approval for a live action to
// carry a bounded expiry (an eternal send approval is a standing liability). 7 days is the default
// window from approval; the approver may override it.
export const DEFAULT_CAMPAIGN_SEND_APPROVAL_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function campaignSendApprovalId(campaignId: string): string {
  return `campaign-send:${campaignId}`
}

export type CreateCampaignSendApprovalInput = Readonly<{
  campaignId: string
  approverId: string
  now: string
  decisionReason?: string
  /** Explicit expiry; defaults to `now + ttlMs`. */
  expiresAt?: string
  ttlMs?: number
}>

function defaultExpiry(now: string, ttlMs: number): string {
  return new Date(new Date(now).getTime() + ttlMs).toISOString()
}

export function createCampaignSendApproval(input: CreateCampaignSendApprovalInput): Approval {
  const expiresAt =
    input.expiresAt ?? defaultExpiry(input.now, input.ttlMs ?? DEFAULT_CAMPAIGN_SEND_APPROVAL_TTL_MS)
  return parseApproval({
    schemaVersion: 1,
    approvalId: campaignSendApprovalId(input.campaignId),
    requestedAction: CAMPAIGN_SEND_REQUESTED_ACTION,
    target: { kind: 'external-action', id: input.campaignId },
    status: 'approved',
    requesterId: input.approverId,
    approverId: input.approverId,
    decisionReason: input.decisionReason ?? 'campaign approved for sending',
    requestedAt: input.now,
    decidedAt: input.now,
    expiresAt,
  })
}

/** True only when a granted approval targets exactly this campaign's send action. */
export function isCampaignSendApproved(approval: Approval | null, campaignId: string): boolean {
  if (!approval) return false
  return (
    isApprovalGranted(approval) &&
    approval.requestedAction === CAMPAIGN_SEND_REQUESTED_ACTION &&
    approval.target.kind === 'external-action' &&
    approval.target.id === campaignId
  )
}

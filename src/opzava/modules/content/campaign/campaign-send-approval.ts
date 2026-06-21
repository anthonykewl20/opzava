import { parseApproval, isApprovalGranted, type Approval } from '@/opzava/core/approvals/contracts'

/**
 * A campaign send is a live external action and must be gated by a real, persisted `Approval`
 * record — not a hardcoded flag. Approving a campaign mints a granted approval (F1); the send path
 * refuses unless that approval exists, is granted, and targets this campaign.
 */
export const CAMPAIGN_SEND_REQUESTED_ACTION = 'campaign.send'

export function campaignSendApprovalId(campaignId: string): string {
  return `campaign-send:${campaignId}`
}

export type CreateCampaignSendApprovalInput = Readonly<{
  campaignId: string
  approverId: string
  now: string
  decisionReason?: string
}>

export function createCampaignSendApproval(input: CreateCampaignSendApprovalInput): Approval {
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
    expiresAt: null,
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

import { parseApproval, type Approval } from '@/opzava/core/approvals/contracts'

export type SocialApprovalDecision = Readonly<{
  status: 'approved' | 'rejected'
  approverId: string
  decisionReason: string
}>

export type SocialApprovalProvider = (input: Readonly<{ postDraftArtifactId: string }>) => SocialApprovalDecision

export type SocialApprovalStepInput = Readonly<{
  postDraftArtifactId: string
  requesterId: string
  requestedAt: string
}>

export function parseSocialApprovalStepInput(payload: unknown): SocialApprovalStepInput {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('invalid social approval input')
  }
  const r = payload as Record<string, unknown>
  const postDraftArtifactId = r['postDraftArtifactId']
  const requesterId = r['requesterId']
  const requestedAt = r['requestedAt']
  if (
    typeof postDraftArtifactId !== 'string' || postDraftArtifactId.length === 0 ||
    typeof requesterId !== 'string' || requesterId.length === 0 ||
    typeof requestedAt !== 'string' || requestedAt.length === 0
  ) {
    throw new Error('invalid social approval input')
  }
  return Object.freeze({ postDraftArtifactId, requesterId, requestedAt })
}

export function createMockSocialApprovalProvider(): SocialApprovalProvider {
  return () => Object.freeze({
    status: 'approved' as const,
    approverId: 'social-lead@opzava.test',
    decisionReason: 'Approved for scheduling after review.',
  })
}

export type SocialApprovalStepDeps = Readonly<{
  provider: SocialApprovalProvider
  newId: () => string
  now: () => string
}>

export function createSocialApprovalStepService(
  deps: SocialApprovalStepDeps,
): Readonly<{ run: (payload: unknown) => Approval }> {
  return {
    run: (payload: unknown): Approval => {
      const input = parseSocialApprovalStepInput(payload)
      const decision = deps.provider({ postDraftArtifactId: input.postDraftArtifactId })
      return parseApproval({
        schemaVersion: 1,
        approvalId: deps.newId(),
        requestedAction: 'social-publish',
        target: { kind: 'artifact', id: input.postDraftArtifactId },
        status: decision.status,
        requesterId: input.requesterId,
        approverId: decision.approverId,
        decisionReason: decision.decisionReason,
        requestedAt: input.requestedAt,
        decidedAt: deps.now(),
        expiresAt: null,
      })
    },
  }
}

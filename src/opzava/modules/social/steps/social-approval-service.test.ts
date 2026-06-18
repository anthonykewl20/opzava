import { describe, it, expect } from 'vitest'
import {
  createSocialApprovalStepService,
  createMockSocialApprovalProvider,
  parseSocialApprovalStepInput,
  type SocialApprovalProvider,
} from './social-approval-service'

const validInput = {
  postDraftArtifactId: 'soc-1',
  requesterId: 'system',
  requestedAt: '2026-07-01T00:00:00.000Z',
}

const deps = (provider?: SocialApprovalProvider) => ({
  provider: provider ?? createMockSocialApprovalProvider(),
  newId: () => 'apr-soc-1',
  now: () => '2026-07-02T00:00:00.000Z',
})

describe('social-approval-service', () => {
  it('produces an approved Approval targeting the post draft', () => {
    const ap = createSocialApprovalStepService(deps()).run(validInput)
    expect(ap.status).toBe('approved')
    expect(ap.target).toEqual({ kind: 'artifact', id: 'soc-1' })
    expect(ap.requestedAction).toBe('social-publish')
    expect(ap.approverId).toBe('social-lead@opzava.test')
    expect(ap.decidedAt).toBe('2026-07-02T00:00:00.000Z')
    expect(ap.approvalId).toBe('apr-soc-1')
  })

  it('produces a rejected Approval with the decision reason', () => {
    const provider: SocialApprovalProvider = () => ({
      status: 'rejected' as const,
      approverId: 'social-lead@opzava.test',
      decisionReason: 'Needs a stronger hook.',
    })
    const ap = createSocialApprovalStepService(deps(provider)).run(validInput)
    expect(ap.status).toBe('rejected')
    expect(ap.decisionReason).toBe('Needs a stronger hook.')
    expect(ap.approverId).toBe('social-lead@opzava.test')
  })

  it('the result is a frozen Approval (not an Artifact)', () => {
    const ap = createSocialApprovalStepService(deps()).run(validInput)
    expect(Object.isFrozen(ap)).toBe(true)
    expect(ap).not.toHaveProperty('artifactType')
    expect(ap).toHaveProperty('approvalId')
  })

  it('parseSocialApprovalStepInput rejects a missing field', () => {
    expect(() => parseSocialApprovalStepInput({ postDraftArtifactId: 'a', requesterId: 'r' }))
      .toThrow(/invalid social approval input/)
  })

  it('createMockSocialApprovalProvider returns a deterministic approved decision', () => {
    const d = createMockSocialApprovalProvider()({ postDraftArtifactId: 'x' })
    expect(d.status).toBe('approved')
    expect(d.approverId).toBeTruthy()
    expect(d.decisionReason).toBeTruthy()
  })
})

import type { ArticleDraft } from '../contracts/article-draft'

export type HumanApprovalProviderInput = Readonly<{ articleDraft: ArticleDraft }>

export type HumanApprovalDecision = Readonly<{
  status: 'approved' | 'rejected'
  approverId: string
  decisionReason: string
}>

export type HumanApprovalProvider = (input: HumanApprovalProviderInput) => HumanApprovalDecision

export function createMockHumanApprovalProvider(): HumanApprovalProvider {
  return () =>
    Object.freeze({
      status: 'approved',
      approverId: 'editor@opzava.test',
      decisionReason: 'Approved for publishing after passing all quality gates',
    })
}

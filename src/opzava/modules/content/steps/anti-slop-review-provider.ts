import type { ArticleDraft } from '../contracts/article-draft'
import type { SlopFinding } from '../contracts/anti-slop-review'

export type AntiSlopReviewProviderInput = Readonly<{ articleDraft: ArticleDraft }>

export type AntiSlopReviewDraft = Readonly<{ status: 'passed' | 'rejected'; detectedPatterns: readonly SlopFinding[] }>

export type AntiSlopReviewProvider = (input: AntiSlopReviewProviderInput) => AntiSlopReviewDraft

export function createMockAntiSlopReviewProvider(): AntiSlopReviewProvider {
  return () => Object.freeze({ status: 'passed' as const, detectedPatterns: [] })
}

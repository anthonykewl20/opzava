import type { ArticleDraft } from '../contracts/article-draft'
import type { BrandCheck } from '../contracts/brand-review'

export type BrandReviewProviderInput = Readonly<{ articleDraft: ArticleDraft }>

export type BrandReviewDraft = Readonly<{ status: 'passed' | 'changes-requested'; checks: readonly BrandCheck[] }>

export type BrandReviewProvider = (input: BrandReviewProviderInput) => BrandReviewDraft

export function createMockBrandReviewProvider(): BrandReviewProvider {
  const checks: readonly BrandCheck[] = (['voice', 'structure', 'positioning', 'clarity', 'tone'] as const).map(
    (dimension) => ({ dimension, verdict: 'pass' as const })
  )
  return () => Object.freeze({ status: 'passed' as const, checks })
}

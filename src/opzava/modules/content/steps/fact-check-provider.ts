import type { ArticleDraft } from '../contracts/article-draft'
import type { SourceCapture } from '../contracts/source-capture'
import type { FactCheck } from '../contracts/fact-check-report'

export type FactCheckProviderInput = Readonly<{
  articleDraft: ArticleDraft
  sourceCapture: SourceCapture
}>

export type FactCheckDraft = Readonly<{
  status: 'passed' | 'failed'
  checks: readonly FactCheck[]
}>

export type FactCheckProvider = (input: FactCheckProviderInput) => FactCheckDraft

export function createMockFactCheckProvider(): FactCheckProvider {
  return (input) => {
    const checks = input.articleDraft.sections.map((section) => ({
      claim: `Section "${section.heading}" is supported by its cited sources`,
      verdict: 'supported' as const,
      sourceIds: section.supportingSourceIds
    }))
    return Object.freeze({ status: 'passed' as const, checks })
  }
}

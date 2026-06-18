import type { IdeaIntake } from '../contracts/idea-intake'
import type { KeywordResearch } from '../contracts/keyword-research'
import type { SourceCapture } from '../contracts/source-capture'

export type SeoBriefProviderInput = Readonly<{
  idea: IdeaIntake
  keywordResearch: KeywordResearch
  sourceCapture: SourceCapture
}>

export type SeoBriefDraft = Readonly<{
  targetAudience: string
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational'
  recommendedHeadings: readonly string[]
  wordCountTarget: number
  secondaryKeywords?: readonly string[]
}>

export type SeoBriefProvider = (input: SeoBriefProviderInput) => SeoBriefDraft

export function createMockSeoBriefProvider(): SeoBriefProvider {
  return (input) => {
    const targetAudience = input.idea.targetAudience ?? `Readers interested in ${input.idea.topic}`
    const searchIntent: SeoBriefDraft['searchIntent'] = 'informational'
    const recommendedHeadings = Object.freeze([
      `What is ${input.idea.topic}`,
      `How ${input.idea.topic} works`,
      `Best practices for ${input.idea.topic}`,
    ]) as readonly string[]
    const wordCountTarget = 1500
    const secondaryKeywords = Object.freeze(
      input.keywordResearch.candidates
        .map((c) => c.term)
        .filter((t) => t !== input.keywordResearch.primaryKeyword),
    ) as readonly string[]
    return Object.freeze({
      targetAudience,
      searchIntent,
      recommendedHeadings,
      wordCountTarget,
      secondaryKeywords,
    })
  }
}

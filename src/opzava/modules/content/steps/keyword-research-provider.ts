import type { IdeaIntake } from '../contracts/idea-intake'
import type { KeywordCandidate } from '../contracts/keyword-research'

export type KeywordResearchDraft = Readonly<{
  primaryKeyword: string
  candidates: readonly KeywordCandidate[]
}>

export type KeywordResearchProvider = (idea: IdeaIntake) => KeywordResearchDraft

export function createMockKeywordResearchProvider(): KeywordResearchProvider {
  return (idea: IdeaIntake): KeywordResearchDraft => {
    const primary = idea.targetKeyword ?? idea.topic
    const candidates: readonly KeywordCandidate[] = Object.freeze([
      Object.freeze({ term: primary, searchVolume: 1000, difficulty: 40 }),
      Object.freeze({ term: `${idea.topic} guide`, searchVolume: 500, difficulty: 30 }),
      Object.freeze({ term: `best ${idea.topic}`, searchVolume: 300, difficulty: 25 })
    ])
    return Object.freeze({ primaryKeyword: primary, candidates })
  }
}

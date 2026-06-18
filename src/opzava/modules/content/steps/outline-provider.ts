import type { IdeaIntake } from '../contracts/idea-intake'
import type { SeoBrief } from '../contracts/seo-brief'
import type { OutlineSection } from '../contracts/outline'

export type OutlineProviderInput = Readonly<{ idea: IdeaIntake; seoBrief: SeoBrief }>

export type OutlineDraft = Readonly<{ title: string; sections: readonly OutlineSection[] }>

export type OutlineProvider = (input: OutlineProviderInput) => OutlineDraft

export function createMockOutlineProvider(): OutlineProvider {
  return (input) => {
    const title = input.idea.title
    const sections = input.seoBrief.recommendedHeadings.map((heading) =>
      Object.freeze({ heading, keyPoints: [`Key point about ${heading}`] })
    )
    return Object.freeze({ title, sections: Object.freeze(sections) })
  }
}

import type { IdeaIntake } from '../contracts/idea-intake'
import type { Outline } from '../contracts/outline'
import type { SourceCapture } from '../contracts/source-capture'
import type { ArticleSection } from '../contracts/article-draft'

export type ArticleDraftProviderInput = Readonly<{
  idea: IdeaIntake
  outline: Outline
  sourceCapture: SourceCapture
}>

export type ArticleDraftDraft = Readonly<{
  title: string
  sections: readonly ArticleSection[]
  wordCount: number
}>

export type ArticleDraftProvider = (input: ArticleDraftProviderInput) => ArticleDraftDraft

export function createMockArticleDraftProvider(): ArticleDraftProvider {
  return (input) => {
    const sourceIds = input.sourceCapture.sources.map((s) => s.sourceId)
    const sections = input.outline.sections.map((section) => ({
      heading: section.heading,
      body: `Draft prose for ${section.heading}. ${section.keyPoints.join(' ')}`,
      supportingSourceIds: [sourceIds[0]]
    }))
    const wordCount = sections.reduce((n, s) => n + s.body.split(/\s+/).length, 0)
    return Object.freeze({
      title: input.outline.title,
      sections,
      wordCount
    })
  }
}

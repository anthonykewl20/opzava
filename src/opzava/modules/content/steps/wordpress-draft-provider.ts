import type { ArticleDraft } from '../contracts/article-draft'

export type WordpressDraftProviderInput = Readonly<{
  articleDraft: ArticleDraft
}>

export type WordpressDraftRender = Readonly<{
  bodyMarkdown: string
}>

export type WordpressDraftProvider = (input: WordpressDraftProviderInput) => WordpressDraftRender

export function createMockWordpressDraftProvider(): WordpressDraftProvider {
  return (input) => {
    const heading = `# ${input.articleDraft.title}`
    const body = input.articleDraft.sections
      .map((s) => `## ${s.heading}\n\n${s.body}`)
      .join('\n\n')
    const bodyMarkdown = `${heading}\n\n${body}`
    return Object.freeze({ bodyMarkdown })
  }
}

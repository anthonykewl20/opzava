import { parseProviderProfile, parseProviderAdapterResult, type ProviderAdapter, type ProviderAdapterRequest, type ProviderAdapterResult, type ProviderProfile } from '@/opzava/platform/providers/contracts'
import { z } from 'zod'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { parseOutline } from '../contracts/outline'
import { parseSourceCapture } from '../contracts/source-capture'
import { createMockArticleDraftProvider } from '../steps/article-draft-provider'

export const ARTICLE_DRAFT_OPERATION = 'article-draft'

export function createMockArticleDraftProviderProfile(): ProviderProfile {
  return parseProviderProfile({
    schemaVersion: 1,
    providerId: 'mock-article-draft',
    displayName: 'Mock Article Draft Provider',
    kind: 'llm',
    mode: 'mock',
    config: { allowedOperations: [ARTICLE_DRAFT_OPERATION] }
  })
}

export function createMockArticleDraftProviderAdapter(deps: Readonly<{ now: () => string }>): ProviderAdapter {
  return Object.freeze({
    execute: async (request: ProviderAdapterRequest, _signal: AbortSignal): Promise<ProviderAdapterResult> => {
      const inputSchema = z.object({
        idea: z.unknown(),
        outline: z.unknown(),
        sourceCapture: z.unknown()
      }).strict()

      const parsed = inputSchema.parse(request.input)
      const idea = parseIdeaIntake(parsed.idea)
      const outline = parseOutline(parsed.outline)
      const sourceCapture = parseSourceCapture(parsed.sourceCapture)

      const draft = createMockArticleDraftProvider()({ idea, outline, sourceCapture })

      return parseProviderAdapterResult({
        schemaVersion: 1,
        requestId: request.requestId,
        status: 'succeeded',
        output: {
          title: draft.title,
          sections: draft.sections.map((s) => ({
            heading: s.heading,
            body: s.body,
            supportingSourceIds: [...s.supportingSourceIds]
          })),
          wordCount: draft.wordCount
        },
        outputSummary: {
          sectionCount: draft.sections.length,
          wordCount: draft.wordCount
        },
        error: null,
        finishedAt: deps.now()
      })
    }
  })
}

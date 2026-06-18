import { parseProviderProfile, parseProviderAdapterResult, type ProviderAdapter, type ProviderAdapterRequest, type ProviderAdapterResult, type ProviderProfile } from '@/opzava/platform/providers/contracts'
import { z } from 'zod'
import { parseArticleDraft } from '../contracts/article-draft'
import { parseSourceCapture } from '../contracts/source-capture'
import { createMockFactCheckProvider } from '../steps/fact-check-provider'

export const FACT_CHECK_OPERATION = 'fact-check'

export function createMockFactCheckProviderProfile(): ProviderProfile {
  return parseProviderProfile({
    schemaVersion: 1,
    providerId: 'mock-fact-check',
    displayName: 'Mock Fact Check Provider',
    kind: 'llm',
    mode: 'mock',
    config: { allowedOperations: [FACT_CHECK_OPERATION] }
  })
}

export function createMockFactCheckProviderAdapter(deps: Readonly<{ now: () => string }>): ProviderAdapter {
  return Object.freeze({
    execute: async (request: ProviderAdapterRequest, _signal: AbortSignal): Promise<ProviderAdapterResult> => {
      const inputSchema = z.object({
        articleDraft: z.unknown(),
        sourceCapture: z.unknown()
      }).strict()

      const parsed = inputSchema.parse(request.input)
      const articleDraft = parseArticleDraft(parsed.articleDraft)
      const sourceCapture = parseSourceCapture(parsed.sourceCapture)

      const draft = createMockFactCheckProvider()({ articleDraft, sourceCapture })

      return parseProviderAdapterResult({
        schemaVersion: 1,
        requestId: request.requestId,
        status: 'succeeded',
        output: {
          status: draft.status,
          checks: draft.checks.map((c) => ({
            claim: c.claim,
            verdict: c.verdict,
            sourceIds: [...c.sourceIds],
            ...(c.note !== undefined ? { note: c.note } : {})
          }))
        },
        outputSummary: {
          status: draft.status,
          checkCount: draft.checks.length
        },
        error: null,
        finishedAt: deps.now()
      })
    }
  })
}

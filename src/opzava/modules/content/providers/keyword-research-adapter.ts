import { parseProviderAdapterResult, parseProviderProfile, type ProviderAdapter, type ProviderAdapterRequest, type ProviderAdapterResult, type ProviderProfile } from '@/opzava/platform/providers/contracts'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { createMockKeywordResearchProvider } from '../steps/keyword-research-provider'

export const KEYWORD_RESEARCH_OPERATION = 'keyword-research'

export function createMockKeywordResearchProviderProfile(): ProviderProfile {
  return parseProviderProfile({
    schemaVersion: 1,
    providerId: 'mock-keyword-research',
    displayName: 'Mock Keyword Research Provider',
    kind: 'search',
    mode: 'mock',
    config: {
      allowedOperations: [KEYWORD_RESEARCH_OPERATION]
    }
  })
}

export function createMockKeywordResearchProviderAdapter(
  deps: Readonly<{ now: () => string }>
): ProviderAdapter {
  return Object.freeze({
    execute: async (
      request: ProviderAdapterRequest,
      _signal: AbortSignal
    ): Promise<ProviderAdapterResult> => {
      const idea = parseIdeaIntake(request.input)
      const draft = createMockKeywordResearchProvider()(idea)

      return parseProviderAdapterResult({
        schemaVersion: 1,
        requestId: request.requestId,
        status: 'succeeded',
        output: {
          primaryKeyword: draft.primaryKeyword,
          candidates: draft.candidates.map((c) => ({
            term: c.term,
            ...(c.searchVolume !== undefined ? { searchVolume: c.searchVolume } : {}),
            ...(c.difficulty !== undefined ? { difficulty: c.difficulty } : {})
          }))
        },
        outputSummary: {
          primaryKeyword: draft.primaryKeyword,
          candidateCount: draft.candidates.length
        },
        error: null,
        finishedAt: deps.now()
      })
    }
  })
}

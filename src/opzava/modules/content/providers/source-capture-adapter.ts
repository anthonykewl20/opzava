import { parseProviderProfile, parseProviderAdapterResult, type ProviderAdapter, type ProviderAdapterRequest, type ProviderAdapterResult, type ProviderProfile } from '@/opzava/platform/providers/contracts'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { createMockSourceCaptureProvider } from '../steps/source-capture-provider'

export const SOURCE_CAPTURE_OPERATION = 'source-capture'

export function createMockSourceCaptureProviderProfile(): ProviderProfile {
  return parseProviderProfile({
    schemaVersion: 1,
    providerId: 'mock-source-capture',
    displayName: 'Mock Source Capture Provider',
    kind: 'search',
    mode: 'mock',
    config: { allowedOperations: [SOURCE_CAPTURE_OPERATION] }
  })
}

export function createMockSourceCaptureProviderAdapter(deps: Readonly<{ now: () => string }>): ProviderAdapter {
  return Object.freeze({
    execute: async (request: ProviderAdapterRequest, _signal: AbortSignal): Promise<ProviderAdapterResult> => {
      const idea = parseIdeaIntake(request.input)
      const draft = createMockSourceCaptureProvider()(idea)
      return parseProviderAdapterResult({
        schemaVersion: 1,
        requestId: request.requestId,
        status: 'succeeded',
        output: {
          sources: draft.sources.map((s) => ({
            sourceId: s.sourceId,
            origin: s.origin,
            capturedAt: s.capturedAt,
            extractionSummary: s.extractionSummary,
            ...(s.trustNotes !== undefined ? { trustNotes: s.trustNotes } : {}),
            ...(s.supportsClaims !== undefined ? { supportsClaims: s.supportsClaims } : {})
          }))
        },
        outputSummary: { sourceCount: draft.sources.length },
        error: null,
        finishedAt: deps.now()
      })
    }
  })
}

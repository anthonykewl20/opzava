import { parseProviderProfile, parseProviderAdapterResult, type ProviderAdapter, type ProviderAdapterRequest, type ProviderAdapterResult, type ProviderProfile } from '@/opzava/platform/providers/contracts'
import { parseWordpressDraftRequest } from '../contracts/wordpress-draft-request'

export const WORDPRESS_DRAFT_CREATE_OPERATION = 'wordpress-draft-create'

export function createMockWordpressPublishingProviderProfile(): ProviderProfile {
  return parseProviderProfile({
    schemaVersion: 1,
    providerId: 'mock-wordpress',
    displayName: 'Mock WordPress Publishing Provider',
    kind: 'publishing',
    mode: 'mock',
    config: {
      allowedOperations: [WORDPRESS_DRAFT_CREATE_OPERATION]
    }
  })
}

export function createMockWordpressPublishingProviderAdapter(
  deps: Readonly<{ now: () => string }>
): ProviderAdapter {
  return Object.freeze({
    execute: async (
      request: ProviderAdapterRequest,
      _signal: AbortSignal
    ): Promise<ProviderAdapterResult> => {
      const draftRequest = parseWordpressDraftRequest(request.input)

      return parseProviderAdapterResult({
        schemaVersion: 1,
        requestId: request.requestId,
        status: 'succeeded',
        output: {
          externalDraftId: `wp-draft-${draftRequest.requestId}`,
          status: 'draft',
          sourceRequestId: draftRequest.requestId,
          title: draftRequest.title
        },
        outputSummary: {
          status: 'draft',
          sourceRequestId: draftRequest.requestId
        },
        error: null,
        finishedAt: deps.now()
      })
    }
  })
}

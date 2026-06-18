import { createSecretReference } from '@/opzava/platform/admin-config/contracts'
import {
  parseProviderAdapterResult,
  parseProviderProfile,
  type ProviderAdapter,
  type ProviderAdapterRequest,
  type ProviderAdapterResult,
  type ProviderProfile,
} from '@/opzava/platform/providers/contracts'
import { parseWordpressDraftRequest } from '@/opzava/modules/content/contracts/wordpress-draft-request'
import type { WordpressLiveConnection } from '@/opzava/modules/content/providers/connection-settings-resolver'
import {
  createWordpressDraft,
  type HttpClient,
} from '@/opzava/modules/content/providers/wordpress-live-publisher'

export const WORDPRESS_LIVE_OPERATION = 'wordpress-draft-create'

export function createLiveWordpressProviderProfile(credentialId: string): ProviderProfile {
  return parseProviderProfile({
    schemaVersion: 1,
    providerId: 'live-wordpress',
    displayName: 'Live WordPress Publishing',
    kind: 'publishing',
    mode: 'live',
    credentialRef: createSecretReference({
      id: credentialId,
      scope: 'provider-credential',
      purpose: 'WordPress application password',
    }),
    config: {
      allowedOperations: [WORDPRESS_LIVE_OPERATION],
    },
  })
}

export function createLiveWordpressProviderAdapter(
  deps: Readonly<{
    connection: WordpressLiveConnection
    http: HttpClient
    now: () => string
  }>,
): ProviderAdapter {
  return Object.freeze({
    execute: async (request: ProviderAdapterRequest): Promise<ProviderAdapterResult> => {
      const draftRequest = parseWordpressDraftRequest(request.input)
      const r = await createWordpressDraft({
        connection: deps.connection,
        request: draftRequest,
        http: deps.http,
      })
      return parseProviderAdapterResult({
        schemaVersion: 1,
        requestId: request.requestId,
        status: r.ok ? 'succeeded' : 'failed',
        output: r.ok ? { externalPostId: r.externalPostId, status: 'draft' } : null,
        outputSummary: { status: 'draft', externalPostId: r.externalPostId },
        error: r.ok ? null : { class: 'provider-error', message: r.message },
        finishedAt: deps.now(),
      })
    },
  })
}

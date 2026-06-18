import { createSecretReference } from '@/opzava/platform/admin-config/contracts'
import {
  parseProviderAdapterResult,
  parseProviderProfile,
  type ProviderAdapter,
  type ProviderAdapterRequest,
  type ProviderAdapterResult,
  type ProviderProfile,
} from '@/opzava/platform/providers/contracts'
import type { ResendLiveConnection } from '@/opzava/modules/content/providers/connection-settings-resolver'
import {
  sendResendEmail,
  type ResendHttpClient,
} from '@/opzava/modules/content/providers/resend-live-sender'
import { z } from 'zod'

export const RESEND_LIVE_OPERATION = 'resend-email-send'

export function createLiveResendProviderProfile(credentialId: string): ProviderProfile {
  return parseProviderProfile({
    schemaVersion: 1,
    providerId: 'live-resend',
    displayName: 'Live Resend Email',
    kind: 'email',
    mode: 'live',
    credentialRef: createSecretReference({
      id: credentialId,
      scope: 'provider-credential',
      purpose: 'Resend API key',
    }),
    config: {
      allowedOperations: [RESEND_LIVE_OPERATION],
    },
  })
}

export function createLiveResendProviderAdapter(
  deps: Readonly<{
    connection: ResendLiveConnection
    http: ResendHttpClient
    now: () => string
  }>,
): ProviderAdapter {
  return Object.freeze({
    execute: async (request: ProviderAdapterRequest): Promise<ProviderAdapterResult> => {
      const m = z
        .object({
          to: z.string().email(),
          subject: z.string().min(1),
          html: z.string().optional(),
          text: z.string().optional(),
        })
        .strict()
        .parse(request.input)
      const r = await sendResendEmail({
        connection: deps.connection,
        message: m,
        http: deps.http,
      })
      return parseProviderAdapterResult({
        schemaVersion: 1,
        requestId: request.requestId,
        status: r.ok ? 'succeeded' : 'failed',
        output: r.ok ? { messageId: r.messageId } : null,
        outputSummary: { messageId: r.messageId },
        error: r.ok ? null : { class: 'provider-error', message: r.message },
        finishedAt: deps.now(),
      })
    },
  })
}

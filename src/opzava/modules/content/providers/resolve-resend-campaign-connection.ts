import { createSecretReference, type SecretReference } from '@/opzava/platform/admin-config/contracts'
import type { SecretResolver } from '@/opzava/platform/providers/credentials-runtime'
import type { ResendLiveConnection } from './connection-settings-resolver'

/**
 * The Resend API key is an environment-provided secret (ARD 0008): the database stores only this
 * reference, never the key. `id` names the environment variable the production resolver reads.
 */
export const RESEND_API_KEY_SECRET_REFERENCE: SecretReference = createSecretReference({
  id: 'RESEND_API_KEY',
  scope: 'provider-credential',
  purpose: 'Resend API key for campaign sends',
})

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export type ResolveResendCampaignConnectionDeps = Readonly<{
  readSetting: (key: string) => string | undefined
  resolver: SecretResolver
}>

export type ResolveResendCampaignConnectionResult =
  | Readonly<{ ok: true; connection: ResendLiveConnection }>
  | Readonly<{ ok: false; reason: 'from-address-missing' | 'secret-unavailable' }>

/**
 * Assembles the live Resend connection from two sources, per ARD 0008:
 *  - non-secret fields (`from address`, `from name`) come from admin settings, and
 *  - the API key resolves from the environment through the `SecretReference` boundary.
 *
 * The key is never read from the `settings` table, so it is never stored cleartext at rest. If the
 * secret cannot be resolved the call fails closed (`secret-unavailable`) and the send never starts.
 */
export async function resolveResendCampaignConnection(
  deps: ResolveResendCampaignConnectionDeps,
): Promise<ResolveResendCampaignConnectionResult> {
  const fromAddress = (deps.readSetting('resend_from_address') ?? '').trim()
  const fromName = (deps.readSetting('resend_from_name') ?? '').trim()

  if (!fromAddress || !EMAIL_RE.test(fromAddress)) {
    return Object.freeze({ ok: false, reason: 'from-address-missing' })
  }

  const resolved = await deps.resolver.resolveSecret(RESEND_API_KEY_SECRET_REFERENCE)
  if (!resolved.ok) {
    return Object.freeze({ ok: false, reason: 'secret-unavailable' })
  }

  const base = { fromAddress, apiKey: resolved.value.secretValue }
  return Object.freeze({
    ok: true,
    connection: Object.freeze(fromName ? { ...base, fromName } : base),
  })
}

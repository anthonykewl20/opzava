import { createSecretReference, type SecretReference } from '@/opzava/platform/admin-config/contracts'
import type { SecretResolver } from '@/opzava/platform/providers/credentials-runtime'
import type { WordpressLiveConnection } from './connection-settings-resolver'

/**
 * The WordPress application password is an environment-provided secret (ARD 0008): the database
 * stores only this reference, never the password. `id` names the environment variable the production
 * resolver reads.
 */
export const WORDPRESS_APP_PASSWORD_SECRET_REFERENCE: SecretReference = createSecretReference({
  id: 'WORDPRESS_APP_PASSWORD',
  scope: 'provider-credential',
  purpose: 'WordPress application password',
})

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export type ResolveWordpressDraftConnectionDeps = Readonly<{
  readSetting: (key: string) => string | undefined
  resolver: SecretResolver
}>

export type ResolveWordpressDraftConnectionResult =
  | Readonly<{ ok: true; connection: WordpressLiveConnection }>
  | Readonly<{ ok: false; reason: 'site-url-missing' | 'secret-unavailable' }>

/**
 * Assembles the live WordPress connection from two sources, per ARD 0008:
 *  - non-secret fields (`site URL`, optional `default author`) come from admin settings, and
 *  - the application password resolves from the environment through the `SecretReference` boundary.
 *
 * The password is never read from the `settings` table, so it is never stored cleartext at rest. If
 * the secret cannot be resolved the call fails closed (`secret-unavailable`) and no publish starts.
 */
export async function resolveWordpressDraftConnection(
  deps: ResolveWordpressDraftConnectionDeps,
): Promise<ResolveWordpressDraftConnectionResult> {
  const siteUrl = (deps.readSetting('wordpress_site_url') ?? '').trim()
  const defaultAuthor = (deps.readSetting('wordpress_default_author') ?? '').trim()

  if (!siteUrl || !isValidHttpUrl(siteUrl)) {
    return Object.freeze({ ok: false, reason: 'site-url-missing' })
  }

  const resolved = await deps.resolver.resolveSecret(WORDPRESS_APP_PASSWORD_SECRET_REFERENCE)
  if (!resolved.ok) {
    return Object.freeze({ ok: false, reason: 'secret-unavailable' })
  }

  const base = { siteUrl, appPassword: resolved.value.secretValue }
  return Object.freeze({
    ok: true,
    connection: Object.freeze(defaultAuthor ? { ...base, defaultAuthor } : base),
  })
}

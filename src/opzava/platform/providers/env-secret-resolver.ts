import type { SecretReference, SecretResolutionFailure } from '../admin-config/contracts'
import { isSecretReference } from '../admin-config/contracts'
import type { SecretResolver, SecretResolutionResult } from './credentials-runtime'

/**
 * Production `SecretResolver` (ARD 0008): resolves a `SecretReference` to its value from the
 * environment, never from the database. The environment read is injected so this module stays pure
 * and testable — the `process.env` touch belongs at the app/composition boundary (the route that
 * constructs the resolver), keeping the opzava namespace free of ambient environment access.
 *
 * A missing or empty value yields a typed `not-found` failure so the live provider path fails closed.
 */

export type EnvReader = (name: string) => string | undefined

export type EnvSecretResolverOptions = Readonly<{
  readEnv: EnvReader
}>

function failure(
  code: SecretResolutionFailure['code'],
  reference: SecretReference,
  message: string,
): SecretResolutionResult {
  return Object.freeze({
    ok: false,
    error: Object.freeze({ kind: 'SecretResolutionFailure', code, reference, message } as SecretResolutionFailure),
  })
}

export function createEnvSecretResolver(options: EnvSecretResolverOptions): SecretResolver {
  return Object.freeze({
    resolveSecret: async (reference: SecretReference): Promise<SecretResolutionResult> => {
      if (!isSecretReference(reference)) {
        return failure('invalid-reference', reference, 'value is not a valid SecretReference')
      }

      const raw = options.readEnv(reference.id)
      const value = typeof raw === 'string' ? raw.trim() : ''
      if (!value) {
        return failure(
          'not-found',
          reference,
          `no environment secret provided for reference id "${reference.id}"`,
        )
      }

      return Object.freeze({
        ok: true,
        value: Object.freeze({ reference, secretValue: value }),
      })
    },
  })
}

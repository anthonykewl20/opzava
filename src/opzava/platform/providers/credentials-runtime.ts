import type { SecretReference, SecretResolutionFailure } from '../admin-config/contracts'
import { parseProviderProfile, type ProviderAdapterRequest } from './contracts'

export class ProviderCredentialResolutionInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderCredentialResolutionInvariantError'
  }
}

export type ResolvedSecret = Readonly<{
  reference: SecretReference
  secretValue: string
}>

export type SecretResolver = Readonly<{
  resolveSecret: (reference: SecretReference) => Promise<SecretResolutionResult>
}>

export type SecretResolutionResult =
  | Readonly<{ ok: true, value: ResolvedSecret }>
  | Readonly<{ ok: false, error: SecretResolutionFailure }>

export type ResolvedProviderCredential = Readonly<{
  providerId: string
  reference: SecretReference
  secretValue: string
}>

export type ProviderCredentialResolutionResult =
  | Readonly<{ ok: true, value: Readonly<{ request: ProviderAdapterRequest, credential: ResolvedProviderCredential | null }> }>
  | Readonly<{ ok: false, error: SecretResolutionFailure }>

export type ProviderCredentialResolutionOptions = Readonly<{
  request: ProviderAdapterRequest
  resolver: SecretResolver
}>

export async function resolveProviderCredentialForRequest(
  options: ProviderCredentialResolutionOptions,
): Promise<ProviderCredentialResolutionResult> {
  const providerProfile = validateProviderProfile(options.request)
  if (providerProfile.mode === 'mock') {
    return Object.freeze({
      ok: true,
      value: Object.freeze({
        request: options.request,
        credential: null,
      }),
    })
  }

  const reference = providerProfile.credentialRef
  if (!reference) {
    throw new ProviderCredentialResolutionInvariantError('live provider profile is missing credential reference')
  }

  const resolved = await resolveSecret(options.resolver, reference)
  if (!resolved.ok) {
    return Object.freeze({
      ok: false,
      error: resolved.error,
    })
  }

  return Object.freeze({
    ok: true,
    value: Object.freeze({
      request: options.request,
      credential: Object.freeze({
        providerId: providerProfile.providerId,
        reference,
        secretValue: resolved.value.secretValue,
      }),
    }),
  })
}

function validateProviderProfile(request: ProviderAdapterRequest) {
  try {
    parseProviderProfile(request.providerProfile)
    return request.providerProfile
  } catch {
    throw new ProviderCredentialResolutionInvariantError('provider profile is invalid for credential resolution')
  }
}

async function resolveSecret(resolver: SecretResolver, reference: SecretReference): Promise<SecretResolutionResult> {
  try {
    return await resolver.resolveSecret(reference)
  } catch {
    throw new ProviderCredentialResolutionInvariantError('secret resolver threw before returning a typed result')
  }
}

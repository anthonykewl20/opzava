import type { RuntimeSettingsUnavailable } from '../admin-config/runtime-loader'
import type { SecretResolutionFailure } from '../admin-config/contracts'
import {
  resolveProviderCredentialForRequest,
  type ResolvedProviderCredential,
  type SecretResolver,
} from './credentials-runtime'
import type { ProviderAdapterRequest } from './contracts'
import {
  createRuntimeProviderAdapterRequest,
  type RuntimeProviderAdapterRequestOptions,
} from './request-runtime'

export type ProviderExecutionPreflightErrorKind = 'runtime-settings-unavailable' | 'secret-resolution-failed'

export type ProviderExecutionPreflightError =
  | Readonly<{ kind: 'runtime-settings-unavailable', cause: RuntimeSettingsUnavailable }>
  | Readonly<{ kind: 'secret-resolution-failed', cause: SecretResolutionFailure }>

export type ProviderExecutionPreflightResult =
  | Readonly<{ ok: true, value: Readonly<{ request: ProviderAdapterRequest, credential: ResolvedProviderCredential | null }> }>
  | Readonly<{ ok: false, error: ProviderExecutionPreflightError }>

export type ProviderExecutionPreflightOptions = Omit<RuntimeProviderAdapterRequestOptions, 'parseRequest'> & Readonly<{
  resolver: SecretResolver
}>

export async function createProviderExecutionPreflight(
  options: ProviderExecutionPreflightOptions,
): Promise<ProviderExecutionPreflightResult> {
  const requestResult = await createRuntimeProviderAdapterRequest(options)
  if (!requestResult.ok) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'runtime-settings-unavailable',
        cause: requestResult.error,
      }),
    })
  }

  const credentialResult = await resolveProviderCredentialForRequest({
    request: requestResult.value,
    resolver: options.resolver,
  })
  if (!credentialResult.ok) {
    return Object.freeze({
      ok: false,
      error: Object.freeze({
        kind: 'secret-resolution-failed',
        cause: credentialResult.error,
      }),
    })
  }

  return Object.freeze({
    ok: true,
    value: credentialResult.value,
  })
}

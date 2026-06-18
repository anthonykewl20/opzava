import type { RuntimeSettingsLoader, RuntimeSettingsUnavailable } from '../admin-config/runtime-loader'
import {
  PROVIDER_ADAPTER_REQUEST_SCHEMA_VERSION,
  parseProviderAdapterRequest,
  type ProviderAdapterRequest,
  type ProviderProfile,
} from './contracts'

export type RuntimeProviderAdapterRequestResult =
  | Readonly<{ ok: true, value: ProviderAdapterRequest }>
  | Readonly<{ ok: false, error: RuntimeSettingsUnavailable }>

export type ProviderAdapterRequestParser = (input: unknown) => ProviderAdapterRequest

export type RuntimeProviderAdapterRequestOptions = Readonly<{
  loader: RuntimeSettingsLoader
  requestId: string
  providerProfile: ProviderProfile
  operation: string
  workflowRunId: string
  stepRunId: ProviderAdapterRequest['stepRunId']
  idempotencyKey: string
  attemptNumber: number
  input: ProviderAdapterRequest['input']
  requestSummary: ProviderAdapterRequest['requestSummary']
  startedAt: string
  parseRequest?: ProviderAdapterRequestParser
}>

export async function createRuntimeProviderAdapterRequest(
  options: RuntimeProviderAdapterRequestOptions,
): Promise<RuntimeProviderAdapterRequestResult> {
  const settings = await options.loader.loadRuntimeSettings()
  if (!settings.ok) {
    return Object.freeze({
      ok: false,
      error: settings.error,
    })
  }

  const providerDefaults = settings.value.options.provider
  const parseRequest = options.parseRequest ?? parseProviderAdapterRequest

  return Object.freeze({
    ok: true,
    value: parseRequest({
      schemaVersion: PROVIDER_ADAPTER_REQUEST_SCHEMA_VERSION,
      requestId: options.requestId,
      providerProfile: options.providerProfile,
      operation: options.operation,
      workflowRunId: options.workflowRunId,
      stepRunId: options.stepRunId,
      idempotencyKey: options.idempotencyKey,
      timeoutMs: providerDefaults.timeoutMs,
      retry: {
        attemptNumber: options.attemptNumber,
        maxAttempts: providerDefaults.retry.maxAttempts,
      },
      input: options.input,
      requestSummary: options.requestSummary,
      startedAt: options.startedAt,
    }),
  })
}

import { describe, expect, it } from 'vitest'

import { parseProviderAdapterRequest } from '../providers/contracts'
import { createRunnerDaemon } from '../runner/daemon'
import { createExponentialRetryPolicy } from '../runner/retry-policy'
import { createSecretReference } from './contracts'
import {
  defaultOpzavaAdminSettings,
  diffOpzavaAdminSettings,
  parseOpzavaAdminSettings,
  redactOpzavaAdminSettingsForAudit,
} from './settings'

describe('Opzava admin settings contracts', () => {
  it('parses the default runner, retry, provider, and credential settings', () => {
    const settings = defaultOpzavaAdminSettings()

    expect(parseOpzavaAdminSettings(settings)).toEqual(settings)
  })

  it('rejects unsafe runner polling settings instead of silently over-polling', () => {
    expect(() => parseOpzavaAdminSettings(settingsWith({ runner: { idleDelayMs: 999 } }))).toThrow(/idleDelayMs/)
    expect(() => parseOpzavaAdminSettings(settingsWith({ runner: { errorDelayMs: 86_400_001 } }))).toThrow(/errorDelayMs/)
    expect(() => parseOpzavaAdminSettings(settingsWith({ runner: { shutdownGraceMs: 99 } }))).toThrow(/shutdownGraceMs/)
  })

  it('rejects retry settings that cannot build the exponential retry policy', () => {
    expect(() => parseOpzavaAdminSettings(settingsWith({ retry: { initialDelayMs: 0 } }))).toThrow(/initialDelayMs/)
    expect(() => parseOpzavaAdminSettings(settingsWith({ retry: { multiplier: 1 } }))).toThrow(/multiplier/)
    expect(() => parseOpzavaAdminSettings(settingsWith({ retry: { maxDelayMs: 999, initialDelayMs: 1_000 } }))).toThrow(/maxDelayMs/)
    expect(() => parseOpzavaAdminSettings(settingsWith({ retry: { maxAttempts: 21 } }))).toThrow(/maxAttempts/)
  })

  it('rejects provider settings outside bounded request, rate, and cost limits', () => {
    expect(() => parseOpzavaAdminSettings(settingsWith({ providers: { requestTimeoutMs: 3_600_001 } }))).toThrow(/requestTimeoutMs/)
    expect(() => parseOpzavaAdminSettings(settingsWith({ providers: { requestsPerMinute: 0 } }))).toThrow(/requestsPerMinute/)
    expect(() => parseOpzavaAdminSettings(settingsWith({ providers: { burst: 0, requestsPerMinute: 1 } }))).toThrow(/burst/)
    expect(() => parseOpzavaAdminSettings(settingsWith({ providers: { usdPerDayLimit: 1_000_001 } }))).toThrow(/usdPerDayLimit/)
  })

  it('rejects stringly typed numbers and non-secret provider credentials', () => {
    expect(() => parseOpzavaAdminSettings(settingsWith({ runner: { idleDelayMs: '1000' } }))).toThrow(/idleDelayMs/)
    expect(() => parseOpzavaAdminSettings(settingsWith({ providerCredentials: { 'live-llm': 'sk-live-cleartext' } }))).toThrow(/SecretReference/)
  })

  it('redacts provider credential references before audit serialization', () => {
    const settings = parseOpzavaAdminSettings(settingsWith({
      providerCredentials: {
        'live-llm': createSecretReference({
          id: 'secret_live_llm_key',
          scope: 'provider-credential',
          purpose: 'llm-provider-api-key',
        }),
      },
    }))

    const redacted = redactOpzavaAdminSettingsForAudit(settings)
    const serialized = JSON.stringify(redacted)

    expect(redacted.providerCredentials['live-llm']).toBe('[secret-reference:provider-credential]')
    expect(serialized).not.toContain('secret_live_llm_key')
    expect(serialized).not.toContain('llm-provider-api-key')
  })

  it('diffs changed settings by path without serializing secret values', () => {
    const before = defaultOpzavaAdminSettings()
    const after = parseOpzavaAdminSettings(settingsWith({
      runner: { idleDelayMs: 2_000 },
      providerCredentials: {
        'live-llm': createSecretReference({
          id: 'secret_live_llm_key',
          scope: 'provider-credential',
          purpose: 'llm-provider-api-key',
        }),
      },
    }))

    const diff = diffOpzavaAdminSettings(before, after)
    const serialized = JSON.stringify(diff)

    expect(diff).toEqual([
      { path: 'providerCredentials.live-llm', kind: 'secret-reference' },
      { path: 'runner.idleDelayMs', kind: 'number' },
    ])
    expect(diffOpzavaAdminSettings(after, after)).toEqual([])
    expect(serialized).not.toContain('secret_live_llm_key')
    expect(serialized).not.toContain('llm-provider-api-key')
  })

  it('detects provider credential reference changes without exposing reference identity', () => {
    const before = parseOpzavaAdminSettings(settingsWith({
      providerCredentials: {
        'live-llm': createSecretReference({
          id: 'secret_live_llm_key_old',
          scope: 'provider-credential',
          purpose: 'llm-provider-api-key-old',
        }),
      },
    }))
    const after = parseOpzavaAdminSettings(settingsWith({
      providerCredentials: {
        'live-llm': createSecretReference({
          id: 'secret_live_llm_key_new',
          scope: 'provider-credential',
          purpose: 'llm-provider-api-key-new',
        }),
      },
    }))
    const diff = diffOpzavaAdminSettings(before, after)
    const serialized = JSON.stringify(diff)

    expect(diff).toEqual([{ path: 'providerCredentials.live-llm', kind: 'secret-reference' }])
    expect(serialized).not.toContain('secret_live_llm_key_old')
    expect(serialized).not.toContain('secret_live_llm_key_new')
    expect(serialized).not.toContain('llm-provider-api-key')
  })

  it('produces settings compatible with existing retry policy, daemon, and provider request contracts', () => {
    const settings = defaultOpzavaAdminSettings()
    const retryPolicy = createExponentialRetryPolicy(settings.retry)
    const controller = new AbortController()

    expect(retryPolicy.nextRetry({
      attemptNumber: 1,
      failedAt: new Date('2026-06-15T00:00:00.000Z'),
      errorClass: 'provider-error',
    }).delayMs).toBeLessThanOrEqual(settings.retry.maxDelayMs)
    expect(() => createRunnerDaemon({
      worker: { runNext: async () => ({ status: 'idle' }) },
      signal: controller.signal,
      idleDelayMs: settings.runner.idleDelayMs,
      errorDelayMs: settings.runner.errorDelayMs,
    })).not.toThrow()
    expect(() => parseProviderAdapterRequest({
      schemaVersion: 1,
      requestId: 'provider_request_settings_001',
      providerProfile: {
        schemaVersion: 1,
        providerId: 'mock-llm',
        displayName: 'Mock LLM',
        kind: 'llm',
        mode: 'mock',
        config: {
          allowedOperations: ['generate-seo-brief'],
        },
      },
      operation: 'generate-seo-brief',
      workflowRunId: 'run_001',
      stepRunId: 'step_run_seo_brief_001',
      idempotencyKey: 'workflow:run_001:step:seo-brief:provider:v1',
      timeoutMs: settings.providers.requestTimeoutMs,
      retry: {
        attemptNumber: 1,
        maxAttempts: settings.retry.maxAttempts,
      },
      input: { promptArtifactId: 'artifact_prompt_001' },
      requestSummary: { promptArtifactId: 'artifact_prompt_001' },
      startedAt: '2026-06-15T00:00:00.000Z',
    })).not.toThrow()
  })
})

function settingsWith(overrides: {
  runner?: Record<string, unknown>
  retry?: Record<string, unknown>
  providers?: Record<string, unknown>
  providerSelection?: Record<string, unknown>
  providerCredentials?: Record<string, unknown>
}) {
  const settings = defaultOpzavaAdminSettings()

  return {
    ...settings,
    runner: { ...settings.runner, ...overrides.runner },
    retry: { ...settings.retry, ...overrides.retry },
    providers: { ...settings.providers, ...overrides.providers },
    providerSelection: { ...settings.providerSelection, ...overrides.providerSelection },
    providerCredentials: { ...settings.providerCredentials, ...overrides.providerCredentials },
  }
}

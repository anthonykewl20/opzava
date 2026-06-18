import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { createSecretReference, type SecretResolutionFailure } from '../admin-config/contracts'
import { parseOperationalEventStorageRecord } from '../runner/repository-contracts'
import {
  createProviderPreflightFailureOperationalEvent,
  type ProviderPreflightFailureEventInput,
} from './preflight-events'

describe('Opzava provider preflight failure operational events', () => {
  it('creates a parseable audit operational event for unavailable runtime settings', () => {
    const record = createProviderPreflightFailureOperationalEvent(input({
      error: {
        kind: 'runtime-settings-unavailable',
        cause: {
          kind: 'unavailable',
          reason: 'not_persisted',
        },
      },
    }))

    expect(parseOperationalEventStorageRecord(record)).toEqual(record)
    expect(record).toMatchObject({
      recordId: 'operational_event_provider_preflight_001',
      kind: 'audit',
      workflowRunId: 'run_001',
      stepRunId: 'step_run_seo_brief_001',
      occurredAt: '2026-06-15T00:00:00.000Z',
      event: {
        auditEventId: 'audit_provider_preflight_001',
        actorId: 'runner:provider-preflight',
        action: 'provider.preflight.blocked',
        target: {
          kind: 'provider',
          id: 'live-llm',
        },
        beforeSummary: null,
        correlationId: 'provider_request_preflight_001',
        occurredAt: '2026-06-15T00:00:00.000Z',
      },
    })
    expect(afterSummary(record)).toEqual({
      requestId: 'provider_request_preflight_001',
      providerId: 'live-llm',
      operation: 'generate-seo-brief',
      errorKind: 'runtime-settings-unavailable',
      cause: {
        kind: 'runtime-settings-unavailable',
        reason: 'not_persisted',
      },
    })
  })

  it('redacts secret resolution failures before storing the audit event', () => {
    const reference = createSecretReference({
      id: 'secret_live_llm_key',
      scope: 'provider-credential',
      purpose: 'llm-provider-api-key',
    })
    const failure: SecretResolutionFailure = {
      kind: 'SecretResolutionFailure',
      code: 'permission-denied',
      reference,
      message: 'raw resolver detail must stay out of audit events',
    }

    const record = createProviderPreflightFailureOperationalEvent(input({
      error: {
        kind: 'secret-resolution-failed',
        cause: failure,
      },
    }))
    const serialized = JSON.stringify(record)

    expect(afterSummary(record)).toEqual({
      requestId: 'provider_request_preflight_001',
      providerId: 'live-llm',
      operation: 'generate-seo-brief',
      errorKind: 'secret-resolution-failed',
      cause: {
        kind: 'secret-resolution-failed',
        code: 'permission-denied',
        reference: '[secret-reference:provider-credential]',
      },
    })
    expect(serialized).not.toContain(reference.id)
    expect(serialized).not.toContain(reference.purpose)
    expect(serialized).not.toContain(failure.message)
  })

  it('is deterministic and does not mutate inputs', () => {
    const eventInput = input({
      error: {
        kind: 'runtime-settings-unavailable',
        cause: {
          kind: 'unavailable',
          reason: 'not_persisted',
        },
      },
    })
    const before = JSON.stringify(eventInput)

    const first = createProviderPreflightFailureOperationalEvent(eventInput)
    const second = createProviderPreflightFailureOperationalEvent(eventInput)

    expect(second).toEqual(first)
    expect(JSON.stringify(eventInput)).toBe(before)
  })

  it('does not import preflight execution, credential resolution, filesystem reads, env reads, logging, or ID generation', async () => {
    const source = await readFile('src/opzava/platform/providers/preflight-events.ts', 'utf8')

    expect(source).not.toContain('process.env')
    expect(source).not.toContain('readFile')
    expect(source).not.toContain('readFileSync')
    expect(source).not.toContain('randomUUID')
    expect(source).not.toContain('console.')
    expect(source).not.toContain('./execution')
    expect(source).not.toContain('./preflight-runtime')
    expect(source).not.toContain('./credentials-runtime')
    expect(source).not.toContain('resolveSecret')
    expect(source).not.toContain('executeProviderAdapter')
  })
})

function afterSummary(record: ReturnType<typeof createProviderPreflightFailureOperationalEvent>): unknown {
  if (record.kind !== 'audit') throw new Error('expected audit operational event')
  return (record.event as { afterSummary: unknown }).afterSummary
}

function input(overrides: Partial<ProviderPreflightFailureEventInput> = {}): ProviderPreflightFailureEventInput {
  return {
    recordId: 'operational_event_provider_preflight_001',
    auditEventId: 'audit_provider_preflight_001',
    actorId: 'runner:provider-preflight',
    requestId: 'provider_request_preflight_001',
    providerId: 'live-llm',
    operation: 'generate-seo-brief',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_seo_brief_001',
    occurredAt: '2026-06-15T00:00:00.000Z',
    error: {
      kind: 'runtime-settings-unavailable',
      cause: {
        kind: 'unavailable',
        reason: 'not_persisted',
      },
    },
    ...overrides,
  }
}

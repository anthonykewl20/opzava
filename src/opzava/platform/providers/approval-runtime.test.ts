import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { parseApproval, type Approval } from '../../core/approvals/contracts'
import { createSecretReference } from '../admin-config/contracts'
import { parseProviderAdapterRequest, parseProviderProfile, type ProviderAdapterRequest } from './contracts'
import { evaluateProviderExecutionApproval } from './approval-runtime'

describe('Opzava provider execution approval runtime', () => {
  it('denies live provider execution when no approval is supplied', () => {
    const request = liveProviderRequest()

    const decision = evaluateProviderExecutionApproval({
      request,
      approval: null,
      approvalTargetId: 'external_action_live_llm_generate_001',
      requestedAction: 'provider:live-llm:generate-seo-brief',
      now: new Date('2026-06-15T00:00:00.000Z'),
    })

    expect(decision).toEqual({
      ok: false,
      error: {
        kind: 'approval-missing',
        providerId: 'live-llm',
        operation: 'generate-seo-brief',
      },
    })
  })

  it.each([
    ['requested', 'approval-not-granted'],
    ['rejected', 'approval-not-granted'],
    ['cancelled', 'approval-not-granted'],
    ['expired', 'approval-expired'],
  ] as const)('denies %s approvals without adapter execution permission', (status, expectedKind) => {
    const decision = evaluateProviderExecutionApproval({
      request: liveProviderRequest(),
      approval: approval({ status }),
      approvalTargetId: 'external_action_live_llm_generate_001',
      requestedAction: 'provider:live-llm:generate-seo-brief',
      now: new Date('2026-06-15T00:00:00.000Z'),
    })

    expect(decision).toMatchObject({
      ok: false,
      error: {
        kind: expectedKind,
        approvalId: 'approval_live_llm_generate_001',
      },
    })
  })

  it('denies approvals whose external-action target does not match the requested provider action', () => {
    const decision = evaluateProviderExecutionApproval({
      request: liveProviderRequest(),
      approval: approval({
        target: {
          kind: 'external-action',
          id: 'external_action_different_001',
        },
      }),
      approvalTargetId: 'external_action_live_llm_generate_001',
      requestedAction: 'provider:live-llm:generate-seo-brief',
      now: new Date('2026-06-15T00:00:00.000Z'),
    })

    expect(decision).toEqual({
      ok: false,
      error: {
        kind: 'approval-target-mismatch',
        approvalId: 'approval_live_llm_generate_001',
        expectedTarget: {
          kind: 'external-action',
          id: 'external_action_live_llm_generate_001',
        },
      },
    })
  })

  it('denies approvals whose requested action does not match the provider operation', () => {
    const decision = evaluateProviderExecutionApproval({
      request: liveProviderRequest(),
      approval: approval({ requestedAction: 'provider:live-llm:other-operation' }),
      approvalTargetId: 'external_action_live_llm_generate_001',
      requestedAction: 'provider:live-llm:generate-seo-brief',
      now: new Date('2026-06-15T00:00:00.000Z'),
    })

    expect(decision).toEqual({
      ok: false,
      error: {
        kind: 'approval-action-mismatch',
        approvalId: 'approval_live_llm_generate_001',
        expectedAction: 'provider:live-llm:generate-seo-brief',
      },
    })
  })

  it('denies approved approvals when their expiry has passed', () => {
    const decision = evaluateProviderExecutionApproval({
      request: liveProviderRequest(),
      approval: approval({ expiresAt: '2026-06-14T23:59:59.999Z' }),
      approvalTargetId: 'external_action_live_llm_generate_001',
      requestedAction: 'provider:live-llm:generate-seo-brief',
      now: new Date('2026-06-15T00:00:00.000Z'),
    })

    expect(decision).toEqual({
      ok: false,
      error: {
        kind: 'approval-expired',
        approvalId: 'approval_live_llm_generate_001',
        expiredAt: '2026-06-14T23:59:59.999Z',
      },
    })
  })

  it('denies approved approvals that do not carry an expiry', () => {
    const decision = evaluateProviderExecutionApproval({
      request: liveProviderRequest(),
      approval: approval({ expiresAt: null }),
      approvalTargetId: 'external_action_live_llm_generate_001',
      requestedAction: 'provider:live-llm:generate-seo-brief',
      now: new Date('2026-06-15T00:00:00.000Z'),
    })

    expect(decision).toEqual({
      ok: false,
      error: {
        kind: 'approval-expiry-required',
        approvalId: 'approval_live_llm_generate_001',
      },
    })
  })

  it('allows a matching approved approval without executing an adapter', () => {
    const decision = evaluateProviderExecutionApproval({
      request: liveProviderRequest(),
      approval: approval(),
      approvalTargetId: 'external_action_live_llm_generate_001',
      requestedAction: 'provider:live-llm:generate-seo-brief',
      now: new Date('2026-06-15T00:00:00.000Z'),
    })

    expect(decision).toEqual({
      ok: true,
      value: {
        approvalId: 'approval_live_llm_generate_001',
        providerId: 'live-llm',
        operation: 'generate-seo-brief',
        approvalTargetId: 'external_action_live_llm_generate_001',
        requestedAction: 'provider:live-llm:generate-seo-brief',
        expiresAt: '2026-06-16T00:00:00.000Z',
      },
    })
  })

  it('allows an approval that expires exactly at the injected current time', () => {
    const decision = evaluateProviderExecutionApproval({
      request: liveProviderRequest(),
      approval: approval({ expiresAt: '2026-06-15T00:00:00.000Z' }),
      approvalTargetId: 'external_action_live_llm_generate_001',
      requestedAction: 'provider:live-llm:generate-seo-brief',
      now: new Date('2026-06-15T00:00:00.000Z'),
    })

    expect(decision).toMatchObject({ ok: true })
  })

  it('rejects malformed caller approval targets before returning an allow decision', () => {
    const decision = evaluateProviderExecutionApproval({
      request: liveProviderRequest(),
      approval: approval(),
      approvalTargetId: '',
      requestedAction: 'provider:live-llm:generate-seo-brief',
      now: new Date('2026-06-15T00:00:00.000Z'),
    })

    expect(decision).toEqual({
      ok: false,
      error: {
        kind: 'approval-target-invalid',
        reason: 'empty',
      },
    })
  })

  it('does not import provider execution, adapters, filesystem reads, env reads, logging, or ID generation', async () => {
    const source = await readFile('src/opzava/platform/providers/approval-runtime.ts', 'utf8')

    expect(source).not.toContain('executeProviderAdapterWithEvents')
    expect(source).not.toContain('./execution')
    expect(source).not.toContain('process.env')
    expect(source).not.toContain('readFile')
    expect(source).not.toContain('readFileSync')
    expect(source).not.toContain('randomUUID')
    expect(source).not.toContain('console.')
    expect(source).not.toContain('fetch(')
  })
})

function liveProviderRequest(): ProviderAdapterRequest {
  return parseProviderAdapterRequest({
    schemaVersion: 1,
    requestId: 'provider_request_live_approval_001',
    providerProfile: parseProviderProfile({
      schemaVersion: 1,
      providerId: 'live-llm',
      displayName: 'Live LLM',
      kind: 'llm',
      mode: 'live',
      credentialRef: createSecretReference({
        id: 'secret_live_llm_key',
        scope: 'provider-credential',
        purpose: 'llm-provider-api-key',
      }),
      config: {
        modelRef: 'operator-managed-model',
        allowedOperations: ['generate-seo-brief'],
      },
    }),
    operation: 'generate-seo-brief',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_seo_brief_001',
    idempotencyKey: 'workflow:run_001:step:seo-brief:provider:v1',
    timeoutMs: 30_000,
    retry: {
      attemptNumber: 1,
      maxAttempts: 3,
    },
    input: {
      promptArtifactId: 'artifact_prompt_001',
    },
    requestSummary: {
      promptArtifactId: 'artifact_prompt_001',
    },
    startedAt: '2026-06-15T00:00:00.000Z',
  })
}

function approval(overrides: Partial<Approval> = {}): Approval {
  const status = overrides.status ?? 'approved'
  const hasDecision = status === 'approved' || status === 'rejected'

  return parseApproval({
    schemaVersion: 1,
    approvalId: 'approval_live_llm_generate_001',
    requestedAction: 'provider:live-llm:generate-seo-brief',
    target: {
      kind: 'external-action',
      id: 'external_action_live_llm_generate_001',
    },
    status,
    requesterId: 'system:workflow-runner',
    approverId: hasDecision ? 'admin:1' : null,
    decisionReason: hasDecision ? 'Approved live provider execution for this action' : null,
    requestedAt: '2026-06-14T00:00:00.000Z',
    decidedAt: hasDecision ? '2026-06-14T01:00:00.000Z' : null,
    expiresAt: '2026-06-16T00:00:00.000Z',
    ...overrides,
  })
}

import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import type { ProviderExecutionApprovalDecision, ProviderExecutionApprovalError } from './approval-runtime'
import { createProviderExecutionApprovalOperationalEvent } from './approval-events'

describe('Opzava provider execution approval operational events', () => {
  it('creates a redacted audit operational event for denied approval decisions with approval ids', () => {
    const event = createProviderExecutionApprovalOperationalEvent({
      ...eventInput(),
      decision: deniedDecision({
        kind: 'approval-target-mismatch',
        approvalId: 'approval_live_llm_generate_001',
        expectedTarget: {
          kind: 'external-action',
          id: 'external_action_live_llm_generate_001',
        },
      }),
    })

    expect(event).toMatchObject({
      schemaVersion: 1,
      recordId: 'operational_event_approval_001',
      kind: 'audit',
      workflowRunId: 'run_001',
      stepRunId: 'step_run_seo_brief_001',
      occurredAt: '2026-06-15T00:00:01.000Z',
      event: {
        schemaVersion: 1,
        auditEventId: 'audit_approval_001',
        actorId: 'runner:provider-approval',
        action: 'provider.execution.approval.denied',
        target: {
          kind: 'provider',
          id: 'live-llm',
        },
        beforeSummary: null,
        afterSummary: {
          requestId: 'provider_request_approval_001',
          providerId: 'live-llm',
          operation: 'generate-seo-brief',
          outcome: 'denied',
          reason: 'approval-target-mismatch',
          approvalId: 'approval_live_llm_generate_001',
        },
        correlationId: 'provider_request_approval_001',
        occurredAt: '2026-06-15T00:00:01.000Z',
      },
    })
  })

  it('omits approval ids for denied approval decisions that have none', () => {
    const event = createProviderExecutionApprovalOperationalEvent({
      ...eventInput(),
      decision: deniedDecision({
        kind: 'approval-missing',
        providerId: 'live-llm',
        operation: 'generate-seo-brief',
      }),
    })

    expect(event.event).toMatchObject({
      afterSummary: {
        requestId: 'provider_request_approval_001',
        providerId: 'live-llm',
        operation: 'generate-seo-brief',
        outcome: 'denied',
        reason: 'approval-missing',
      },
    })
  })

  it('creates a redacted audit operational event for allowed approval decisions', () => {
    const event = createProviderExecutionApprovalOperationalEvent({
      ...eventInput(),
      decision: allowedDecision(),
    })

    expect(event).toMatchObject({
      recordId: 'operational_event_approval_001',
      kind: 'audit',
      event: {
        auditEventId: 'audit_approval_001',
        action: 'provider.execution.approval.allowed',
        afterSummary: {
          requestId: 'provider_request_approval_001',
          providerId: 'live-llm',
          operation: 'generate-seo-brief',
          outcome: 'allowed',
          approvalId: 'approval_live_llm_generate_001',
          expiresAt: '2026-06-16T00:00:00.000Z',
        },
      },
    })
    expect(JSON.stringify(event)).not.toContain('reason')
  })

  it('does not leak unexpected decision fields into audit records', () => {
    const allowed = allowedDecision()
    if (!allowed.ok) throw new Error('expected allowed decision')
    const decision = {
      ...allowed,
      value: {
        ...allowed.value,
        reason: 'do not store me',
        requestSummary: {
          prompt: 'do not store me',
        },
        credentialRef: {
          id: 'secret_live_llm_key',
          purpose: 'do not store me',
        },
      },
      secretValue: 'do not store me',
      headers: {
        authorization: 'do not store me',
      },
    } as unknown as ProviderExecutionApprovalDecision

    const event = createProviderExecutionApprovalOperationalEvent({
      ...eventInput(),
      decision,
    })
    const serialized = JSON.stringify(event)

    expect(serialized).not.toContain('do not store me')
    expect(serialized).not.toContain('secret_live_llm_key')
    expect(serialized).not.toContain('authorization')
    expect(serialized).not.toContain('credentialRef')
  })

  it('is deterministic for identical inputs', () => {
    const input = {
      ...eventInput(),
      decision: allowedDecision(),
    }
    const deniedInput = {
      ...eventInput(),
      decision: deniedDecision({
        kind: 'approval-not-granted',
        approvalId: 'approval_live_llm_generate_001',
        status: 'rejected',
      }),
    }

    expect(createProviderExecutionApprovalOperationalEvent(input)).toEqual(
      createProviderExecutionApprovalOperationalEvent(input),
    )
    expect(createProviderExecutionApprovalOperationalEvent(deniedInput)).toEqual(
      createProviderExecutionApprovalOperationalEvent(deniedInput),
    )
  })

  it('does not import approval execution, provider execution, adapters, filesystem reads, env reads, logging, or ID generation', async () => {
    const source = await readFile('src/opzava/platform/providers/approval-events.ts', 'utf8')

    expect(source).not.toContain('evaluateProviderExecutionApproval')
    expect(source).not.toContain('executeProviderAdapterWithEvents')
    expect(source).not.toContain('./execution')
    expect(source).not.toContain('process.env')
    expect(source).not.toContain('readFile')
    expect(source).not.toContain('readFileSync')
    expect(source).not.toContain('randomUUID')
    expect(source).not.toContain('Date.now')
    expect(source).not.toContain('crypto')
    expect(source).not.toContain('console.')
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('JSON.stringify')
    expect(source).not.toContain('...input.decision')
  })
})

function eventInput() {
  return {
    recordId: 'operational_event_approval_001',
    auditEventId: 'audit_approval_001',
    actorId: 'runner:provider-approval',
    occurredAt: '2026-06-15T00:00:01.000Z',
    requestId: 'provider_request_approval_001',
    providerId: 'live-llm',
    operation: 'generate-seo-brief',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_seo_brief_001',
  }
}

function deniedDecision(error: ProviderExecutionApprovalError): ProviderExecutionApprovalDecision {
  return {
    ok: false,
    error,
  }
}

function allowedDecision(): ProviderExecutionApprovalDecision {
  return {
    ok: true,
    value: {
      approvalId: 'approval_live_llm_generate_001',
      providerId: 'live-llm',
      operation: 'generate-seo-brief',
      approvalTargetId: 'external_action_live_llm_generate_001',
      requestedAction: 'provider:live-llm:generate-seo-brief',
      expiresAt: '2026-06-16T00:00:00.000Z',
    },
  }
}

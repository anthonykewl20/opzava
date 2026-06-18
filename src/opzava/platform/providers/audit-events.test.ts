import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import {
  createProviderExecutionAuditOperationalEvent,
  type ProviderExecutionAuditEventInput,
} from './audit-events'

describe('Opzava provider execution audit events', () => {
  it('records a succeeded executed action as a parseable audit operational event', () => {
    const record = createProviderExecutionAuditOperationalEvent(auditInput())

    expect(record.kind).toBe('audit')
    expect(record.recordId).toBe('operational_event_provider_exec_audit_001')
    expect(record.workflowRunId).toBe('run_001')
    expect(record.stepRunId).toBe('step_run_seo_brief_001')
    expect(record.event).toMatchObject({
      auditEventId: 'audit_provider_exec_001',
      action: 'provider.execution.recorded',
      target: { kind: 'provider', id: 'live-llm' },
      correlationId: 'provider_request_execution_001',
    })
    expect((record.event as { afterSummary: unknown }).afterSummary).toEqual({
      requestId: 'provider_request_execution_001',
      providerId: 'live-llm',
      operation: 'generate-seo-brief',
      externalCallId: 'external_call_live_action_001',
      status: 'succeeded',
      outcome: 'executed',
    })
  })

  it('carries failed and timed-out statuses without changing the action', () => {
    const failed = createProviderExecutionAuditOperationalEvent(auditInput({ status: 'failed' }))
    const timedOut = createProviderExecutionAuditOperationalEvent(auditInput({ status: 'timed-out' }))

    expect((failed.event as { action: string }).action).toBe('provider.execution.recorded')
    expect((timedOut.event as { action: string }).action).toBe('provider.execution.recorded')
    expect((failed.event as unknown as { afterSummary: { status: string } }).afterSummary.status).toBe('failed')
    expect((timedOut.event as unknown as { afterSummary: { status: string } }).afterSummary.status).toBe('timed-out')
  })

  it('produces deterministic output for identical inputs', () => {
    expect(createProviderExecutionAuditOperationalEvent(auditInput()))
      .toEqual(createProviderExecutionAuditOperationalEvent(auditInput()))
  })

  it('does not leak unexpected input fields into the audit record', () => {
    const record = createProviderExecutionAuditOperationalEvent(
      auditInput({ promptText: 'secret-prompt-should-not-appear' } as Partial<ProviderExecutionAuditEventInput>),
    )

    expect(JSON.stringify(record)).not.toContain('secret-prompt-should-not-appear')
  })

  it('does not read files, env, generate IDs, or use nondeterministic time', async () => {
    const source = await readFile('src/opzava/platform/providers/audit-events.ts', 'utf8')

    expect(source).not.toContain('Date.now')
    expect(source).not.toContain('crypto')
    expect(source).not.toContain('process.env')
    expect(source).not.toContain('from \'fs\'')
    expect(source).not.toContain('require(\'fs\')')
    expect(source).not.toContain('fetch(')
  })
})

function auditInput(overrides: Partial<ProviderExecutionAuditEventInput> = {}): ProviderExecutionAuditEventInput {
  return {
    recordId: 'operational_event_provider_exec_audit_001',
    auditEventId: 'audit_provider_exec_001',
    actorId: 'runner:live-provider',
    occurredAt: '2026-06-15T00:00:03.000Z',
    requestId: 'provider_request_execution_001',
    providerId: 'live-llm',
    operation: 'generate-seo-brief',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_seo_brief_001',
    externalCallId: 'external_call_live_action_001',
    status: 'succeeded',
    ...overrides,
  }
}

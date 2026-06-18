import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { createProviderExecutionCostOperationalEvent } from './cost-events'

describe('Opzava provider execution cost operational events', () => {
  it('creates a parseable cost operational event from an executed provider action', () => {
    const event = createProviderExecutionCostOperationalEvent(eventInput())

    expect(event).toMatchObject({
      schemaVersion: 1,
      recordId: 'operational_event_cost_001',
      kind: 'cost',
      workflowRunId: 'run_001',
      stepRunId: 'step_run_seo_brief_001',
      occurredAt: '2026-06-15T00:00:02.000Z',
      event: {
        schemaVersion: 1,
        costEventId: 'cost_event_001',
        workflowRunId: 'run_001',
        stepRunId: 'step_run_seo_brief_001',
        externalCallId: 'external_call_live_llm_generate_001',
        providerId: 'live-llm',
        operation: 'generate-seo-brief',
        units: {
          inputTokens: 1200,
          outputTokens: 340,
        },
        estimatedCostCents: 7,
        actualCostCents: null,
        currency: 'USD',
        recordedAt: '2026-06-15T00:00:02.000Z',
      },
    })
  })

  it('records caller-supplied actual cost when present', () => {
    const event = createProviderExecutionCostOperationalEvent({
      ...eventInput(),
      actualCostCents: 9,
    })

    expect(event.event).toMatchObject({
      estimatedCostCents: 7,
      actualCostCents: 9,
    })
  })

  it('only records allow-listed cost fields and never leaks payloads or secrets', () => {
    const event = createProviderExecutionCostOperationalEvent({
      ...eventInput(),
      prompt: 'do not store me',
      requestSummary: { prompt: 'do not store me' },
      credentialRef: { id: 'secret_live_llm_key', scope: 'provider' },
      headers: { authorization: 'do not store me' },
    } as unknown as Parameters<typeof createProviderExecutionCostOperationalEvent>[0])

    const serialized = JSON.stringify(event)

    expect(serialized).not.toContain('do not store me')
    expect(serialized).not.toContain('secret_live_llm_key')
    expect(serialized).not.toContain('authorization')
    expect(serialized).not.toContain('credentialRef')
    expect(serialized).not.toContain('requestSummary')
    expect(serialized).not.toContain('prompt')
  })

  it('is deterministic for identical inputs', () => {
    const input = eventInput()

    expect(createProviderExecutionCostOperationalEvent(input)).toEqual(
      createProviderExecutionCostOperationalEvent(input),
    )
  })

  it('returns a frozen record', () => {
    const event = createProviderExecutionCostOperationalEvent(eventInput())

    expect(Object.isFrozen(event)).toBe(true)
  })

  it('does not read files or env, generate ids, call fetch, or use nondeterministic time', async () => {
    const source = await readFile('src/opzava/platform/providers/cost-events.ts', 'utf8')

    expect(source).not.toContain('Date.now')
    expect(source).not.toContain('crypto')
    expect(source).not.toContain('process.env')
    expect(source).not.toContain("from 'fs'")
    expect(source).not.toContain("from 'node:fs'")
    expect(source).not.toContain("require('fs')")
    expect(source).not.toContain('fetch(')
    expect(source).not.toContain('readFile')
    expect(source).not.toContain('randomUUID')
    expect(source).not.toContain('console.')
    expect(source).not.toContain('./execution')
    expect(source).not.toContain('executeProviderAdapterWithEvents')
  })
})

function eventInput() {
  return {
    recordId: 'operational_event_cost_001',
    costEventId: 'cost_event_001',
    actorId: 'runner:provider-cost',
    occurredAt: '2026-06-15T00:00:02.000Z',
    requestId: 'provider_request_cost_001',
    providerId: 'live-llm',
    operation: 'generate-seo-brief',
    workflowRunId: 'run_001',
    stepRunId: 'step_run_seo_brief_001',
    externalCallId: 'external_call_live_llm_generate_001',
    units: {
      inputTokens: 1200,
      outputTokens: 340,
    },
    estimatedCostCents: 7,
    currency: 'USD',
  }
}

import { describe, expect, it } from 'vitest'

import { parseCostEvent } from './contracts'

describe('Opzava cost event contracts', () => {
  it('accepts estimated cost events linked to workflow and provider usage', () => {
    const event = parseCostEvent({
      schemaVersion: 1,
      costEventId: 'cost_event_001',
      workflowRunId: 'run_001',
      stepRunId: 'step_run_seo_brief_001',
      externalCallId: 'external_call_001',
      providerId: 'mock-llm',
      operation: 'generate-seo-brief',
      units: {
        inputTokens: 1200,
        outputTokens: 800,
      },
      estimatedCostCents: 12,
      actualCostCents: null,
      currency: 'USD',
      recordedAt: '2026-06-15T00:00:03.000Z',
    })

    expect(event.estimatedCostCents).toBe(12)
    expect(event.actualCostCents).toBeNull()
  })

  it('rejects negative cost values', () => {
    expect(() =>
      parseCostEvent({
        schemaVersion: 1,
        costEventId: 'cost_event_bad_001',
        workflowRunId: 'run_001',
        stepRunId: 'step_run_seo_brief_001',
        externalCallId: 'external_call_001',
        providerId: 'mock-llm',
        operation: 'generate-seo-brief',
        units: {
          inputTokens: 1200,
        },
        estimatedCostCents: -1,
        actualCostCents: null,
        currency: 'USD',
        recordedAt: '2026-06-15T00:00:03.000Z',
      }),
    ).toThrow(/greater than or equal to 0|too small/i)
  })

  it('rejects negative unit counts', () => {
    expect(() =>
      parseCostEvent({
        schemaVersion: 1,
        costEventId: 'cost_event_bad_units_001',
        workflowRunId: 'run_001',
        stepRunId: 'step_run_seo_brief_001',
        externalCallId: 'external_call_001',
        providerId: 'mock-llm',
        operation: 'generate-seo-brief',
        units: {
          inputTokens: -1,
        },
        estimatedCostCents: 0,
        actualCostCents: null,
        currency: 'USD',
        recordedAt: '2026-06-15T00:00:03.000Z',
      }),
    ).toThrow(/greater than or equal to 0|too small/i)
  })

  it('rejects unsafe integer cost values', () => {
    expect(() =>
      parseCostEvent({
        schemaVersion: 1,
        costEventId: 'cost_event_unsafe_001',
        workflowRunId: 'run_001',
        stepRunId: 'step_run_seo_brief_001',
        externalCallId: 'external_call_001',
        providerId: 'mock-llm',
        operation: 'generate-seo-brief',
        units: {
          inputTokens: 1200,
        },
        estimatedCostCents: Number.MAX_SAFE_INTEGER + 1,
        actualCostCents: null,
        currency: 'USD',
        recordedAt: '2026-06-15T00:00:03.000Z',
      }),
    ).toThrow(/less than or equal|too big|safe/i)
  })
})

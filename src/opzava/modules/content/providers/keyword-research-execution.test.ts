import { describe, expect, it } from 'vitest'
import type { OperationalEventStorageRecord } from '@/opzava/platform/runner/repository-contracts'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { createMockKeywordResearchProviderAdapter } from './keyword-research-adapter'
import { runKeywordResearchProviderCall } from './keyword-research-execution'

const VALID_IDEA = Object.freeze({
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
})

function sink() {
  const events: OperationalEventStorageRecord[] = []
  return {
    events,
    appendOperationalEvent: (r: OperationalEventStorageRecord) => {
      events.push(r)
    }
  }
}

function deps(s: ReturnType<typeof sink>) {
  let n = 0
  return {
    adapter: createMockKeywordResearchProviderAdapter({ now: () => '2026-06-15T00:00:05.000Z' }),
    eventSink: s,
    newId: () => `id_${++n}`,
    now: () => '2026-06-15T00:00:00.000Z',
    actorId: 'system@opzava',
    clock: { now: () => new Date('2026-06-15T00:00:05.000Z') }
  }
}

describe('runKeywordResearchProviderCall', () => {
  it('routes the provider call through the platform execution path and returns a succeeded result', async () => {
    const idea = parseIdeaIntake(VALID_IDEA)
    const s = sink()
    const execution = await runKeywordResearchProviderCall(deps(s), {
      idea,
      workflowRunId: 'run_001',
      stepRunId: 'step_run_kw_001'
    })

    expect(execution.result.status).toBe('succeeded')
    const output = execution.result.output as { primaryKeyword: string }
    expect(output.primaryKeyword).toBe('Cold Brew')
    expect(execution.externalCallRecord.providerId).toBe('mock-keyword-research')
    expect(execution.externalCallRecord.workflowRunId).toBe('run_001')
  })

  it('emits external-call, cost, and audit operational events to the sink', async () => {
    const idea = parseIdeaIntake(VALID_IDEA)
    const s = sink()
    await runKeywordResearchProviderCall(deps(s), {
      idea,
      workflowRunId: 'run_001',
      stepRunId: 'step_run_kw_001'
    })

    const kinds = s.events.map((e) => e.kind)
    expect(kinds).toContain('external-call')
    expect(kinds).toContain('cost')
    expect(kinds).toContain('audit')
    expect(s.events.length).toBe(3)
  })

  it('records the audit event with the execution status', async () => {
    const idea = parseIdeaIntake(VALID_IDEA)
    const s = sink()
    await runKeywordResearchProviderCall(deps(s), {
      idea,
      workflowRunId: 'run_001',
      stepRunId: 'step_run_kw_001'
    })

    const audit = s.events.find((e) => e.kind === 'audit')
    expect(audit).toBeDefined()
  })
})

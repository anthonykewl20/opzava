import { describe, expect, it } from 'vitest'
import type { OperationalEventStorageRecord } from '@/opzava/platform/runner/repository-contracts'
import { parseIdeaIntake } from '../contracts/idea-intake'
import { createMockSourceCaptureProviderAdapter } from './source-capture-adapter'
import { runSourceCaptureProviderCall } from './source-capture-execution'

const VALID_IDEA = {
  schemaVersion: 1,
  ideaId: 'idea_001',
  title: 'A Title',
  topic: 'Cold Brew',
  requestedBy: 'editor@opzava.test',
  createdAt: '2026-06-17T00:00:00.000Z'
}

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
    adapter: createMockSourceCaptureProviderAdapter({ now: () => '2026-06-15T00:00:05.000Z' }),
    eventSink: s,
    newId: () => `id_${++n}`,
    now: () => '2026-06-15T00:00:00.000Z',
    actorId: 'system@opzava',
    clock: { now: () => new Date('2026-06-15T00:00:05.000Z') }
  }
}

describe('runSourceCaptureProviderCall', () => {
  it('routes the source-capture call through the platform execution path', async () => {
    const idea = parseIdeaIntake(VALID_IDEA)
    const s = sink()
    const execution = await runSourceCaptureProviderCall(deps(s), {
      idea,
      workflowRunId: 'run_001',
      stepRunId: 'step_run_sc_001'
    })
    expect(execution.result.status).toBe('succeeded')
    expect(execution.externalCallRecord.providerId).toBe('mock-source-capture')
    const output = execution.result.output as { sources: unknown[] }
    expect(output.sources.length).toBeGreaterThan(0)
  })

  it('emits external-call, cost, and audit operational events', async () => {
    const idea = parseIdeaIntake(VALID_IDEA)
    const s = sink()
    await runSourceCaptureProviderCall(deps(s), {
      idea,
      workflowRunId: 'run_001',
      stepRunId: 'step_run_sc_001'
    })
    const kinds = s.events.map((e) => e.kind)
    expect(kinds).toContain('external-call')
    expect(kinds).toContain('cost')
    expect(kinds).toContain('audit')
    expect(s.events.length).toBe(3)
  })
})

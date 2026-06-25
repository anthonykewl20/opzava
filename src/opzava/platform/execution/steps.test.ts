import { describe, expect, it } from 'vitest'

import type { EngineEvent } from '@/opzava/core/workflow-engine/engine'
import { executeGraph } from '@/opzava/core/workflow-engine/engine'
import type { StepContract, StepRunContext, WorkflowGraph } from '@/opzava/core/workflow-engine/contracts'
import { RunContext } from '@/opzava/core/workflow-engine/run-context'

import type { UsageSink } from './contracts'
import { makeTaskExecutor } from './executor'
import { makeInMemoryProvider } from './in-memory-provider'
import { DISPATCH_STEP_KIND, makeDispatchStep, makeReviewStep, REVIEW_STEP_KIND } from './steps'

const noopSink: UsageSink = { record: () => {} }

function ctx(inputs: Record<string, unknown>, context = new RunContext()): StepRunContext {
  return { stepId: 's1', inputs, context }
}

describe('dispatch step', () => {
  it('runs the task through the executor and writes the text output', async () => {
    const provider = makeInMemoryProvider(() => ({ text: 'feature implemented' }))
    const executor = makeTaskExecutor({ provider, usageSink: noopSink })
    const step = makeDispatchStep(executor)

    const result = await step.run(ctx({ task: { id: 1, title: 'do it' }, plan: { model: 'm' } }))

    expect(result.status).toBe('succeeded')
    expect(result.outputs.text).toBe('feature implemented')
  })
})

describe('review step', () => {
  it('reviews the upstream output (read from RunContext) and branches APPROVED', async () => {
    let seenPrompt = ''
    const provider = makeInMemoryProvider((input) => {
      seenPrompt = input.prompt
      return { text: 'VERDICT: APPROVED\nNOTES: solid' }
    })
    const step = makeReviewStep(provider, 'claude-sonnet-4-6')

    const context = new RunContext()
    context.set('s_src', 'text', 'the agent output under review')
    const result = await step.run({ stepId: 's2', inputs: { title: 'T', sourceStep: 's_src' }, context })

    expect(result.status).toBe('succeeded')
    expect(result.edgeSourceHandle).toBe('approved')
    expect(result.outputs.valid).toBe(true)
    // inter-step data flow: the upstream output was pulled into the review prompt
    expect(seenPrompt).toContain('the agent output under review')
  })

  it('branches REJECTED on a default-DENY verdict', async () => {
    const provider = makeInMemoryProvider(() => ({ text: 'looks fine to me' })) // no anchored VERDICT line
    const step = makeReviewStep(provider, 'm')
    const result = await step.run({ stepId: 's2', inputs: { title: 'T', sourceStep: 's_src' }, context: new RunContext() })
    expect(result.edgeSourceHandle).toBe('rejected')
    expect(result.outputs.valid).toBe(false)
  })
})

describe('engine integration — a CardDecomposition graph executes end-to-end', () => {
  it('runs dispatch → review through the workflow-engine, threading data between steps', async () => {
    const dispatchProvider = makeInMemoryProvider(() => ({ text: 'I implemented the limiter.' }))
    const executor = makeTaskExecutor({ provider: dispatchProvider, usageSink: noopSink })

    let reviewedOutput = ''
    const reviewProvider = makeInMemoryProvider((input) => {
      reviewedOutput = input.prompt
      return { text: 'VERDICT: APPROVED\nNOTES: ok' }
    })

    const contracts = new Map<string, StepContract>([
      [DISPATCH_STEP_KIND, makeDispatchStep(executor)],
      [REVIEW_STEP_KIND, makeReviewStep(reviewProvider, 'claude-sonnet-4-6')],
    ])

    const graph: WorkflowGraph = {
      steps: [
        { id: 's1', kind: DISPATCH_STEP_KIND, data: { task: { id: 9, title: 'rate limit' }, plan: { model: 'm' } } },
        { id: 's2', kind: REVIEW_STEP_KIND, data: { title: 'rate limit', sourceStep: 's1' } },
      ],
      edges: [{ source: 's1', target: 's2', sourceHandle: 'source' }],
    }

    const events: EngineEvent[] = []
    for await (const ev of executeGraph(graph, { contracts })) events.push(ev)

    const ended = (id: string) => events.find((e) => e.type === 'step-end' && e.stepId === id)
    expect(ended('s1')?.result?.status).toBe('succeeded')
    expect(ended('s2')?.result?.status).toBe('succeeded')
    expect(ended('s2')?.result?.edgeSourceHandle).toBe('approved')
    expect(events.at(-1)).toEqual({ type: 'graph-end', status: 'succeeded' })
    // the review step pulled s1's dispatch output through the shared RunContext
    expect(reviewedOutput).toContain('I implemented the limiter.')
  })
})

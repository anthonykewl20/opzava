import { describe, expect, it } from 'vitest'

import { executeGraph } from './engine'
import { RunContext } from './run-context'
import { EDGE_HANDLE, validateGraph, type StepContract, type WorkflowGraph } from './contracts'

// Step ids match their kinds (so RunContext reads under the kind work). RunContext is keyed
// by stepId — the engine's choice — and stepId must be unique per graph.

const step = (id: string, kind: string, data: Record<string, unknown> = {}) => ({ id, kind, data })
const edge = (source: string, target: string, sourceHandle = 'source') => ({ source, target, sourceHandle })

async function run(graph: WorkflowGraph, contracts: Map<string, StepContract>, context?: RunContext) {
  const events: Array<{ type: string; stepId?: string; status?: string }> = []
  for await (const ev of executeGraph(graph, { contracts, context })) events.push(ev)
  return events
}

describe('engine: edge-state DAG scheduler', () => {
  it('runs a linear graph A→B→C with output chaining via RunContext', async () => {
    const contracts = new Map<string, StepContract>([
      ['A', { kind: 'A', inputs: [], outputs: [], run: async () => ({ status: 'succeeded', outputs: { x: 1 } }) }],
      ['B', { kind: 'B', inputs: [], outputs: [], run: async (ctx) => ({ status: 'succeeded', outputs: { y: (ctx.context.get('A', 'x') as number) + 1 } }) }],
      ['C', { kind: 'C', inputs: [], outputs: [], run: async (ctx) => ({ status: 'succeeded', outputs: { z: (ctx.context.get('B', 'y') as number) + 1 } }) }],
    ])
    const graph: WorkflowGraph = { steps: [step('A', 'A'), step('B', 'B'), step('C', 'C')], edges: [edge('A', 'B'), edge('B', 'C')] }
    const ctx = new RunContext()
    const events = await run(graph, contracts, ctx)

    const ran = new Set(events.filter((e) => e.type === 'step-end').map((e) => e.stepId))
    expect(ran).toEqual(new Set(['A', 'B', 'C']))
    expect(ctx.get('A', 'x')).toBe(1)
    expect(ctx.get('B', 'y')).toBe(2)
    expect(ctx.get('C', 'z')).toBe(3)
    expect(events.at(-1)).toMatchObject({ type: 'graph-end', status: 'succeeded' })
  })

  it('runs parallel branches A→[B,C]→D (D waits for both)', async () => {
    const contracts = new Map<string, StepContract>([
      ['A', { kind: 'A', inputs: [], outputs: [], run: async () => ({ status: 'succeeded', outputs: {} }) }],
      ['B', { kind: 'B', inputs: [], outputs: [], run: async () => ({ status: 'succeeded', outputs: { b: 1 } }) }],
      ['C', { kind: 'C', inputs: [], outputs: [], run: async () => ({ status: 'succeeded', outputs: { c: 2 } }) }],
      ['D', { kind: 'D', inputs: [], outputs: [], run: async (ctx) => ({ status: 'succeeded', outputs: { sum: (ctx.context.get('B', 'b') as number) + (ctx.context.get('C', 'c') as number) } }) }],
    ])
    const graph: WorkflowGraph = { steps: [step('A', 'A'), step('B', 'B'), step('C', 'C'), step('D', 'D')], edges: [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')] }
    const ctx = new RunContext()
    const events = await run(graph, contracts, ctx)

    expect(events.filter((e) => e.type === 'step-end').map((e) => e.stepId)).toContain('D')
    expect(ctx.get('D', 'sum')).toBe(3)
  })

  it('routes conditionally: edgeSourceHandle selects the branch (branching is data)', async () => {
    const contracts = new Map<string, StepContract>([
      ['decide', { kind: 'decide', inputs: [], outputs: [], run: async () => ({ status: 'succeeded', outputs: {}, edgeSourceHandle: EDGE_HANDLE.APPROVED }) }],
      ['ok', { kind: 'ok', inputs: [], outputs: [], run: async () => ({ status: 'succeeded', outputs: { ok: true } }) }],
      ['fail', { kind: 'fail', inputs: [], outputs: [], run: async () => ({ status: 'succeeded', outputs: { fail: true } }) }],
    ])
    const graph: WorkflowGraph = {
      steps: [step('D', 'decide'), step('OK', 'ok'), step('FAIL', 'fail')],
      edges: [edge('D', 'OK', EDGE_HANDLE.APPROVED), edge('D', 'FAIL', EDGE_HANDLE.REJECTED)],
    }
    const events = await run(graph, contracts)
    const ran = new Set(events.filter((e) => e.type === 'step-end').map((e) => e.stepId))
    expect(ran.has('OK')).toBe(true) // approved branch ran
    expect(ran.has('FAIL')).toBe(false) // rejected branch skipped
  })

  it('marks the graph failed when a step fails and skips downstream', async () => {
    const contracts = new Map<string, StepContract>([
      ['A', { kind: 'A', inputs: [], outputs: [], run: async () => ({ status: 'failed', outputs: {}, error: 'boom' }) }],
      ['B', { kind: 'B', inputs: [], outputs: [], run: async () => ({ status: 'succeeded', outputs: {} }) }],
    ])
    const graph: WorkflowGraph = { steps: [step('A', 'A'), step('B', 'B')], edges: [edge('A', 'B')] }
    const events = await run(graph, contracts)
    const ran = new Set(events.filter((e) => e.type === 'step-end').map((e) => e.stepId))
    expect(ran.has('A')).toBe(true)
    expect(ran.has('B')).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: 'graph-end', status: 'failed' })
  })
})

describe('RunContext', () => {
  it('set/get/getStep', () => {
    const ctx = new RunContext()
    ctx.set('A', 'x', 1)
    ctx.set('A', 'y', 'hello')
    expect(ctx.get('A', 'x')).toBe(1)
    expect(ctx.get('A', 'y')).toBe('hello')
    expect(ctx.get('A', 'z')).toBeUndefined()
    expect(ctx.getStep('A')).toEqual({ x: 1, y: 'hello' })
  })

  it('resolveTemplate resolves {{#stepId.var#}} + reserved sys/env scopes', () => {
    const ctx = new RunContext({ env: { KEY: 'secret' }, sys: { runId: 'r1' } })
    ctx.set('A', 'name', 'World')
    expect(ctx.resolveTemplate('Hello {{#A.name#}}!')).toBe('Hello World!')
    expect(ctx.resolveTemplate('{{#sys.runId#}} / {{#env.KEY#}}')).toBe('r1 / secret')
    expect(ctx.resolveTemplate('missing: {{#A.missing#}}')).toBe('missing: ')
  })

  it('resolve: scope.name selector', () => {
    const ctx = new RunContext({ sys: { x: 42 } })
    ctx.set('B', 'val', 'test')
    expect(ctx.resolve('B', 'val')).toBe('test')
    expect(ctx.resolve('sys', 'x')).toBe(42)
    expect(ctx.resolve('B', 'nope')).toBeUndefined()
  })
})

describe('validateGraph', () => {
  it('rejects edges referencing missing steps', () => {
    const errors = validateGraph({ steps: [step('A', 'A')], edges: [edge('A', 'ghost')] })
    expect(errors).toContain("edge target 'ghost' has no step")
  })

  it('accepts a well-formed graph', () => {
    const errors = validateGraph({ steps: [step('A', 'A'), step('B', 'B')], edges: [edge('A', 'B')] })
    expect(errors).toEqual([])
  })
})

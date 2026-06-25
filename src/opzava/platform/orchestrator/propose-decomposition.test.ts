import { describe, expect, it, vi } from 'vitest'

import { makeInMemoryProvider } from '@/opzava/platform/execution/in-memory-provider'

import { buildDecompositionPrompt, proposeDecomposition, type ProposeDeps } from './propose-decomposition'

const FRONTIER = 'claude-opus-4-6' // resolves to frontier via the model-tier family heuristic
const card = { id: 9, title: 'Add rate limiting', description: 'throttle the public API' }

const validGraphJson = JSON.stringify({
  steps: [
    { id: 's1', kind: 'dispatch', data: {} },
    { id: 's2', kind: 'review', data: {} },
  ],
  edges: [{ source: 's1', target: 's2', sourceHandle: 'source' }],
})

function deps(text: string): ProposeDeps {
  return { provider: makeInMemoryProvider(() => ({ text })) }
}

describe('proposeDecomposition', () => {
  it('emits a candidate WorkflowGraph from a frontier model', async () => {
    const outcome = await proposeDecomposition({ card, model: FRONTIER }, deps(validGraphJson))
    expect(outcome.kind).toBe('proposed')
    if (outcome.kind === 'proposed') {
      expect(outcome.graph.steps.map((s) => s.id)).toEqual(['s1', 's2'])
      expect(outcome.graph.edges).toHaveLength(1)
    }
  })

  it('enforces the frontier-lock: a non-frontier model is refused WITHOUT calling the provider', async () => {
    const invoke = vi.fn(async () => ({ text: validGraphJson }))
    const outcome = await proposeDecomposition(
      { card, model: 'claude-sonnet-4-6' }, // standard tier
      { provider: { invoke, isAvailable: () => true } },
    )
    expect(outcome.kind).toBe('rejected')
    if (outcome.kind === 'rejected') expect(outcome.reason).toBe('not-frontier')
    expect(invoke).not.toHaveBeenCalled() // refused before any model call
  })

  it('rejects a malformed (non-JSON) emission cleanly', async () => {
    const outcome = await proposeDecomposition({ card, model: FRONTIER }, deps('I cannot decompose this task.'))
    expect(outcome.kind).toBe('rejected')
    if (outcome.kind === 'rejected') expect(outcome.reason).toBe('malformed-emission')
  })

  it('rejects an emission that parses but fails the WorkflowGraph schema (empty steps)', async () => {
    const outcome = await proposeDecomposition({ card, model: FRONTIER }, deps('{"steps":[],"edges":[]}'))
    expect(outcome.kind).toBe('rejected')
    if (outcome.kind === 'rejected') expect(outcome.reason).toBe('invalid-graph')
  })

  it('tolerates a ```json fenced emission with surrounding prose', async () => {
    const fenced = 'Here is the plan:\n```json\n' + validGraphJson + '\n```\nHope that helps!'
    const outcome = await proposeDecomposition({ card, model: FRONTIER }, deps(fenced))
    expect(outcome.kind).toBe('proposed')
  })

  it('buildDecompositionPrompt embeds the card + the shape/kind/JSON constraints', () => {
    const prompt = buildDecompositionPrompt(card, 8)
    expect(prompt).toContain('Add rate limiting')
    expect(prompt).toContain('LINEAR or FAN-OUT')
    expect(prompt).toContain('"steps"')
    expect(prompt).toContain('At most 8 steps')
  })
})

import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import type { GatePolicy } from '@/opzava/core/orchestration-policy/contracts'
import type { WorkflowGraph } from '@/opzava/core/workflow-engine/contracts'
import { makeTaskExecutor } from '@/opzava/platform/execution/executor'
import { makeInMemoryProvider } from '@/opzava/platform/execution/in-memory-provider'
import { makeCardDecomposition } from '@/opzava/platform/task-state/decomposition'

import { decomposeAndExecute, hydrateGraph, type DecomposeAndExecuteDeps } from './decompose-and-execute'

const card = { id: 5, title: 'Add rate limiting', description: 'throttle the API' }

const proposed: WorkflowGraph = {
  steps: [
    { id: 's1', kind: 'dispatch', data: {} },
    { id: 's2', kind: 'review', data: {} },
  ],
  edges: [{ source: 's1', target: 's2', sourceHandle: 'source' }],
}

describe('hydrateGraph', () => {
  it('fills a dispatch step with an executor-ready task + plan', () => {
    const out = hydrateGraph(proposed, { card, workerModel: 'claude-sonnet-4-6' })
    const s1 = out.steps.find((s) => s.id === 's1')!
    expect((s1.data.task as { id: number }).id).toBe(5)
    expect((s1.data.plan as { model: string }).model).toBe('claude-sonnet-4-6')
  })

  it('fills a review step with the title + the upstream sourceStep (from its in-edge)', () => {
    const out = hydrateGraph(proposed, { card, workerModel: 'm' })
    const s2 = out.steps.find((s) => s.id === 's2')!
    expect(s2.data.title).toBe('Add rate limiting')
    expect(s2.data.sourceStep).toBe('s1') // source of s2's in-edge
  })

  it('preserves the edges', () => {
    const out = hydrateGraph(proposed, { card, workerModel: 'm' })
    expect(out.edges).toEqual(proposed.edges)
  })
})

describe('decomposeAndExecute (the full fleet flow: propose → gate → persist → hydrate → execute)', () => {
  const FRONTIER = 'claude-opus-4-6'
  const policy: GatePolicy & { maxSteps: number } = { maxSteps: 8, budgetUsd: 5, allowedShapes: ['linear', 'fan-out'] }

  let db: Database.Database
  beforeEach(() => {
    db = new Database(':memory:')
    runMigrations(db)
  })
  afterEach(() => db.close())

  function graphJson(kinds: [string, string] = ['dispatch', 'review']): string {
    return JSON.stringify({
      steps: [
        { id: 's1', kind: kinds[0], data: {} },
        { id: 's2', kind: kinds[1], data: {} },
      ],
      edges: [{ source: 's1', target: 's2', sourceHandle: 'source' }],
    })
  }

  function deps(emission: string): DecomposeAndExecuteDeps {
    return {
      provider: makeInMemoryProvider(() => ({ text: emission })), // frontier proposer
      decomposition: makeCardDecomposition(db, () => 1000),
      registeredStepKinds: () => new Set(['dispatch', 'review']),
      estimateGraphCostUsd: () => 0.2,
      audit: () => {},
      workerExecutor: makeTaskExecutor({
        provider: makeInMemoryProvider(() => ({ text: 'the worker did the job' })),
        usageSink: { record: () => {} },
      }),
      reviewProvider: makeInMemoryProvider(() => ({ text: 'VERDICT: APPROVED\nNOTES: solid' })),
    }
  }

  const input = { workspaceId: 1, card, model: FRONTIER, policy, workerModel: 'claude-sonnet-4-6', reviewModel: 'claude-sonnet-4-6' }

  it('runs a card all the way to a succeeded graph execution', async () => {
    const outcome = await decomposeAndExecute(input, deps(graphJson()))
    expect(outcome.kind).toBe('executed')
    if (outcome.kind === 'executed') {
      expect(outcome.status).toBe('succeeded')
      expect(outcome.graphId).toBeGreaterThan(0)
    }
  })

  it('stops at proposal-rejected (frontier-lock) and never executes', async () => {
    const outcome = await decomposeAndExecute({ ...input, model: 'claude-sonnet-4-6' }, deps(graphJson()))
    expect(outcome.kind).toBe('proposal-rejected')
  })

  it('stops at gate-rejected (unknown step kind) and never executes', async () => {
    const outcome = await decomposeAndExecute(input, deps(graphJson(['frobnicate', 'review'])))
    expect(outcome.kind).toBe('gate-rejected')
  })
})

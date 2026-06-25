import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import type { GatePolicy } from '@/opzava/core/orchestration-policy/contracts'
import { makeInMemoryProvider } from '@/opzava/platform/execution/in-memory-provider'
import { makeCardDecomposition } from '@/opzava/platform/task-state/decomposition'

import { runDecomposition, type RunDecompositionDeps } from './run-decomposition'

const FRONTIER = 'claude-opus-4-6'
const card = { id: 9, title: 'Add rate limiting' }
const policy: GatePolicy & { maxSteps: number } = {
  maxSteps: 8,
  budgetUsd: 5,
  allowedShapes: ['linear', 'fan-out'],
}

function graphJson(kinds: [string, string] = ['dispatch', 'review']): string {
  return JSON.stringify({
    steps: [
      { id: 's1', kind: kinds[0], data: {} },
      { id: 's2', kind: kinds[1], data: {} },
    ],
    edges: [{ source: 's1', target: 's2', sourceHandle: 'source' }],
  })
}

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
})

afterEach(() => {
  db.close()
})

function deps(emission: string): RunDecompositionDeps {
  return {
    provider: makeInMemoryProvider(() => ({ text: emission })),
    decomposition: makeCardDecomposition(db, () => 1000),
    registeredStepKinds: () => new Set(['dispatch', 'review']),
    estimateGraphCostUsd: () => 0.2,
    audit: () => {},
  }
}

function activeGraphCount(taskId: number): number {
  return (db.prepare("SELECT COUNT(*) AS c FROM opzava_card_workflow_graph WHERE task_id = ? AND status = 'active'").get(taskId) as { c: number }).c
}

describe('runDecomposition (propose → gate → persist)', () => {
  it('proposes via the frontier model, gates, and persists', async () => {
    const outcome = await runDecomposition({ workspaceId: 1, card, model: FRONTIER, policy }, deps(graphJson()))
    expect(outcome.kind).toBe('decomposed')
    if (outcome.kind === 'decomposed') expect(outcome.graphId).toBeGreaterThan(0)
    expect(activeGraphCount(9)).toBe(1)
  })

  it('proposal-rejected (frontier-lock) when the orchestrator model is not frontier — nothing persisted', async () => {
    const outcome = await runDecomposition({ workspaceId: 1, card, model: 'claude-sonnet-4-6', policy }, deps(graphJson()))
    expect(outcome.kind).toBe('proposal-rejected')
    if (outcome.kind === 'proposal-rejected') expect(outcome.reason).toBe('not-frontier')
    expect(activeGraphCount(9)).toBe(0)
  })

  it('gate-rejected when a schema-valid graph uses an unregistered step kind — nothing persisted', async () => {
    // The emission parses + passes the WorkflowGraph schema, but 'frobnicate' has no executor →
    // the gate (not the proposal) rejects it.
    const outcome = await runDecomposition({ workspaceId: 1, card, model: FRONTIER, policy }, deps(graphJson(['frobnicate', 'review'])))
    expect(outcome.kind).toBe('gate-rejected')
    if (outcome.kind === 'gate-rejected') {
      expect(outcome.denials.some((d) => d.code === 'unknown-step-kind')).toBe(true)
    }
    expect(activeGraphCount(9)).toBe(0)
  })

  it('is idempotent across the full flow — a re-run returns the existing graph', async () => {
    const d = deps(graphJson())
    const first = await runDecomposition({ workspaceId: 1, card, model: FRONTIER, policy }, d)
    const second = await runDecomposition({ workspaceId: 1, card, model: FRONTIER, policy }, d)
    expect(first.kind).toBe('decomposed')
    expect(second.kind).toBe('already-decomposed')
    expect(activeGraphCount(9)).toBe(1)
  })
})

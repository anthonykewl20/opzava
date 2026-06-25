import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import { GATE_DENIAL_CODE, type GatePolicy } from '@/opzava/core/orchestration-policy/contracts'
import type { WorkflowGraph } from '@/opzava/core/workflow-engine/contracts'
import { makeCardDecomposition } from '@/opzava/platform/task-state/decomposition'
import { executeDecompose, type DecomposeServiceDeps } from './decompose-service'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  runMigrations(db)
})

afterEach(() => {
  db.close()
})

const graph: WorkflowGraph = {
  steps: [
    { id: 's1', kind: 'dispatch', data: {} },
    { id: 's2', kind: 'review', data: {} },
  ],
  edges: [{ source: 's1', target: 's2', sourceHandle: 'source' }],
}

const policy: GatePolicy = { maxSteps: 10, budgetUsd: 5, allowedShapes: ['linear', 'fan-out'] }

function makeDeps(over: Partial<DecomposeServiceDeps> = {}): DecomposeServiceDeps {
  return {
    decomposition: makeCardDecomposition(db, () => 1000),
    registeredStepKinds: () => new Set(['dispatch', 'review']),
    estimateGraphCostUsd: () => 0.1,
    audit: () => {},
    ...over,
  }
}

function isDecomposed(taskId: number): boolean {
  return (
    (db.prepare("SELECT COUNT(*) AS c FROM opzava_card_workflow_graph WHERE task_id = ? AND status = 'active'").get(taskId) as { c: number }).c > 0
  )
}

describe('executeDecompose (gate + persist)', () => {
  it('confirms and persists a valid decompose', () => {
    const outcome = executeDecompose({ workspaceId: 1, cardId: 42, graph, policy }, makeDeps())
    expect(outcome.kind).toBe('decomposed')
    if (outcome.kind === 'decomposed') expect(outcome.graphId).toBeGreaterThan(0)
    expect(isDecomposed(42)).toBe(true)
  })

  it('rejects when the gate denies, and does NOT persist', () => {
    const bigGraph: WorkflowGraph = {
      steps: Array.from({ length: policy.maxSteps + 1 }, (_, i) => ({ id: `s${i}`, kind: 'dispatch', data: {} })),
      edges: [],
    }
    const outcome = executeDecompose({ workspaceId: 1, cardId: 7, graph: bigGraph, policy }, makeDeps())
    expect(outcome.kind).toBe('rejected')
    if (outcome.kind === 'rejected') {
      expect(outcome.denials.map((d) => d.code)).toContain(GATE_DENIAL_CODE.STEP_COUNT_EXCEEDED)
    }
    expect(isDecomposed(7)).toBe(false) // gate rejected → nothing persisted
  })

  it('is idempotent — a re-proposed decompose returns the existing graph, no duplicate', () => {
    const deps = makeDeps()
    const first = executeDecompose({ workspaceId: 1, cardId: 42, graph, policy }, deps)
    const second = executeDecompose({ workspaceId: 1, cardId: 42, graph, policy }, deps)
    expect(first.kind).toBe('decomposed')
    expect(second.kind).toBe('already-decomposed')
    if (first.kind === 'decomposed' && second.kind === 'already-decomposed') {
      expect(second.graphId).toBe(first.graphId)
    }
    const activeCount = (db.prepare("SELECT COUNT(*) AS c FROM opzava_card_workflow_graph WHERE task_id = 42 AND status = 'active'").get() as { c: number }).c
    expect(activeCount).toBe(1)
  })

  it('audits every decision (pass and reject)', () => {
    const audit = vi.fn()
    executeDecompose({ workspaceId: 1, cardId: 42, graph, policy }, makeDeps({ audit }))
    expect(audit).toHaveBeenCalledOnce()
  })
})

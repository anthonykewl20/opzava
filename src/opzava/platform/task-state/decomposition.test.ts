import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { runMigrations } from '@/lib/migrations'
import type { WorkflowGraph } from '@/opzava/core/workflow-engine/contracts'
import { makeCardDecomposition, rollupCardStatus } from './decomposition'

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

function activeCount(taskId: number): number {
  return (
    db
      .prepare("SELECT COUNT(*) AS c FROM opzava_card_workflow_graph WHERE task_id = ? AND status = 'active'")
      .get(taskId) as { c: number }
  ).c
}

describe('CardDecomposition', () => {
  it('persists an active graph for a Card', () => {
    const d = makeCardDecomposition(db, () => 1000)
    const result = d.persist(42, 1, graph)
    expect(result.created).toBe(true)
    expect(result.graphId).toBeGreaterThan(0)
    expect(activeCount(42)).toBe(1)
  })

  it('is idempotent — a second persist keeps the existing active graph', () => {
    const d = makeCardDecomposition(db, () => 1000)
    const first = d.persist(42, 1, graph)
    const second = d.persist(42, 1, { steps: [{ id: 'x', kind: 'dispatch', data: {} }], edges: [] })
    expect(second).toEqual({ graphId: first.graphId, created: false })
    expect(activeCount(42)).toBe(1) // no duplicate active row
  })

  it('isDecomposed reflects the active decomposition (the gate idempotency dep)', () => {
    const d = makeCardDecomposition(db, () => 1000)
    expect(d.isDecomposed(1, 42)).toBe(false)
    d.persist(42, 1, graph)
    expect(d.isDecomposed(1, 42)).toBe(true)
    expect(d.isDecomposed(1, 99)).toBe(false) // a different card
    expect(d.isDecomposed(2, 42)).toBe(false) // a different workspace
  })

  it('getActiveGraph round-trips the persisted WorkflowGraph (validated on read)', () => {
    const d = makeCardDecomposition(db, () => 1000)
    d.persist(42, 1, graph)
    expect(d.getActiveGraph(42)).toEqual(graph)
    expect(d.getActiveGraph(99)).toBeNull()
  })

  describe('rollupCardStatus (H-r1 precedence)', () => {
    it('failed wins over everything', () => {
      expect(rollupCardStatus(['done', 'failed', 'in_progress', 'quality_review'])).toBe('failed')
    })
    it('quality_review (needs-you) beats in_progress/done', () => {
      expect(rollupCardStatus(['done', 'in_progress', 'quality_review'])).toBe('quality_review')
    })
    it('in_progress when any step is running/pending and none failed/needs-review', () => {
      expect(rollupCardStatus(['done', 'in_progress'])).toBe('in_progress')
      expect(rollupCardStatus(['done', 'pending'])).toBe('in_progress')
    })
    it('done only when every step is done', () => {
      expect(rollupCardStatus(['done', 'done'])).toBe('done')
    })
    it('pending when there are no steps yet', () => {
      expect(rollupCardStatus([])).toBe('pending')
    })
  })
})

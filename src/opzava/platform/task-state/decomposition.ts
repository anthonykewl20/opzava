import type Database from 'better-sqlite3'

import { workflowGraphSchema, type WorkflowGraph } from '@/opzava/core/workflow-engine/contracts'

/**
 * CardDecomposition (ARD 0026 H4) — the persistence half of the decompose pipeline: the gate
 * (`core/orchestration-policy`) CONFIRMS a `decompose`; this module EXECUTES it by persisting the
 * `WorkflowGraph` linked to the Card's `tasks` row (by value) in `opzava_card_workflow_graph`.
 *
 * The Card stays ONE `tasks` row (ARD 0013 D1 — no `opzava_card` table); its Steps run as
 * `StepRun`s, never new Cards. The partial-unique index `(task_id) WHERE status='active'`
 * (migration 059) makes "a Card has at most one active decomposition" a DB invariant, so
 * `persist` is idempotent. `isDecomposed` is the function the gate injects as
 * `isDecompositionDuplicate`. Platform (owns the table); composes `core/workflow-engine`.
 */

/** A Card's rolled-up status over its graph's StepRuns (H-r1 precedence). */
export type CardRollupStatus = 'failed' | 'quality_review' | 'in_progress' | 'done' | 'pending'

/** The StepRun states the rollup folds (a Step's lifecycle, not the Card's). */
export type StepRollupStatus = 'failed' | 'quality_review' | 'in_progress' | 'pending' | 'done'

export interface PersistResult {
  readonly graphId: number
  /** false ⇒ an active decomposition already existed (idempotent no-op). */
  readonly created: boolean
}

export interface CardDecomposition {
  /** Persist `graph` as the Card's active decomposition. Idempotent per (task_id) active-index. */
  persist(taskId: number, workspaceId: number, graph: WorkflowGraph): PersistResult
  /** True iff the Card has an active decomposition (the gate's idempotency check). */
  isDecomposed(workspaceId: number, taskId: number): boolean
  /** The Card's active `WorkflowGraph`, or null. Validated on read. */
  getActiveGraph(taskId: number): WorkflowGraph | null
}

/**
 * Roll a decomposed Card's status up from its StepRuns (H-r1). Precedence (mirrors ProjectHealth):
 * `failed` > `quality_review` (needs-you) > `in_progress` (running/ready) > `done` (all done).
 * Pure. Empty ⇒ `pending` (decomposed, no Steps materialized yet).
 */
export function rollupCardStatus(steps: readonly StepRollupStatus[]): CardRollupStatus {
  if (steps.length === 0) return 'pending'
  if (steps.includes('failed')) return 'failed'
  if (steps.includes('quality_review')) return 'quality_review'
  if (steps.some((s) => s === 'in_progress' || s === 'pending')) return 'in_progress'
  return 'done' // every step is done
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
}

export function makeCardDecomposition(
  db: Database.Database,
  now: () => number = () => Math.floor(Date.now() / 1000),
): CardDecomposition {
  function activeGraphId(taskId: number): number | null {
    const row = db
      .prepare("SELECT id FROM opzava_card_workflow_graph WHERE task_id = ? AND status = 'active'")
      .get(taskId) as { id: number } | undefined
    return row?.id ?? null
  }

  return {
    persist(taskId, workspaceId, graph): PersistResult {
      // SELECT-first idempotency (MASTER-PLAN A2 idiom): an existing active decomposition is kept.
      const existing = activeGraphId(taskId)
      if (existing !== null) return { graphId: existing, created: false }

      const ts = now()
      try {
        const info = db
          .prepare(
            `INSERT INTO opzava_card_workflow_graph (task_id, workspace_id, graph_json, status, created_at, updated_at)
             VALUES (?, ?, ?, 'active', ?, ?)`,
          )
          .run(taskId, workspaceId, JSON.stringify(graph), ts, ts)
        return { graphId: Number(info.lastInsertRowid), created: true }
      } catch (err) {
        // A concurrent persist won the unique-active race — return the row it created.
        if (isUniqueViolation(err)) {
          const winner = activeGraphId(taskId)
          if (winner !== null) return { graphId: winner, created: false }
        }
        throw err
      }
    },

    isDecomposed(workspaceId, taskId): boolean {
      const row = db
        .prepare(
          "SELECT 1 AS x FROM opzava_card_workflow_graph WHERE task_id = ? AND workspace_id = ? AND status = 'active'",
        )
        .get(taskId, workspaceId) as { x: number } | undefined
      return row !== undefined
    },

    getActiveGraph(taskId): WorkflowGraph | null {
      const row = db
        .prepare("SELECT graph_json FROM opzava_card_workflow_graph WHERE task_id = ? AND status = 'active'")
        .get(taskId) as { graph_json: string } | undefined
      if (!row) return null
      return workflowGraphSchema.parse(JSON.parse(row.graph_json))
    },
  }
}

import { z } from 'zod'
import type { RunContext } from './run-context'

/**
 * Workflow-engine contracts (ARD 0014). The typed primitives + the `StepContract` — the
 * single shape both the inherited scheduler-dispatch and the durable runner execute against.
 * Pure `core/` (layering-guarded: no platform/modules/src-lib imports). The interface IS the
 * test surface (Haystack 2.0 lesson: validate connections at wiring-time, not runtime).
 *
 * See CONTEXT.md: Step, WorkflowGraph, Edge/EdgeHandle, RunContext, ReviewStrategy, ModelInvocation.
 */

export const EDGE_HANDLE = {
  SOURCE: 'source',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  ERROR: 'error',
} as const

export const EDGE_STATE = {
  UNKNOWN: 'unknown',
  TAKEN: 'taken',
  SKIPPED: 'skipped',
} as const
export type EdgeState = (typeof EDGE_STATE)[keyof typeof EDGE_STATE]

/** A persisted graph Step (the definition); a StepRun is one execution of it. */
export const stepNodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1), // discriminator mapping to a StepContract
  data: z.record(z.string(), z.unknown()).default({}),
})
export type StepNode = Readonly<z.infer<typeof stepNodeSchema>>

/** A directed Edge with a sourceHandle that selects which downstream Step runs. */
export const stepEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().default(EDGE_HANDLE.SOURCE),
})
export type StepEdge = Readonly<z.infer<typeof stepEdgeSchema>>

/** The WorkflowGraph — the single persisted shape both engines compile to + execute. */
export const workflowGraphSchema = z.object({
  steps: z.array(stepNodeSchema).min(1),
  edges: z.array(stepEdgeSchema),
})
export type WorkflowGraph = Readonly<z.infer<typeof workflowGraphSchema>>

export interface StepSocket {
  name: string
  required: boolean
}

export interface StepRunContext {
  stepId: string
  inputs: Record<string, unknown>
  context: RunContext // read prior outputs + write own
  signal?: AbortSignal
}

export interface NodeRunResult {
  status: 'succeeded' | 'failed' | 'paused'
  outputs: Record<string, unknown> // written to RunContext under stepId
  edgeSourceHandle?: string // which out-edge to activate (default 'source')
  error?: string
}

/**
 * StepContract — the DEEP module: a tiny interface (inputs/outputs/run) behind which each
 * kind (dispatch, review, content-step, …) hides rich behavior. Two+ adapters = a real seam.
 */
export interface StepContract {
  kind: string
  inputs: StepSocket[]
  outputs: StepSocket[]
  run(ctx: StepRunContext): Promise<NodeRunResult>
}

/** Edge-state map key: `${source}->${target}/${sourceHandle}`. */
export type EdgeStateMap = Map<string, EdgeState>
export function edgeKey(source: string, target: string, sourceHandle: string): string {
  return `${source}->${target}/${sourceHandle}`
}

/** ReviewStrategy — the reusable quality-judge seam (Aegis + rule-gates are adapters). */
export interface ReviewVerdict {
  valid: boolean
  feedback?: string
  modifiedParams?: Record<string, unknown>
}
export interface ReviewStrategy {
  kind: string
  evaluate(output: unknown, ctx?: Record<string, unknown>): Promise<ReviewVerdict>
}

/** EngineLayer — the cross-cutting hook array (persistence, quota, audit, trace). */
export interface EngineLayer {
  onGraphStart?(graph: WorkflowGraph): void
  onStepStart?(stepId: string): void
  onStepEnd?(stepId: string, result: NodeRunResult): void
  onGraphEnd?(status: 'succeeded' | 'failed'): void
}

/** Validate a graph at wiring-time: edges reference existing steps. (Cycle/reachability TODO.) */
export function validateGraph(graph: WorkflowGraph): string[] {
  const errors: string[] = []
  const ids = new Set(graph.steps.map((s) => s.id))
  for (const e of graph.edges) {
    if (!ids.has(e.source)) errors.push(`edge source '${e.source}' has no step`)
    if (!ids.has(e.target)) errors.push(`edge target '${e.target}' has no step`)
  }
  return errors
}

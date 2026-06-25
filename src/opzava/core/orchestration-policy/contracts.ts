import { z } from 'zod'

import { workflowGraphSchema, type WorkflowGraph } from '@/opzava/core/workflow-engine/contracts'

/**
 * OrchestrationPolicyGate contracts (ARD 0026 H1). The `MainOrchestrator` proposes
 * `OrchestrationPlanAction`s; the control plane CONFIRMS them through this deterministic gate —
 * not per-action human approval. The external-action `Approval` boundary is unchanged: an
 * external-effecting Step mints an `Approval` when it RUNS, never here.
 *
 * Pure `core/` (layering-guarded: no platform/modules/src-lib imports). The interface IS the test
 * surface — `gate()` is a pure decision over (action, policy, deps); the only side effect is the
 * injected `auditAction`. See CONTEXT.md: OrchestrationPlanAction, OrchestrationPolicyGate.
 */

export const ORCHESTRATION_POLICY_SCHEMA_VERSION = 1 as const

/** decompose — promote a Card to a WorkflowGraph (CardDecomposition). The common (~95%) action. */
export const decomposeActionSchema = z.object({
  kind: z.literal('decompose'),
  workspaceId: z.number().int().positive(),
  cardId: z.number().int().positive(),
  graph: workflowGraphSchema,
}).strict()
export type DecomposeAction = Readonly<z.infer<typeof decomposeActionSchema>>

/** assign-to-worker — map one Step of a decomposed graph to a worker agent. */
export const assignToWorkerActionSchema = z.object({
  kind: z.literal('assign-to-worker'),
  workspaceId: z.number().int().positive(),
  graphId: z.string().min(1),
  stepId: z.string().min(1),
  workerId: z.string().min(1),
}).strict()
export type AssignToWorkerAction = Readonly<z.infer<typeof assignToWorkerActionSchema>>

/** reassign — the deliberate re-route exception (monotonic seq + reason). */
export const reassignActionSchema = z.object({
  kind: z.literal('reassign'),
  workspaceId: z.number().int().positive(),
  graphId: z.string().min(1),
  stepId: z.string().min(1),
  workerId: z.string().min(1),
  reason: z.string().min(1).max(500),
  reassignSeq: z.number().int().positive(),
}).strict()
export type ReassignAction = Readonly<z.infer<typeof reassignActionSchema>>

export const orchestrationPlanActionSchema = z.discriminatedUnion('kind', [
  decomposeActionSchema,
  assignToWorkerActionSchema,
  reassignActionSchema,
])
export type OrchestrationPlanAction = Readonly<z.infer<typeof orchestrationPlanActionSchema>>

/** Machine-readable denial codes — the orchestrator (an LLM) re-proposes against these, not prose. */
export const GATE_DENIAL_CODE = {
  GRAPH_INVALID: 'graph-invalid',
  SHAPE_UNSUPPORTED: 'shape-unsupported',
  STEP_COUNT_EXCEEDED: 'step-count-exceeded',
  UNKNOWN_STEP_KIND: 'unknown-step-kind',
  COST_EXCEEDS_BUDGET: 'cost-exceeds-budget',
} as const
export type GateDenialCode = (typeof GATE_DENIAL_CODE)[keyof typeof GATE_DENIAL_CODE]

export interface GateDenial {
  readonly code: GateDenialCode
  readonly detail: string
  readonly field?: string
}

/** PASS carries `idempotent`; FAIL carries ≥1 structured denial. */
export type GateVerdict =
  | { readonly passed: true; readonly idempotent: boolean }
  | { readonly passed: false; readonly denials: readonly GateDenial[] }

/** The shape classifier's verdict (provision 5: only linear/fan-out are emittable in v1). */
export type GraphShape = 'linear' | 'fan-out' | 'unsupported'

/** Operator caps — read from AdminConfig by the platform caller, passed in so the gate stays pure. */
export interface GatePolicy {
  readonly maxSteps: number
  readonly budgetUsd: number
  readonly allowedShapes: readonly Exclude<GraphShape, 'unsupported'>[]
}

/**
 * Injected effect-ports — keep the gate pure `core/` and fully testable with in-memory fakes.
 * better-sqlite3 is synchronous, so these are sync (no async ceremony in a pure decision).
 */
export interface GateDeps {
  /** True when this (workspaceId, cardId) already has an active decomposition. */
  isDecompositionDuplicate(workspaceId: number, cardId: number): boolean
  /** Step kinds the engine has a registered executor for. */
  registeredStepKinds(): ReadonlySet<string>
  /** Deterministic projected cost of running the graph (from ModelTier pricing). */
  estimateGraphCostUsd(graph: WorkflowGraph): number
  /** Durable audit of every gate decision (pass or fail). */
  auditAction(action: OrchestrationPlanAction, verdict: GateVerdict): void
}

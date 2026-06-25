import { gate } from '@/opzava/core/orchestration-policy/gate'
import type {
  GateDenial,
  GateDeps,
  GatePolicy,
  GateVerdict,
  OrchestrationPlanAction,
} from '@/opzava/core/orchestration-policy/contracts'
import type { WorkflowGraph } from '@/opzava/core/workflow-engine/contracts'
import type { CardDecomposition } from '@/opzava/platform/task-state/decomposition'

/**
 * executeDecompose — the control-plane half of the decompose pipeline (ARD 0026 H1+H4). It binds
 * the pure gate (`core/orchestration-policy`) to the persistence module (`CardDecomposition`):
 * the gate CONFIRMS a proposed `WorkflowGraph` (validity / shape / caps / cost / idempotency /
 * audit), and only on a pass does this service PERSIST it. The gate's `isDecompositionDuplicate`
 * is wired to `decomposition.isDecomposed`, so idempotency is one source of truth end-to-end.
 *
 * The orchestrator never mutates state directly: it proposes; this service gates + executes.
 * Platform (Engine B): composes core/orchestration-policy + platform/task-state + core/workflow-engine.
 */

export interface ExecuteDecomposeInput {
  readonly workspaceId: number
  readonly cardId: number
  readonly graph: WorkflowGraph
  readonly policy: GatePolicy
}

export interface DecomposeServiceDeps {
  readonly decomposition: CardDecomposition
  registeredStepKinds(): ReadonlySet<string>
  estimateGraphCostUsd(graph: WorkflowGraph): number
  audit(action: OrchestrationPlanAction, verdict: GateVerdict): void
}

export type DecomposeOutcome =
  | { readonly kind: 'decomposed'; readonly graphId: number }
  | { readonly kind: 'already-decomposed'; readonly graphId: number }
  | { readonly kind: 'rejected'; readonly denials: readonly GateDenial[] }

export function executeDecompose(input: ExecuteDecomposeInput, deps: DecomposeServiceDeps): DecomposeOutcome {
  const action: OrchestrationPlanAction = {
    kind: 'decompose',
    workspaceId: input.workspaceId,
    cardId: input.cardId,
    graph: input.graph,
  }

  // The gate's idempotency check is the SAME source of truth as the write idempotency.
  const gateDeps: GateDeps = {
    isDecompositionDuplicate: (ws, card) => deps.decomposition.isDecomposed(ws, card),
    registeredStepKinds: deps.registeredStepKinds,
    estimateGraphCostUsd: deps.estimateGraphCostUsd,
    auditAction: deps.audit,
  }

  const verdict = gate(action, input.policy, gateDeps)
  if (!verdict.passed) return { kind: 'rejected', denials: verdict.denials }

  // Confirmed → persist. `persist` is itself idempotent (the active-graph index), so a re-proposed
  // (gate-`idempotent`) decompose returns the existing graph rather than creating a duplicate.
  const result = deps.decomposition.persist(input.cardId, input.workspaceId, input.graph)
  return result.created
    ? { kind: 'decomposed', graphId: result.graphId }
    : { kind: 'already-decomposed', graphId: result.graphId }
}

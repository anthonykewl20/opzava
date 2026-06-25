import { validateGraph, type WorkflowGraph } from '@/opzava/core/workflow-engine/contracts'

import {
  GATE_DENIAL_CODE,
  type GateDenial,
  type GateDeps,
  type GatePolicy,
  type GateVerdict,
  type GraphShape,
  type OrchestrationPlanAction,
} from './contracts'

/**
 * Confirm an OrchestrationPlanAction. Pure decision; the only side effect is the injected
 * `auditAction`, called for every verdict (pass or fail). See contracts.ts + ARD 0026 H1.
 *
 * The frontier-lock guards the orchestrator's *competence*; this gate guards its *authority*:
 * the orchestrator may propose any plan but cannot cause any effect this gate (+ the unchanged
 * external-action `Approval` boundary) would not allow any worker to cause.
 */
export function gate(
  action: OrchestrationPlanAction,
  policy: GatePolicy,
  deps: GateDeps,
): GateVerdict {
  const verdict = decide(action, policy, deps)
  deps.auditAction(action, verdict)
  return verdict
}

function decide(action: OrchestrationPlanAction, policy: GatePolicy, deps: GateDeps): GateVerdict {
  if (action.kind === 'decompose') {
    // Idempotency wins first: a Card decomposes at most once. A re-proposal (e.g. orchestrator
    // restart) is a no-op that keeps the existing graph, regardless of the re-proposed shape.
    if (deps.isDecompositionDuplicate(action.workspaceId, action.cardId)) {
      return { passed: true, idempotent: true }
    }

    // Structural integrity first — shape/cost are meaningless on a graph with dangling edges.
    const graphErrors = validateGraph(action.graph)
    if (graphErrors.length > 0) {
      return { passed: false, denials: graphErrors.map((detail) => ({ code: GATE_DENIAL_CODE.GRAPH_INVALID, detail })) }
    }

    const denials: GateDenial[] = []

    const shape = classifyShape(action.graph)
    if (!(policy.allowedShapes as readonly GraphShape[]).includes(shape)) {
      denials.push({
        code: GATE_DENIAL_CODE.SHAPE_UNSUPPORTED,
        detail: `graph shape '${shape}' is not in the allowed set [${policy.allowedShapes.join(', ')}]`,
      })
    }

    if (action.graph.steps.length > policy.maxSteps) {
      denials.push({
        code: GATE_DENIAL_CODE.STEP_COUNT_EXCEEDED,
        detail: `graph has ${action.graph.steps.length} steps; cap is ${policy.maxSteps}`,
      })
    }

    const known = deps.registeredStepKinds()
    for (const step of action.graph.steps) {
      if (!known.has(step.kind)) {
        denials.push({
          code: GATE_DENIAL_CODE.UNKNOWN_STEP_KIND,
          detail: `step '${step.id}' has kind '${step.kind}' with no registered executor`,
          field: step.kind,
        })
      }
    }

    const cost = deps.estimateGraphCostUsd(action.graph)
    if (cost > policy.budgetUsd) {
      denials.push({
        code: GATE_DENIAL_CODE.COST_EXCEEDS_BUDGET,
        detail: `projected cost $${cost.toFixed(2)} exceeds budget $${policy.budgetUsd.toFixed(2)}`,
      })
    }

    if (denials.length > 0) return { passed: false, denials }
  }

  return { passed: true, idempotent: false }
}

/**
 * Classify a graph as `linear` (a chain), `fan-out` (one fork → parallel branches, ≤1 join), or
 * `unsupported` (cyclic or richer DAG). Provision 5: only linear/fan-out are emittable until the
 * graph core's cycle-detection becomes load-bearing — so a cycle is `unsupported`, never run.
 */
function classifyShape(graph: WorkflowGraph): GraphShape {
  const ids = new Set(graph.steps.map((s) => s.id))
  const outdeg = new Map<string, number>()
  const indeg = new Map<string, number>()
  const adj = new Map<string, string[]>()
  for (const id of ids) {
    outdeg.set(id, 0)
    indeg.set(id, 0)
    adj.set(id, [])
  }
  for (const e of graph.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) continue // dangling — validateGraph already flagged it
    outdeg.set(e.source, (outdeg.get(e.source) ?? 0) + 1)
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
    adj.get(e.source)!.push(e.target)
  }

  if (hasCycle(ids, adj, indeg)) return 'unsupported'

  const degrees = [...ids]
  const maxOut = Math.max(0, ...degrees.map((id) => outdeg.get(id) ?? 0))
  const maxIn = Math.max(0, ...degrees.map((id) => indeg.get(id) ?? 0))
  if (maxOut <= 1 && maxIn <= 1) return 'linear'

  const forks = degrees.filter((id) => (outdeg.get(id) ?? 0) > 1).length
  const joins = degrees.filter((id) => (indeg.get(id) ?? 0) > 1).length
  if (forks <= 1 && joins <= 1) return 'fan-out'

  return 'unsupported'
}

/** Kahn's topological sort: if not every node drains, an edge cycle remains. */
function hasCycle(ids: Set<string>, adj: Map<string, string[]>, indeg: Map<string, number>): boolean {
  const remaining = new Map(indeg)
  const queue = [...ids].filter((id) => (remaining.get(id) ?? 0) === 0)
  let processed = 0
  while (queue.length > 0) {
    const node = queue.shift()!
    processed++
    for (const next of adj.get(node) ?? []) {
      const d = (remaining.get(next) ?? 0) - 1
      remaining.set(next, d)
      if (d === 0) queue.push(next)
    }
  }
  return processed < ids.size
}

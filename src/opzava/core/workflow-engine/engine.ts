import {
  EDGE_HANDLE,
  EDGE_STATE,
  type EdgeStateMap,
  type EngineLayer,
  type NodeRunResult,
  type StepContract,
  type StepRunContext,
  type WorkflowGraph,
  edgeKey,
} from './contracts'
import { RunContext } from './run-context'

/**
 * The edge-state DAG scheduler (ARD 0014, after Dify graphon's `GraphStateManager`).
 *
 * ALGORITHM: per-edge state `unknown | taken | skipped`. A Step is **ready** iff it has
 * ≥1 in-edge `taken` AND 0 in-edge `unknown`. Seed roots (no in-edges). On each Step
 * success, mark its out-edges for the returned `edgeSourceHandle` `taken`; un-chosen
 * out-edges `skipped`. Skip-propagation is automatic: a Step whose in-edges are all
 * `skipped` never has a `taken` in-edge → never runs.
 *
 * One mechanism gives parallelism + conditional branching + skip-propagation. In TS this
 * is an async-generator ready-set (`Promise.all` over ready Steps) — no worker-threads.
 *
 * The Engine is PRIMITIVE: it knows nothing about WHAT a Step does (that's the StepContract);
 * persistence/quota/audit are EngineLayers, not engine internals. The interface is the test surface.
 */

export interface EngineEvent {
  type: 'step-start' | 'step-end' | 'graph-end'
  stepId?: string
  result?: NodeRunResult
  status?: 'succeeded' | 'failed'
}

export interface EngineOptions {
  contracts: Map<string, StepContract> // kind -> contract
  layers?: EngineLayer[]
  context?: RunContext
  signal?: AbortSignal
}

export async function* executeGraph(
  graph: WorkflowGraph,
  opts: EngineOptions,
): AsyncGenerator<EngineEvent> {
  const { contracts, layers = [], context = new RunContext(), signal } = opts

  // Initialize all edge states to UNKNOWN.
  const edgeStates: EdgeStateMap = new Map()
  for (const e of graph.edges) {
    edgeStates.set(edgeKey(e.source, e.target, e.sourceHandle), EDGE_STATE.UNKNOWN)
  }

  const stepById = new Map(graph.steps.map((s) => [s.id, s]))
  const completed = new Set<string>()

  for (const layer of layers) layer.onGraphStart?.(graph)

  let failed = false

  while (true) {
    // Find ready steps: not completed; ≥1 TAKEN in-edge; 0 UNKNOWN in-edge; or a root.
    const ready: string[] = []
    for (const step of graph.steps) {
      if (completed.has(step.id)) continue
      const inEdges = graph.edges.filter((e) => e.target === step.id)
      if (inEdges.length === 0) {
        ready.push(step.id) // root
        continue
      }
      let hasTaken = false
      let hasUnknown = false
      for (const e of inEdges) {
        const st = edgeStates.get(edgeKey(e.source, e.target, e.sourceHandle))
        if (st === EDGE_STATE.TAKEN) hasTaken = true
        else if (st === EDGE_STATE.UNKNOWN) hasUnknown = true
      }
      if (hasTaken && !hasUnknown) ready.push(step.id)
    }

    if (ready.length === 0) break // no more ready steps — graph is done

    // Run all ready steps in parallel.
    const results = await Promise.all(
      ready.map(async (stepId) => {
        const step = stepById.get(stepId)!
        const contract = contracts.get(step.kind)
        const runCtx: StepRunContext = { stepId, inputs: step.data, context, signal }

        for (const layer of layers) layer.onStepStart?.(stepId)

        let result: NodeRunResult
        if (!contract) {
          result = { status: 'failed', outputs: {}, error: `no contract for kind '${step.kind}'` }
        } else {
          try {
            result = await contract.run(runCtx)
          } catch (err: unknown) {
            result = {
              status: 'failed',
              outputs: {},
              error: err instanceof Error ? err.message : String(err),
            }
          }
        }

        // Write outputs to context.
        for (const [k, v] of Object.entries(result.outputs)) context.set(stepId, k, v)

        for (const layer of layers) layer.onStepEnd?.(stepId, result)
        return { stepId, result }
      }),
    )

    // Process results: update edge states.
    for (const { stepId, result } of results) {
      completed.add(stepId)
      yield { type: 'step-end', stepId, result }

      const outEdges = graph.edges.filter((e) => e.source === stepId)
      if (result.status === 'failed') {
        failed = true
        for (const e of outEdges) {
          edgeStates.set(edgeKey(e.source, e.target, e.sourceHandle), EDGE_STATE.SKIPPED)
        }
      } else if (result.status === 'paused') {
        // HITL/approval pause — graph suspends (PauseStatePersistenceLayer in C3 resumes).
        break
      } else {
        // Succeeded: activate the out-edges matching the returned handle; skip the rest.
        const handle = result.edgeSourceHandle ?? EDGE_HANDLE.SOURCE
        for (const e of outEdges) {
          const key = edgeKey(e.source, e.target, e.sourceHandle)
          edgeStates.set(key, e.sourceHandle === handle ? EDGE_STATE.TAKEN : EDGE_STATE.SKIPPED)
        }
      }
    }

    if (signal?.aborted) break
  }

  for (const layer of layers) layer.onGraphEnd?.(failed ? 'failed' : 'succeeded')
  yield { type: 'graph-end', status: failed ? 'failed' : 'succeeded' }
}

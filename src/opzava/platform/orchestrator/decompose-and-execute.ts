import type { GateDenial } from '@/opzava/core/orchestration-policy/contracts'
import { executeGraph } from '@/opzava/core/workflow-engine/engine'
import type { StepContract, WorkflowGraph } from '@/opzava/core/workflow-engine/contracts'
import type { ProviderPort, TaskExecutor } from '@/opzava/platform/execution/contracts'
import { DISPATCH_STEP_KIND, REVIEW_STEP_KIND, makeDispatchStep, makeReviewStep } from '@/opzava/platform/execution/steps'

import type { ProposeCard } from './propose-decomposition'
import { runDecomposition, type RunDecompositionDeps, type RunDecompositionInput } from './run-decomposition'

/**
 * decomposeAndExecute (ARD 0026) — the full fleet decompose-and-run flow: propose → gate → persist
 * (`runDecomposition`) → **hydrate** → **execute** (the workflow-engine over the persisted graph).
 *
 * `hydrateGraph` is the deterministic bridge (the seed of assign-to-worker, M3): the proposal emits
 * graph *structure* (steps/kinds/edges); hydration fills the executor-ready step `data` from the
 * card + the graph edges — dispatch steps get a `task` + `plan`, review steps get a `title` + the
 * upstream `sourceStep` (the source of their in-edge). No LLM in hydration — it is pure routing.
 */

export interface HydrateOptions {
  readonly card: ProposeCard
  readonly workerModel: string
}

export function hydrateGraph(graph: WorkflowGraph, opts: HydrateOptions): WorkflowGraph {
  // First in-edge source per step — the upstream output a review step evaluates.
  const sourceOf = new Map<string, string>()
  for (const e of graph.edges) {
    if (!sourceOf.has(e.target)) sourceOf.set(e.target, e.source)
  }

  const steps = graph.steps.map((s) => {
    if (s.kind === DISPATCH_STEP_KIND) {
      const intent = typeof s.data.intent === 'string' && s.data.intent ? s.data.intent : opts.card.title
      return {
        ...s,
        data: {
          ...s.data,
          task: { id: opts.card.id, title: intent, description: opts.card.description ?? null },
          plan: { model: opts.workerModel },
        },
      }
    }
    if (s.kind === REVIEW_STEP_KIND) {
      return {
        ...s,
        data: { ...s.data, title: opts.card.title, sourceStep: sourceOf.get(s.id) ?? '' },
      }
    }
    return s
  })

  return { steps, edges: graph.edges }
}

export interface DecomposeAndExecuteInput extends RunDecompositionInput {
  readonly workerModel: string
  readonly reviewModel: string
}

export interface DecomposeAndExecuteDeps extends RunDecompositionDeps {
  /** Worker executor for `dispatch` steps. */
  readonly workerExecutor: TaskExecutor
  /** Provider for `review` steps (the reviewer model call). */
  readonly reviewProvider: ProviderPort
}

export type DecomposeAndExecuteOutcome =
  | { readonly kind: 'executed'; readonly status: 'succeeded' | 'failed'; readonly graphId: number }
  | { readonly kind: 'proposal-rejected'; readonly reason: string; readonly detail: string }
  | { readonly kind: 'gate-rejected'; readonly denials: readonly GateDenial[] }

export async function decomposeAndExecute(
  input: DecomposeAndExecuteInput,
  deps: DecomposeAndExecuteDeps,
): Promise<DecomposeAndExecuteOutcome> {
  // 1–3. Propose → gate → persist.
  const run = await runDecomposition(input, deps)
  if (run.kind === 'proposal-rejected') return run
  if (run.kind === 'gate-rejected') return run

  // 4. Hydrate the persisted structure into an executable graph.
  const graph = deps.decomposition.getActiveGraph(input.card.id)
  if (!graph) return { kind: 'gate-rejected', denials: [] } // defensive: a persisted graph must exist
  const hydrated = hydrateGraph(graph, { card: input.card, workerModel: input.workerModel })

  // 5. Execute through the workflow-engine with the dispatch/review step adapters.
  const contracts = new Map<string, StepContract>([
    [DISPATCH_STEP_KIND, makeDispatchStep(deps.workerExecutor)],
    [REVIEW_STEP_KIND, makeReviewStep(deps.reviewProvider, input.reviewModel)],
  ])

  let status: 'succeeded' | 'failed' = 'failed'
  for await (const ev of executeGraph(hydrated, { contracts })) {
    if (ev.type === 'graph-end') status = ev.status ?? 'failed'
  }

  return { kind: 'executed', status, graphId: run.graphId }
}

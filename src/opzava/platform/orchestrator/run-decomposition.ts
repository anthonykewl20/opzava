import type { GateDenial, GatePolicy } from '@/opzava/core/orchestration-policy/contracts'
import type { ModelTierSeed } from '@/opzava/core/model-tier/contracts'
import type { ProviderPort } from '@/opzava/platform/execution/contracts'

import { executeDecompose, type DecomposeServiceDeps } from './decompose-service'
import { proposeDecomposition, type ProposeCard } from './propose-decomposition'

/**
 * runDecomposition (ARD 0026) — the orchestrator's full decompose flow, composing the two halves
 * built this session: a frontier model PROPOSES a graph (`proposeDecomposition`), then the control
 * plane GATES + PERSISTS it (`executeDecompose`). Two distinct rejection layers surface separately:
 * `proposal-rejected` (frontier-lock / malformed / schema) vs `gate-rejected` (shape/caps/cost).
 *
 * The orchestrator proposes; it never persists directly — every effect flows through the gate.
 */

export interface RunDecompositionInput {
  readonly workspaceId: number
  readonly card: ProposeCard
  readonly model: string
  readonly policy: GatePolicy & { readonly maxSteps: number }
}

export interface RunDecompositionDeps extends DecomposeServiceDeps {
  /** The orchestrator's frontier provider (the proposal model call). */
  readonly provider: ProviderPort
  readonly modelTierSeed?: ModelTierSeed
}

export type RunDecompositionOutcome =
  | { readonly kind: 'decomposed'; readonly graphId: number }
  | { readonly kind: 'already-decomposed'; readonly graphId: number }
  | { readonly kind: 'proposal-rejected'; readonly reason: string; readonly detail: string }
  | { readonly kind: 'gate-rejected'; readonly denials: readonly GateDenial[] }

export async function runDecomposition(
  input: RunDecompositionInput,
  deps: RunDecompositionDeps,
): Promise<RunDecompositionOutcome> {
  // 1. Propose — the frontier model emits a candidate graph (frontier-lock enforced inside).
  const proposed = await proposeDecomposition(
    { card: input.card, model: input.model, maxSteps: input.policy.maxSteps },
    { provider: deps.provider, modelTierSeed: deps.modelTierSeed },
  )
  if (proposed.kind === 'rejected') {
    return { kind: 'proposal-rejected', reason: proposed.reason, detail: proposed.detail }
  }

  // 2. Gate + persist — the control plane validates shape/caps/cost and persists (idempotent).
  const executed = executeDecompose(
    { workspaceId: input.workspaceId, cardId: input.card.id, graph: proposed.graph, policy: input.policy },
    deps,
  )
  if (executed.kind === 'rejected') {
    return { kind: 'gate-rejected', denials: executed.denials }
  }
  return executed // 'decomposed' | 'already-decomposed'
}

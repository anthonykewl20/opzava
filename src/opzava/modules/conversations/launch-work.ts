import type { CardCreationPort } from '@/opzava/platform/composition/task-write-seam'
import { enqueueDecomposeCard } from '@/opzava/platform/orchestrator/decompose-card-job'
import type { RunnerRepository } from '@/opzava/platform/runner/repository'

// launch_work (ARD 0028, capability B) — turn an Ask-Opzava intent into a correlated Card the fleet
// will decompose. Operator-intent-driven + a reversible flag (H3-safe): it creates a Card and
// enqueues a durable decompose-card job; the Lead still proposes the graph and the
// OrchestrationPolicyGate still confirms it downstream. runId is derived from the proposed action's
// id, so a chat double-send (same actionId) reuses the same Card + job (exactly-once).

export interface LaunchWorkInput {
  readonly workspaceId: number
  readonly conversationId: string
  /** The proposed action's server-minted id — the deterministic idempotency anchor. */
  readonly actionId: string
  readonly actor: string
  readonly projectId: number
  readonly title: string
  readonly description?: string | null
}

export interface LaunchWorkDeps {
  readonly cards: CardCreationPort
  readonly runnerRepo: RunnerRepository
  /** Runs card-create + job-enqueue atomically (better-sqlite3 nested tx = savepoint). */
  readonly transact: <T>(fn: () => T) => T
  readonly now: () => string
  readonly newId: () => string
}

export interface LaunchWorkResult {
  readonly cardId: number
  readonly runId: string
  readonly jobId: string
  /** true ⇒ the Card already existed (a replayed launch); no new work was created. */
  readonly idempotent: boolean
}

export function launchWork(input: LaunchWorkInput, deps: LaunchWorkDeps): LaunchWorkResult {
  const runId = `run_${input.actionId}`
  const clientRequestId = `launch:${input.conversationId}:${input.actionId}`

  return deps.transact(() => {
    const card = deps.cards.createCard({
      workspaceId: input.workspaceId,
      title: input.title,
      description: input.description ?? null,
      projectId: input.projectId,
      actor: input.actor,
      metadata: {
        opzava: {
          decompose: { needs: true, status: 'queued', conversationId: input.conversationId, runId },
        },
      },
      clientRequestId,
    })
    const enq = enqueueDecomposeCard(
      deps.runnerRepo,
      { cardId: card.cardId, workspaceId: input.workspaceId, conversationId: input.conversationId, runId },
      { newId: deps.newId, now: deps.now },
    )
    return { cardId: card.cardId, runId, jobId: enq.jobId, idempotent: !card.created }
  })
}

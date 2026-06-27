import type { ProviderPort } from '@/opzava/platform/execution/contracts'
import type { NeedsYouRollupReader } from '@/opzava/platform/project-health/needs-you-rollup'

import type { ConversationRepository } from '../conversation-repository'
import type { ConversationTurn } from '../contracts'
import type { OrchestratorActionRegistry } from './action-registry'

// askOrchestrator (doc 95 §D1.1) — one conversational turn with the Ask-Opzava Concierge.
// Self-contained: the human prompt and the AI narration are TURNS (never inherited `messages`).
// The model NARRATES ONLY over server-injected facts (the NeedsYouRollup) — it never computes the
// numbers (D5). Proposed actions are validated against the registry allow-list and persisted as
// `pending` action-block turns (the one source of truth). Model-2: the Concierge holds no
// credentials; nothing here executes a side effect — confirmation happens later (S2/S3).

export interface ProposedAction {
  readonly actionId: string
  readonly actionType: string
  readonly kind: 'internal-reversible' | 'external-guarded'
  readonly args: Record<string, unknown>
}

export interface AskOrchestratorDeps {
  readonly provider: ProviderPort
  readonly model: string
  readonly readNeedsYouRollup: NeedsYouRollupReader
  readonly actionRegistry: OrchestratorActionRegistry
  readonly conversationRepo: ConversationRepository
  readonly now: () => string
  readonly newId: () => string
}

export interface AskOrchestratorCtx {
  readonly workspaceId: number
  readonly conversationId: string
  readonly actor: string
  readonly prompt: string
}

export interface AskOrchestratorResult {
  readonly humanTurn: ConversationTurn
  readonly narrationTurn: ConversationTurn
  readonly proposedActions: readonly ProposedAction[]
}

interface ParsedConcierge {
  readonly narration: string
  readonly actions: ReadonlyArray<{ actionType: string; args: Record<string, unknown> }>
}

function buildConciergePrompt(rollup: unknown, allowedActions: readonly string[], prompt: string): string {
  return [
    'You are Opzava, the lead orchestrator. Narrate ONLY over the FACTS provided below; never invent numbers or statuses.',
    `FACTS (cross-project status): ${JSON.stringify(rollup)}`,
    `ALLOWED ACTIONS: ${allowedActions.length ? allowedActions.join(', ') : '(none)'}`,
    'Reply with strict JSON: {"narration": string, "actions": [{"actionType": string, "args": object}]}. Propose only allowed actions; omit actions if none apply.',
    `USER: ${prompt}`,
  ].join('\n')
}

function parseConciergeOutput(text: string): ParsedConcierge {
  try {
    const obj = JSON.parse(text) as unknown
    if (obj && typeof obj === 'object' && typeof (obj as { narration?: unknown }).narration === 'string') {
      const rawActions = (obj as { actions?: unknown }).actions
      const actions = Array.isArray(rawActions)
        ? rawActions
            .filter(
              (a): a is { actionType: string; args?: unknown } =>
                !!a && typeof a === 'object' && typeof (a as { actionType?: unknown }).actionType === 'string',
            )
            .map((a) => ({
              actionType: a.actionType,
              args: a.args && typeof a.args === 'object' ? (a.args as Record<string, unknown>) : {},
            }))
        : []
      return { narration: (obj as { narration: string }).narration, actions }
    }
  } catch {
    // Malformed output degrades gracefully: the whole text is the narration, no actions.
  }
  return { narration: text, actions: [] }
}

export async function askOrchestrator(
  deps: AskOrchestratorDeps,
  ctx: AskOrchestratorCtx,
): Promise<AskOrchestratorResult> {
  const turn = (
    role: ConversationTurn['role'],
    author: string,
    body: string,
    extra: Partial<ConversationTurn> = {},
  ): ConversationTurn => ({
    turnId: deps.newId(),
    conversationId: ctx.conversationId,
    parentTurnId: null,
    author,
    role,
    body,
    refType: null,
    refId: null,
    messageAnchor: null,
    status: null,
    record: {},
    createdAt: deps.now(),
    ...extra,
  })

  // 1. Persist the human prompt as a turn (self-contained — never an inherited messages row).
  const humanTurn = turn('human', ctx.actor, ctx.prompt)
  deps.conversationRepo.appendTurn(humanTurn)

  // 2. Inject deterministic facts; the model narrates only.
  const rollup = deps.readNeedsYouRollup.read(ctx.workspaceId)
  const allowed = deps.actionRegistry.all().map((a) => a.actionType)
  const { text } = await deps.provider.invoke({
    prompt: buildConciergePrompt(rollup, allowed, ctx.prompt),
    model: deps.model,
  })
  const parsed = parseConciergeOutput(text)

  // 3. Narration turn.
  const narrationTurn = turn('ai', 'Opzava', parsed.narration)
  deps.conversationRepo.appendTurn(narrationTurn)

  // 4. Validate proposed actions against the registry allow-list; persist each as a pending block.
  const proposedActions: ProposedAction[] = []
  for (const a of parsed.actions) {
    const registered = deps.actionRegistry.get(a.actionType)
    if (!registered) continue // unknown actionType is dropped (allow-list, never invented)
    const action: ProposedAction = {
      actionId: deps.newId(),
      actionType: registered.actionType,
      kind: registered.kind,
      args: a.args,
    }
    proposedActions.push(action)
    deps.conversationRepo.appendTurn(
      turn('ai', 'Opzava', '', {
        turnId: action.actionId,
        status: 'pending',
        refType: registered.kind === 'external-guarded' ? 'approval' : null,
        record: { action },
      }),
    )
  }

  deps.conversationRepo.touchLastMessageAt(ctx.conversationId, deps.now())

  return { humanTurn, narrationTurn, proposedActions }
}

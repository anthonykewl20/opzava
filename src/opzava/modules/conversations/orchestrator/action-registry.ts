// OrchestratorActionRegistry (doc 95 §D1.1) — the deep seam mapping a chat action to its executor.
// A discriminated union over the tier: an action declares `internal-reversible` (auto-executes →
// result turn) vs `external-guarded` (mints an Approval → guarded provider) AT REGISTRATION, so an
// internal executor structurally CANNOT mint an approval (ARD 0028). Extensibility = a new audited
// TS case. v1 set: notify_owner, create_followup_task (internal). approve_and_send (external, S2)
// and launch_work (internal, S3) register later. Model-2: actions run as the operator principal.

/** Per-call context for an action's executor. `args` is the (already schema-validated) action block. */
export interface ActionExecCtx {
  readonly conversationId: string
  readonly workspaceId: number
  readonly actor: string
  readonly args: Record<string, unknown>
  readonly now: () => string
  readonly newId: () => string
}

export interface ActionResultTurn {
  readonly body: string
  readonly record?: Record<string, unknown>
}

export interface ActionResult {
  readonly resultTurn: ActionResultTurn
}

export interface ApprovalRef {
  readonly approvalId: string
}

export type OrchestratorAction =
  | {
      readonly kind: 'internal-reversible'
      readonly actionType: string
      readonly execute: (ctx: ActionExecCtx) => Promise<ActionResult>
    }
  | {
      readonly kind: 'external-guarded'
      readonly actionType: string
      readonly mintApproval: (ctx: ActionExecCtx) => Promise<ApprovalRef>
    }

export interface OrchestratorActionRegistry {
  get(actionType: string): OrchestratorAction | undefined
  all(): readonly OrchestratorAction[]
}

export function createOrchestratorActionRegistry(
  actions: readonly OrchestratorAction[],
): OrchestratorActionRegistry {
  const byType = new Map<string, OrchestratorAction>()
  for (const action of actions) {
    if (byType.has(action.actionType)) {
      throw new Error(`duplicate orchestrator actionType: ${action.actionType}`)
    }
    byType.set(action.actionType, action)
  }
  const all = Object.freeze([...actions])
  return Object.freeze({
    get: (actionType: string) => byType.get(actionType),
    all: () => all,
  })
}

// ── v1 internal-reversible actions (port-injected; composed at the route root) ──

export interface CreateFollowupTaskPort {
  createFollowupTask(input: {
    title: string
    projectId?: number
    actor: string
    workspaceId: number
  }): { cardId: number }
}

export function makeCreateFollowupTaskAction(deps: CreateFollowupTaskPort): OrchestratorAction {
  return {
    kind: 'internal-reversible',
    actionType: 'create_followup_task',
    async execute(ctx) {
      const { cardId } = deps.createFollowupTask({
        title: String(ctx.args.title ?? ''),
        projectId: typeof ctx.args.projectId === 'number' ? ctx.args.projectId : undefined,
        actor: ctx.actor,
        workspaceId: ctx.workspaceId,
      })
      return { resultTurn: { body: `Created follow-up card #${cardId}.`, record: { cardId } } }
    },
  }
}

export interface NotifyOwnerPort {
  notifyOwner(input: {
    projectId?: number
    message: string
    actor: string
    workspaceId: number
  }): void
}

export function makeNotifyOwnerAction(deps: NotifyOwnerPort): OrchestratorAction {
  return {
    kind: 'internal-reversible',
    actionType: 'notify_owner',
    async execute(ctx) {
      const message = String(ctx.args.message ?? '')
      deps.notifyOwner({
        projectId: typeof ctx.args.projectId === 'number' ? ctx.args.projectId : undefined,
        message,
        actor: ctx.actor,
        workspaceId: ctx.workspaceId,
      })
      return { resultTurn: { body: 'Notified the owner.' } }
    },
  }
}

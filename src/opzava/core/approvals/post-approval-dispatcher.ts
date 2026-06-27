import { isApprovalGranted, type Approval, type ApprovalCorrelation } from './contracts'

// PostApprovalDispatcher (ARD 0029) — the pure router that, on an approved Approval, runs the
// registered side-effect handler and posts a correlated outcome turn. Lives in core/approvals (zero
// platform imports): it knows no feature module concretely — handlers are injected via a registry
// assembled at the composition root (so platform↛modules / core↛platform hold). Exactly-once is
// delegated DOWN to each handler (the existing reserveExternalCall) and to the turn sink (a
// deterministic turnId). A handler declares its tier elsewhere; here every registered handler is an
// external-guarded side effect routed through the existing guarded executor.

export type ApprovedActionOutcome =
  | { readonly kind: 'triggered'; readonly summary: string; readonly ref?: { type: 'run' | 'artifact'; id: string } }
  | { readonly kind: 'already-done'; readonly summary: string; readonly ref?: { type: 'run' | 'artifact'; id: string } }
  | { readonly kind: 'failed'; readonly summary: string; readonly errorKind: string }

export interface ApprovedActionContext {
  readonly approval: Approval
  readonly signal?: AbortSignal
}

export interface ApprovedActionHandler {
  /** Registry key, e.g. 'campaign.send'. MUST be idempotent (re-run after a completed effect → already-done). */
  readonly requestedAction: string
  readonly trigger: (ctx: ApprovedActionContext) => Promise<ApprovedActionOutcome>
}

export interface ApprovedActionRegistry {
  get(requestedAction: string): ApprovedActionHandler | undefined
  all(): readonly ApprovedActionHandler[]
}

export function createApprovedActionRegistry(
  handlers: readonly ApprovedActionHandler[],
): ApprovedActionRegistry {
  const byAction = new Map<string, ApprovedActionHandler>()
  for (const handler of handlers) {
    if (byAction.has(handler.requestedAction)) {
      throw new Error(`duplicate approved-action handler: ${handler.requestedAction}`)
    }
    byAction.set(handler.requestedAction, handler)
  }
  const all = Object.freeze([...handlers])
  return Object.freeze({
    get: (requestedAction: string) => byAction.get(requestedAction),
    all: () => all,
  })
}

/** Posts the outcome turn into the launching thread. MUST be idempotent on approvalId. */
export interface ApprovedActionTurnSink {
  postOutcomeTurn(input: {
    readonly correlation: ApprovalCorrelation
    readonly approvalId: string
    readonly outcome: ApprovedActionOutcome
  }): void | Promise<void>
}

export type DispatchResult =
  | {
      readonly status: 'dispatched'
      readonly requestedAction: string
      readonly outcome: ApprovedActionOutcome
      readonly turnPosted: boolean
    }
  | { readonly status: 'no-op'; readonly reason: 'not-approved' | 'unknown-action' }

export interface PostApprovalDispatcherDeps {
  readonly registry: ApprovedActionRegistry
  readonly turnSink: ApprovedActionTurnSink
  readonly signal?: AbortSignal
  readonly onUnknownAction?: (approval: Approval) => void
  readonly onError?: (where: 'trigger' | 'turn', approval: Approval, err: unknown) => void
}

export interface PostApprovalDispatcher {
  dispatch(approval: Approval): Promise<DispatchResult>
}

export function createPostApprovalDispatcher(deps: PostApprovalDispatcherDeps): PostApprovalDispatcher {
  return {
    async dispatch(approval) {
      // Only ever act on a granted approval (defense in depth; the handler re-checks too).
      if (!isApprovalGranted(approval)) return { status: 'no-op', reason: 'not-approved' }

      const handler = deps.registry.get(approval.requestedAction)
      if (!handler) {
        // Unknown requestedAction (a new string, an artifact milestone with no effect, a partial
        // deploy) is a deliberate no-op — it must never break the decide route.
        deps.onUnknownAction?.(approval)
        return { status: 'no-op', reason: 'unknown-action' }
      }

      // Trigger the side effect. A handler should return a 'failed' outcome rather than throw; if it
      // throws anyway, the approval has already succeeded, so we surface an honest turn and never
      // rethrow (the decide route must not 5xx or roll back a committed approval).
      let outcome: ApprovedActionOutcome
      try {
        outcome = await handler.trigger({ approval, signal: deps.signal })
      } catch (err) {
        deps.onError?.('trigger', approval, err)
        outcome = { kind: 'failed', summary: 'The action could not be completed.', errorKind: 'handler-threw' }
      }

      // Correlated → one outcome turn in the launching thread; un-correlated → the Digest surfaces it.
      let turnPosted = false
      if (approval.correlation) {
        try {
          await deps.turnSink.postOutcomeTurn({ correlation: approval.correlation, approvalId: approval.approvalId, outcome })
          turnPosted = true
        } catch (err) {
          deps.onError?.('turn', approval, err)
        }
      }

      return { status: 'dispatched', requestedAction: approval.requestedAction, outcome, turnPosted }
    },
  }
}

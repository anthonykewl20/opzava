/**
 * Execution contracts (ARD 0025 1b/1c). The `TaskExecutor` is the deep module that hides the
 * provider fan-out + prompt building + usage capture behind one method; the `ProviderPort` is the
 * seam its production adapters (gateway / direct-anthropic / openai-compatible / claude-cli) and
 * its in-memory test double satisfy. Platform (Engine B); self-contained.
 *
 * Invariant: the executor NEVER touches the `tasks` row — it returns a `TaskOutcome`; the spine
 * (`platform/task-state`) transitions. `plan` is supplied by the caller (routing authority), never
 * resolved here.
 */

/** The minimal slice of an ExecutionPlan the executor needs (structurally compatible). */
export interface ExecutorPlan {
  readonly model: string
  readonly accountProfile?: string
}

export interface ExecutorTask {
  readonly id: number
  readonly title: string
  readonly description?: string | null
  readonly priority?: string
  /** Aegis feedback from a prior rejection, folded into the re-dispatch prompt. */
  readonly rejectionFeedback?: string | null
}

export interface TokenUsage {
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
}

export interface ProviderInvokeInput {
  /** The fully-built prompt. Callers (TaskExecutor / review step) own prompt construction. */
  readonly prompt: string
  readonly model: string
  readonly signal?: AbortSignal
}

export interface ProviderResult {
  readonly text: string
  readonly sessionId?: string
  /** Set with `deferred` when the provider hands back an async run to reconcile later. */
  readonly runId?: string
  readonly deferred?: boolean
  readonly usage?: TokenUsage
}

/** The provider seam. Two+ real adapters (the 4 providers + in-memory) make it a real seam. */
export interface ProviderPort {
  invoke(input: ProviderInvokeInput): Promise<ProviderResult>
  isAvailable(): boolean
}

/** Cross-cutting usage capture (replaces the inline `recordUsage`); the spine-less side effect. */
export interface UsageSink {
  record(task: ExecutorTask, usage: TokenUsage): void
}

/** The executor's verdict — pure data; the spine maps it to a status transition. */
export type TaskOutcome =
  | { readonly kind: 'completed'; readonly resultText: string; readonly sessionId?: string; readonly usage?: TokenUsage }
  | { readonly kind: 'deferred'; readonly runId: string; readonly sessionId?: string }
  | { readonly kind: 'failed'; readonly errorClass: string; readonly errorMessage: string }

export interface ExecutorDeps {
  readonly provider: ProviderPort
  readonly usageSink: UsageSink
}

export interface TaskExecutor {
  execute(input: { task: ExecutorTask; plan: ExecutorPlan }, signal?: AbortSignal): Promise<TaskOutcome>
}

# platform/execution — TaskExecutor + ProviderPort

**Purpose.** The deep execution module (ARD 0025 1b/1c): after the spine *claims* a task, `TaskExecutor.execute` runs it — plan → prompt → invoke provider → capture usage → `TaskOutcome`. One method hides the provider fan-out, prompt building, and usage capture. The `ProviderPort` is the seam its production adapters and in-memory test double satisfy.

**Public surface:**
- `makeTaskExecutor(deps) → { execute({task, plan}, signal?) → TaskOutcome }` — `TaskOutcome = completed{resultText,usage} | deferred{runId} | failed{errorClass,errorMessage}`.
- `buildTaskPrompt(task)` — the dispatch prompt (Engine-B-owned; faithful to the inherited one).
- `ProviderPort` (`invoke`/`isAvailable`) + `makeInMemoryProvider(respond)` (test double / first adapter).
- `UsageSink` — cross-cutting usage capture (replaces the inline `recordUsage`).

**Invariants (do not regress):**
1. **The executor NEVER touches the `tasks` row.** It returns a `TaskOutcome`; the spine (`platform/task-state`) maps it to a status transition. Pure of storage.
2. **`plan` is supplied by the caller** (the routing authority) — never resolved here.
3. **No silent success on a malformed deferral** — `deferred` without a `runId` is a `failed` outcome, not a lost task.
4. A provider throw maps to `failed` (never crashes the caller).

**Editor guardrails:** the `ProviderPort` seam is justified by ≥2 real adapters (the 4 providers + in-memory) — keep adapters behind it; the executor stays provider-agnostic. Test through `execute` with `makeInMemoryProvider` — no real network.

**Status:** executor + port + in-memory adapter built + tested (`executor.test.ts`, 6 behaviors). **Follow-on:** the 4 production adapters (gateway / direct-anthropic / openai-compatible / claude-cli) and the dispatch-loop rewire (`claim → plan → execute → transition`) that makes it live — the deferred Slice-3 hot-path work.

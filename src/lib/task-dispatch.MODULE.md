<!-- agent-context: read this before editing the module -->

# lib/task-dispatch

## Purpose
The Engine-A task lifecycle engine: routes inbox tasks to the best agent, dispatches assigned tasks to a gateway or a direct provider (Anthropic / OpenAI / OpenAI-compatible local), reconciles deferred async runs, requeues stale in-progress tasks, and runs the Aegis quality-review gate. Every orchestrator is a pure function of an injected `TaskDispatchDeps` literal — no module-global reads inside the orchestration body.

## Public surface
Exported from `src/lib/task-dispatch.ts` (no barrel; `src/lib` is flat). Anything not listed here is internal.

Dependency-injection seam:
- `TaskDispatchDeps` (`task-dispatch.ts:38`) — the contract the five orchestrators depend on: `db`, `broadcast`, `logActivity`, `clock`, `gateway`, `isGatewayAvailable`, `isDirectDispatchAvailable`, `dispatchDirect`, `recoverCompletionText`.
- `makeDefaultDeps()` (`task-dispatch.ts:51`) — the **production adapter** that wires the real module globals into the seam. Used by the scheduler (`lib/scheduler.ts`) and the task API routes. Tests pass a deps-literal instead.

Orchestrators (each `(deps, options?) => Promise<{ok, message}>`, or with extra counts):
- `autoRouteInboxTasks(deps)` (`task-dispatch.ts:1636`) — inbox → assigned, role-keyword scoring + capacity cap (3 in-progress per agent).
- `dispatchAssignedTasks(deps)` (`task-dispatch.ts:1230`) — assigned → in_progress, claims via atomic `UPDATE … WHERE status='assigned'`, dispatches (gateway / targeted session / direct provider), defers async runs with a `runId`.
- `reconcileDeferredTaskCompletions(deps, options?)` (`task-dispatch.ts:377`) — in_progress (async pending) → review; waits on `agent.wait`, falls back to transcript recovery.
- `requeueStaleTasks(deps)` (`task-dispatch.ts:1144`) — in_progress beyond the stale threshold whose agent is offline → assigned (retry) or failed (after 5 attempts).
- `runAegisReviews(deps)` (`task-dispatch.ts:968`) — review → quality_review → done | assigned | failed; verdict parsed from the agent response.

Pure helpers (exported, reused by tests + routes):
- `resolveTaskDispatchModelOverride(task)` (`task-dispatch.ts:112`) — reads `agent.config.dispatchModel`.
- `extractDeferredCompletionText(waitPayload)` (`task-dispatch.ts:211`) — pulls completion text from a gateway wait payload.
- `recoverDeferredCompletionTextFromTranscript(task, metadata)` (`task-dispatch.ts:323`) — scans gateway session JSONL transcripts for the assistant reply after the task prompt.
- `DeferredCompletionTask` (type, `task-dispatch.ts:169`).

## Dependencies
- **Outbound** (what this imports): inherited `src/lib` only — `db` (`getDatabase`, `db_helpers`), `config`, `logger`, `event-bus`, `openclaw-gateway` (`callOpenClawGateway`), `sessions` (`getAllGatewaySessions`), `transcript-parser`, `github-sync-engine` (`syncTaskOutbound`), `model-config` (`DISPATCH_MODEL_*`). This is an **inherited-engine** module — it does not cross into `src/opzava` (ARD 0007 / `test/engine-boundary.test.mjs`).
- **Inbound** (who imports this — do not silently break):
  - `lib/scheduler.ts` — registers `task_dispatch`, `aegis_review`, `stale_task_requeue` via the `SCHEDULED_TASKS` registry and calls `makeDefaultDeps()` + the orchestrators.
  - The task API routes (`src/app/api/tasks/...`) — call the orchestrators directly with `makeDefaultDeps()`.

## Invariants
1. **The seam is the only side-effect surface.** Orchestrators take `deps` and never read `getDatabase`/`eventBus`/`Date.now`/`callOpenClawGateway`/`recoverDeferredCompletionTextFromTranscript` inline (`task-dispatch.ts:24-36` documents the migration). To test an orchestrator you build a deps-literal; do NOT re-introduce inline global reads.
2. **Dispatch claim is atomic and race-safe** (`task-dispatch.ts:1266-1274`): the `assigned → in_progress` flip is a single `UPDATE tasks SET status='in_progress' … WHERE id=? AND status='assigned'`; `claim.changes === 0` means another dispatcher won the race — skip silently (prevents double-dispatch, issue/PR #698).
3. **Deferred runs carry an `async_state`** (`task-dispatch.ts:1414`, `1344`): `'pending'` only when a `runId` was returned; `'accepted_without_run_id'` when not. Reconciliation can only safely `agent.wait` on a run with a `runId` — an accepted-without-run-id task is flagged `async_reconciliation: 'manual_required'` and must NOT be polled forever.
4. **Direct-API mode bypasses the stale-offline check** (`task-dispatch.ts:1174`): when `!isGatewayAvailable() && isDirectDispatchAvailable()`, agents have no heartbeat by design and `requeueStaleTasks` skips entirely. Do not "fix" this by re-enabling the offline check in direct mode — it would fail every task before any direct dispatch can run.
5. **Model override is opt-in and never injected by default** (`task-dispatch.ts:106-111`, `1393-1394`): `resolveTaskDispatchModelOverride` returns `null` unless the agent config sets `dispatchModel`; `null` means "agent uses its own configured default." Do not force a model into the gateway invoke params.
6. **Token usage is recorded through one helper** (`task-dispatch.ts:602` `recordUsage`): the three direct providers (Anthropic API, Claude CLI, OpenAI-compatible) all funnel through it; `cost` is deliberately left `0` (calculated downstream). Do not re-duplicate the INSERT.
7. **Aegis retry caps** (`task-dispatch.ts:1063`): max 3 Aegis rejections before `failed`; dispatch retries cap at 5 (`task-dispatch.ts:1148`, `:1523`).

## Harmony rules
- **Engine:** inherited `src/lib` (Engine-A live surface). It coexists with the opzava `platform/runner` durable queue — the two are **not merged** (ARD 0007). Task dispatch is the gateway/direct-provider path; campaign sends are the runner path. Do not route task dispatch through `platform/runner`.
- **Dead-surface / dead-wired:** none here. All five orchestrators are live and scheduled.

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md` (task-dispatch entries):

> ## ✅ RESOLVED — 9 `vi.mock` brittleness removed via the `TaskDispatchDeps` seam
>
> The five orchestrators previously reached for module globals (`getDatabase`,
> `eventBus.broadcast`, `db_helpers.logActivity`, `callOpenClawGateway`,
> `Date.now`, `recoverDeferredCompletionTextFromTranscript`) inline, which forced
> tests to `vi.mock` half the codebase. **Resolved.** A `TaskDispatchDeps` seam
> (`task-dispatch.ts:38`) carries only the members an orchestrator uses;
> `makeDefaultDeps()` (`task-dispatch.ts:51`) is the production adapter and tests
> pass a deps-literal.
>
> **Guardrail (task-dispatch MODULE.md):** do NOT re-introduce inline module-global
> reads inside an orchestrator, and do NOT `vi.mock` task-dispatch internals to
> test them — build a deps-literal. The seam is grown per orchestrator (no
> speculative surface).

> ## ✅ RESOLVED — duplicated task-dispatch `.then()` chain unified
>
> The `route → reconcile → dispatch` chain was duplicated verbatim in the scheduler
> tick and the manual `triggerTask` path. **Resolved** by the `SCHEDULED_TASKS`
> registry: both paths call the same handler (`runTaskDispatchChain`,
> `scheduler.ts:57`).
>
> **Guardrail (task-dispatch + scheduler MODULE.md):** the dispatch ordering
> (reconcile, route, dispatch message parts, filter rules) is defined in exactly
> one place. Do not re-fork it per call site.

> ## ✅ RESOLVED — 3× `token_usage` INSERT collapse
>
> The Anthropic-API, Claude-CLI, and OpenAI-compatible dispatch paths each carried
> a near-duplicate `INSERT INTO token_usage` block. **Resolved** by the
> `recordUsage` helper (`task-dispatch.ts:602`).
>
> **Guardrail (task-dispatch MODULE.md):** all direct-provider token accounting
> goes through `recordUsage`; `cost` is intentionally `0`. Do not re-duplicate the
> INSERT or compute cost here.

> ## ✅ RESOLVED — 3 previously-uncovered orchestrators now testable
>
> `reconcileDeferredTaskCompletions`, `runAegisReviews`, and `requeueStaleTasks`
> had no interface tests (only integration via the scheduler). **Resolved** — the
> seam admits a deps-literal in `src/lib/__tests__/task-dispatch-seam.test.ts`.
>
> **Guardrail (task-dispatch MODULE.md):** keep the seam honest — any new
> orchestrator must accept `(deps, options?)` and read only from `deps`.

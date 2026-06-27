<!-- agent-context: read this before editing the module -->

# task-dispatch

## Purpose

The Engine-A task-orchestration core. On each scheduler tick it runs the pipeline
`autoRouteInboxTasks → dispatchAssignedTasks → reconcileDeferredTaskCompletions → runAegisReviews →
requeueStaleTasks` over the inherited `tasks`/`agents` tables, driving each task through
`inbox → assigned → in_progress → review → quality_review → done | failed`. Dispatch reaches an agent
either through the OpenClaw gateway or — when no gateway is available — directly via the Anthropic
API, the host-mounted Claude Code CLI, OpenAI, or an OpenAI-compatible local endpoint. This is the
surface the **Variant A refactor** targets; read the invariants before changing it.

## Public surface

Exported from `src/lib/task-dispatch.ts`:

- **Dependency-injection seam**
  - `interface TaskDispatchDeps` — the collaborator bag every orchestrator takes (`db`, `broadcast`,
    `logActivity`, `clock`, `gateway`, `isGatewayAvailable`, `isDirectDispatchAvailable`,
    `dispatchDirect`, `recoverCompletionText`).
  - `function makeDefaultDeps(): TaskDispatchDeps` — production adapter wiring the real module globals.
- **Orchestrators** (each `(deps) => Promise<{ ok, message }>`, driven by the scheduler tick)
  - `autoRouteInboxTasks(deps)` — inbox → assigned by role-affinity scoring.
  - `dispatchAssignedTasks(deps)` — assigned → in_progress → review (or deferred/failed).
  - `reconcileDeferredTaskCompletions(deps, options?)` — polls `agent.wait` to promote deferred runs.
  - `runAegisReviews(deps)` — review → quality_review → done | assigned | failed.
  - `requeueStaleTasks(deps)` — in_progress stuck + offline agent → assigned | failed.
- **Model + provider routing**
  - `resolveTaskDispatchModelOverride(task)` — returns an explicit gateway model override from
    `agent_config.dispatchModel`, else `null` (agent uses its own default).
  - `extractDeferredCompletionText(waitPayload)` — pulls completion text from a gateway wait payload.
  - `recoverDeferredCompletionTextFromTranscript(task, metadata)` — last-resort transcript recovery.
- **Types** — `TaskDispatchDeps`, `DeferredCompletionTask`.

Everything else (`classifyDirectModel`, `callDirectly`, `callClaudeViaCli`, `callOpenAICompatible`,
`recordUsage`, `syncAndEscalateIfFailed`, `buildTaskPrompt`, `parseReviewVerdict`, `scoreAgentForTask`,
`ROLE_AFFINITY`, `pickProvider`) is **module-private**. Adding a dispatch path means extending the
orchestrators + the `TaskDispatchDeps` seam, not calling the privates from outside.

## Dependencies

**Outbound** (what this imports — all Engine-A `@/lib` siblings, **no `@/opzava` imports**):
- `db` (`getDatabase`, `db_helpers`), `event-bus` (`eventBus`), `openclaw-gateway`
  (`callOpenClawGateway`), `sessions` (`getAllGatewaySessions`), `transcript-parser`,
  `github-sync-engine` (`syncTaskOutbound`), `model-config` (`DISPATCH_MODEL_*`), `logger`, `config`.
- Node built-ins: `node:fs` (`existsSync`), `node:child_process` (`spawn`).

**Inbound** (callers an editor must not silently break):
- `src/lib/scheduler*` — invokes the five orchestrators on its tick (see `scheduler.module.md`).
- `src/app/api/tasks/*` routes — invoke dispatch/reconcile on task mutations.
- `src/lib/__tests__/task-dispatch-seam.test.ts` — locks the DI seam (orchestrators callable with a
  deps-literal, no module globals inlined).

## Invariants

1. **The DI seam is load-bearing (DEEPENING.md).** Every orchestrator takes `TaskDispatchDeps`;
   `makeDefaultDeps()` (`:51-67`) wires the production globals; tests pass a deps-literal. The seam
   carries only the members an orchestrator uses — grow it per orchestrator, no speculative surface.
   **Variant A must not revert orchestrators to reaching for module globals inline** (`getDatabase`,
   `eventBus.broadcast`, `Date.now`, …) — that is the untestable state the seam removed.
2. **Task claiming is atomic and race-safe.** `dispatchAssignedTasks` claims with
   `UPDATE tasks SET status='in_progress' WHERE id=? AND status='assigned'` and skips on
   `changes === 0` (`:1266-1274`). Exactly one of two racing dispatchers wins; the loser skips silently.
   This prevents double-dispatch (PR #698) — do not replace it with a SELECT-then-blind-UPDATE.
3. **Direct-API mode skips the offline-stale check.** `requeueStaleTasks` computes
   `directApiSkipsStaleCheck = !isGatewayAvailable() && isDirectDispatchAvailable()` (`:1174`) and
   `continue`s every stale row when true (`:1176-1177`). In direct mode agents have no heartbeat by
   design; without this guard every task is failed before its HTTP dispatch runs.
4. **Gateway availability requires physical evidence.** `isGatewayAvailable()` (`:511-535`) returns true
   only if `openclaw.json` exists on disk **or** a gateway row has `status IN ('online','healthy','ready')`.
   It deliberately rejects the onboarding-seeded `primary`/`unknown` row — otherwise every dispatch
   routes through a gateway path before the Docker sidecar has actually been proven reachable.
5. **Async dispatch has two reconciliation states.** A dispatched task's `metadata.async_state` is
   `'pending'` (a `runId` exists → `reconcileDeferredTaskCompletions` polls `agent.wait`) or
   `'accepted_without_run_id'` (no `runId` → `async_reconciliation: 'manual_required'`, never
   auto-reconciled). Do not collapse these — auto-waiting on a run without a `runId` looks pending forever.
6. **Retry ceilings are fixed.** Aegis rejects cap at `maxAegisRetries = 3` (`:1063`); dispatch/stale
   retries cap at `maxDispatchRetries = 5` (`:1148`, `:1523`); the stale window is `now - 10*60` (`:1147`).
   Hitting a ceiling moves the task to `failed` and broadcasts `task.escalated` with a reason
   (`max_aegis_rejections` | `stale_task_max_retries` | `max_dispatch_retries`) via `syncAndEscalateIfFailed`.
7. **Model routing is heuristic + overridable, gateway-override-defaults-off.** `classifyDirectModel`
   (`:537-581`) picks complex→Opus / routine→Haiku / default→Sonnet from priority + signals + size;
   `agent_config.dispatchModel` overrides it; `pickProvider` (`:723-728`) routes by prefix
   (anthropic/openai/local). `resolveTaskDispatchModelOverride` returns `null` by default — the gateway
   agent uses its own configured model unless a Opzava agent explicitly opts in.
8. **`token_usage` is recorded from one place.** `recordUsage` (`:602-626`) is the single INSERT shared
   by all three direct providers (Anthropic API, Claude CLI, OpenAI-compatible); `cost` is left `0` and
   computed downstream. This is the *resolved* form of the 3×-token-usage trap — do not re-duplicate the
   INSERT per provider.

## Harmony rules

- **Engine:** This is **Engine A** (inherited `src/lib`). Task orchestration is an inherited operational
  surface. Hardening, dedup, race-safety, and the DI seam belong here.
- **Boundary gate to Engine B (`src/opzava`):** the `agents` table (ARD 0007, enforced by
  `test/engine-boundary.test.mjs`). This module has **zero `@/opzava` imports** — it is pure Engine A.
  New product workflows (durable jobs, content pipeline, approvals) live in `src/opzava/platform/runner`
  and `src/opzava/modules/*`; do not pull them into this inherited dispatcher.
- **Two agent models.** `autoRouteInboxTasks`/`dispatchAssignedTasks` read and write the **inherited**
  `agents` table, not opzava `opzava_agent_roles`. Do not assume the two share an id or lifecycle.
- **Dead-surface / dead-wired:** none. All five orchestrators are wired to the scheduler tick and the
  task API routes.

## Editor guardrails

Copied/derived from `docs/architecture/system-map/92-stale-findings.md`:

- **✅ CONFIRMED — two unreconciled agent models** — **applies here.** This module's `agents` reads/writes
  (role-affinity scoring, capacity check `in_progress >= 3`, stale requeue `agent_status`/`last_seen`,
  `getAgentSoulContent`) target the **inherited** `agents` table, separate from opzava
  `opzava_agent_roles`. Do not assume an id/lifecycle bridge. See ARD 0007 + `test/engine-boundary.test.mjs`.

The `realtime-chat-production-review.md` traps **do not transfer** to this surface (no chat write path,
no SSE delivery, no outbox, no `client_message_id`, no `body.from` override). The one positive transfer
is the **3×-`token_usage` trap, already resolved here** via the single `recordUsage` INSERT (Invariant 8).

**Refactor-specific guardrail (Variant A):** the DI seam (Invariant 1), the atomic claim (Invariant 2),
and the direct-API stale-skip (Invariant 3) are the load-bearing hardening. The refactor must keep them
— if it needs to change them, it is changing safety properties, not structure, and must update
`task-dispatch-seam.test.ts` and this doc in the same change.

# 50 — Inherited Engine A: Agent / Task / Memory / Cron / Tokens (deep)

> Zone: `src/lib/` — the upstream "Mission Control / OpenClaw" multi-agent task board that Opzava
> preserves. Mental model: **agents are operators**, **tasks flow through a Kanban board**, a 60s
> scheduler tick drives auto-routing → dispatch → review. This runs **beside** Engine B (opzava) with
> no integration ([F2](./90-parity-findings.md), F5). DB columns are in [`00`](./00-database-ledger.md).
> Marks: ✅ verified this session · 🔎 pass-1 research · ✅✅ double-verified · ⚠️ nuance.

## The task board state machine 🔎

Runtime statuses (`db.ts:194`): `backlog · inbox · assigned · awaiting_owner · in_progress · review ·
quality_review · done · failed`. (`backlog`/`awaiting_owner` exist in the type but aren't produced by the
dispatch pipeline.)

```
 create (HTTP / coordinator / recurring spawner)
   ▼
 inbox ──autoRouteInboxTasks() (score agents, cap 3 in_progress)──► assigned
   │  dispatchAssignedTasks(): ATOMIC claim UPDATE...WHERE status='assigned' (changes=0 → another won, skip)
   ▼
 in_progress ── direct-API (sync text) ───────────────────────────► review
   │        └─ gateway/targeted (async, metadata.async_state=pending)
   │              │ reconcileDeferredTaskCompletions() → agent.wait(runId)
   │              ▼
   │            review
   ▼
 review ── runAegisReviews() flips to quality_review, invokes Aegis reviewer ──┐
   │         approved → done                                                    │
   │         rejected → assigned (+feedback comment); ≥3 rejects → failed       │
   └─────────────────────────────────────────────────────────────────────────►(retry)
 failure caps: ≥5 dispatch attempts → failed; stale in_progress + offline agent → requeue (≥5 → failed)
```

The orchestration core is `task-dispatch.ts` (1690 LOC, 🔎): `autoRouteInboxTasks` (keyword-affinity + idle
+ capability scoring, capacity cap 3), `dispatchAssignedTasks` (atomic claim, then 3 dispatch paths —
direct provider API / targeted gateway session / new gateway session), `reconcileDeferredTaskCompletions`
(promotes async runs to `review`), `runAegisReviews` (the quality gate → `done` or requeue),
`requeueStaleTasks` (offline-agent recovery).

⚠️ **Dispatch model selection is hardcoded** ✅✅ (F7): `classifyDirectModel()`
(`task-dispatch.ts:500-522`) returns literal `claude-opus-4-6` / `claude-haiku-4-5-20251001` /
`claude-sonnet-4-6` (with an optional per-agent `dispatchModel` override). See [F7](./90-parity-findings.md).

## The scheduler — the heartbeat ✅ (F-engines verified)

`scheduler.ts` `initScheduler()` (started at boot via `db.ts:84-89`, skipped in build/test) runs a single
`setInterval(tick, 60_000)` (`TICK_MS`, `:292/:418`) driving **12 inherited jobs**: `auto_backup`,
`auto_cleanup`, `agent_heartbeat`, `webhook_retry`, `claude_session_scan`, `skill_sync`, `local_agent_sync`,
`gateway_agent_sync`, `task_dispatch`, `aegis_review`, `recurring_task_spawn`, `stale_task_requeue`. The
`task_dispatch` job chains `autoRouteInboxTasks → reconcileDeferredTaskCompletions → dispatchAssignedTasks`
(`:468`); `aegis_review` is a **separate** registered job (not a sub-step). ⚠️ **None of the 12 jobs drives
the opzava runner daemon** ✅✅ — Engine B has no scheduled loop (F5).

## Agent model 🔎

Four definition layers: **templates** (`agent-templates.ts`, 7 archetypes — ⚠️ hardcoded model ids, F7),
**framework-templates** (6 frameworks × 6 archetypes), **runtimes** (`agent-runtimes.ts` — detect/install
`openclaw|hermes|claude|codex|opencode` binaries; the AI script-reviewer is pinned to
`claude-sonnet-4-20250514`, F7), **cards** (display helpers). Persisted in the `agents` table
(status `offline|idle|busy|error`). Synced from `openclaw.json` (`agent-sync.ts`) and from disk
(`local-agent-sync.ts`). **No formal agent state machine** — status is a free string column.

→ **F2**: this is a *different* agent model from opzava `opzava_agent_roles` (see [21](./21-team-social-va-modules.md)).

## Memory model 🔎

A **markdown knowledge graph** on disk (Obsidian/"Ars Contexta" style), NOT conversational memory.
`memory-utils.ts` (964 LOC): `[[wiki-link]]` extraction, link graph, health diagnostics, MOCs, four
maintenance passes. `memory-search.ts`: SQLite **FTS5** (`memory_fts`, porter/unicode61, BM25). Path safety
in `memory-path.ts` (traversal/symlink guards). Agent `working_memory` is a separate plain column.

## Cron / scheduling 🔎

`schedule-parser.ts` (`parseNaturalSchedule` NL→cron; `isCronDue` firing predicate — ⚠️ checks only
minute/hour/day-of-week, **ignores day-of-month & month**, so it can over-fire), `cron-occurrences.ts`
(full 5-field parser for previews — disagrees with `isCronDue`), `cron-utils.ts`, `recurring-tasks.ts`
(clones template tasks when `isCronDue`, dedup by child title).

## Tokens & cost 🔎 + ✅✅

`token-pricing.ts` (⚠️ hardcoded `MODEL_PRICING` table — F7), `token-utils.ts`, `task-costs.ts` (per-task/
agent/project rollups over `token_usage`). Analytics: `agent-evals.ts` (4-layer eval engine),
`agent-optimizer.ts` (efficiency/recommendations), `spawn-history.ts` (mirrors into the `runs` AgentRun
table). ⚠️ **This is a second, parallel cost surface** vs opzava `platform/costs` — the hardcoded pricing
here contradicts the golden principle (F7). [F-engines + F7 double-verified.]

## Skills 🔎

`skill-registry.ts` (search/install across 3 registries, with a 12-rule security scan), `skill-sync.ts`
(disk↔`skills` table, disk-wins). Driven by `skill_sync` scheduler job.

## Backbone (auth / config / event-bus / runs) — pointers

Auth model, pragmas, and the full schema are in [`00`](./00-database-ledger.md) (✅). Highlights:
`requireRole(viewer<operator<admin)`; proxy-header → session-cookie → API-key resolution; session tokens +
API keys stored as SHA-256 hashes; a `settings.security.api_key` row overrides env `API_KEY`. **Event bus**
(`event-bus.ts`): a singleton `EventEmitter` (survives HMR via `globalThis`) — the single fan-out feeding
SSE (`/api/events`) and webhooks. **Runs** (`runs.ts`): the Agent-Run-Protocol over the `runs` table
(provenance hash, cost, eval, leaderboard) — surfaced by `/api/v1/*`.

## Subtleties for parity comparison

1. Engine A is a flat status-string Kanban with **implicit** retries baked into the dispatcher — contrast
   the opzava `WorkflowRun`/`Job` graph with explicit typed transitions.
2. The dispatcher's only concurrency guard is the atomic `UPDATE…WHERE status='assigned'` claim.
3. Engine A **is** wired and scheduled (60s tick); Engine B is **not** (F5) — so today the *running* product
   is Engine A + synchronous opzava request handlers.
4. Hardcoded model ids/pricing pervade `src/lib` (F7); the opzava layer avoids them.
5. The `agents` table and `opzava_agent_roles` are two unreconciled models (F2).

<!-- agent-context: read this before editing the module -->

# scheduler

## Purpose

The single in-process periodic-tick loop that drives every background job in the
inherited operator console (Engine A): DB backup, retention cleanup, agent
heartbeat/liveness, webhook retries, session/skill/local-agent/gateway sync, and —
the one this surface is named for — the **task-dispatch** cycle that assigns and
routes tasks to agents. One `setInterval(tick, TICK_MS)` wakes every 60s and runs
whichever registered tasks are due and enabled.

## Public surface

From `src/lib/scheduler.ts` (this is the truth — there is no barrel/index):

- `initScheduler(): void` — registers all tasks and starts the `setInterval` tick
  loop. Idempotent: early-returns if `tickInterval` is already set (`:296`).
- `getSchedulerStatus()` — returns the live `ScheduledTask[]` snapshot
  (`id, name, enabled, lastRun, nextRun, running, lastResult`) read by the API.
- `triggerTask(taskId: string): Promise<{ ok: boolean; message: string }>` —
  manually run one task by id (used by the admin "Run now" action).
- `stopScheduler(): void` — `clearInterval` + nulls the handle (`:547`).

The `ScheduledTask` interface is internal (not exported). The route
`src/app/api/scheduler/route.ts` re-exports nothing; it is the only inbound caller
of `getSchedulerStatus` / `triggerTask` (admin-only via `requireRole('admin')`).

## Dependencies

**Outbound** (what `scheduler.ts` imports — all are `src/lib`, NO `src/opzava` edge):
`db` (getDatabase, logAuditEvent), `agent-sync`, `config`, `logger`, `webhooks`
(`processWebhookRetries`), `claude-sessions`, `sessions`
(`pruneGatewaySessionsOlderThan`, `getAgentLiveStatuses`), `event-bus`,
`skill-sync`, `local-agent-sync`, and `task-dispatch`
(`dispatchAssignedTasks`, `runAegisReviews`, `requeueStaleTasks`,
`autoRouteInboxTasks`, `reconcileDeferredTaskCompletions`), `recurring-tasks`
(`spawnRecurringTasks`). All periodic behavior, including task-dispatch, fans out
through these Engine-A lib modules — none of them import `src/opzava`.

**Inbound** (who starts/reads this — an editor must not silently break them):
- `src/lib/db.ts:85-86` — lazy `import('./scheduler').then(initScheduler)` after DB
  init. **Runtime installs only**: gated on `!isBuildPhase && !isTestMode`
  (`db.ts:84`) so the loop never starts under `next build` or tests (keeps startup
  deterministic). The opzava runner maintenance loop is booted beside it
  (`db.ts:93`, ARD 0007 — the two engines coexist, each with its own timer).
- `src/app/api/scheduler/route.ts` — `GET /api/scheduler` (status) and
  `POST /api/scheduler { task_id }` (manual trigger), both `admin`-gated.

## Invariants

Read from the real code (`src/lib/scheduler.ts`):

1. **One tick, one second-resolution loop.** `TICK_MS = 60 * 1000` drives
   `setInterval(tick, TICK_MS)` (`:292, :418`). Daily jobs (backup ~3AM, cleanup
   ~4AM UTC) compute `nextRun` from `getNextDailyMs(hour)`; everything else
   (heartbeat 5m, all sync/dispatch/review/requeue/spawn tasks) is on the 60s tick.
   Per-task `nextRun` is staggered after startup (5s–30s) to avoid a cold-start herd.
2. **Non-reentrant per task.** `tick()` skips any task with `task.running` true or
   `now < task.nextRun` (`:438`). The handler sets `running=true` in `try`, clears it
   in `finally`, and always advances `nextRun = now + intervalMs` in `finally`
   (`:481-485`) — so a thrown task re-arms for its next slot rather than stalling.
3. **Every task is settings-gated, with two distinct default tables.** `tick()` and
   `getSchedulerStatus()` each recompute the setting key + default per task id
   (`:441-454`, `:502-514`). Operational tasks (heartbeat, all sync, task_dispatch,
   aegis_review, recurring_task_spawn, stale_task_requeue) default **enabled**;
   backup/cleanup default to their `general.*` setting. The key/default logic is
   **duplicated verbatim** in `tick()` and `getSchedulerStatus()` — they must stay
   in lockstep or the status UI will disagree with what the loop actually runs.
4. **Heartbeat is the only task that writes the `agents` table from the loop.**
   `runHeartbeatCheck()` marks stale agents `offline` and inserts
   `agent_status_change` activities + notifications **inside one `db.transaction()`**
   (`:200-218`). `syncAgentLiveStatuses()` likewise updates `agents` in a tx and
   broadcasts `agent.status_changed` (`:247-285`).
5. **The `task_dispatch` slot is a 3-call pipeline**, not one call:
   `autoRouteInboxTasks()` → `reconcileDeferredTaskCompletions()` →
   `dispatchAssignedTasks()` (`:468-473`). The message filters out "No ..."/"none
   completed" strings — changing any of those three's return `message` wording can
   silently hide status output.

## Harmony rules

- **Engine A (inherited `src/lib` / `src/app`).** This module belongs to the
  inherited operator-console engine. The boundary gate to Engine B (`src/opzava`)
  is the **`agents` table** (ARD 0007 — engine separation & surface unification;
  enforced statically by `test/engine-boundary.test.mjs`). Scheduler has **zero**
  `src/opzava` imports; do not add any. Product behavior (campaigns, roles, the
  durable runner) lives in `src/opzava` and runs on its **own** timer booted beside
  this one (`db.ts:93`) — not inside this loop.
- **New product behavior must NOT be added here.** It goes in `src/opzava`. Only
  hardening/customization of the inherited periodic jobs belongs in
  `scheduler.ts`. Adding a new periodic job is acceptable **only** if it is an
  inherited/operator-console concern; otherwise add a timer in `src/opzava`.
- **One-way bridge only.** Engine B may resolve a role into the inherited
  `agents`-table runtime identity; the reverse direction is forbidden. The
  scheduler only ever reads/writes the inherited `agents` table — never
  `opzava_agent_roles`.

## Editor guardrails

Verified findings an editor must not regress. Severity and `file:line` carried
verbatim from `docs/architecture/realtime-chat-production-review.md` and
`docs/architecture/system-map/92-stale-findings.md` where they touch this surface:

- **P3-4 (defer / opportunistic) — the scheduler IS the canonical periodic-timer
  pattern.** The audit names the `scheduler` pattern explicitly as the model for
  moving hot-path work onto a boot-started `setInterval(process, 60s)`:
  *"move to a boot-started `setInterval(process, 60s)` (mirrors existing
  `github-sync-poller`/`scheduler`/`rate-limit` pattern). Keep throttle as guard.
  Do NOT wrap the trim in a transaction or rewrite the OFFSET query."*
  — `realtime-chat-production-review.md` P3-4. **Guardrail:** when adding any
  periodic background work, prefer registering a task here (or a sibling periodic
  timer) over ad-hoc `setInterval` scattered in request paths; keep any per-cycle
  throttle as a guard.

- **In-transaction write discipline is idiomatic here — keep it (P1-1 / P3-9).**
  The audit confirms `db.transaction` is used 31× across the codebase
  *"(runner, admin-config, scheduler)"* and prescribes **`BEGIN IMMEDIATE`** for
  any outbox/durable write to make `busy_timeout=5000` deterministic under a
  concurrent second writer (MCP/CLI/**cron**).
  — `realtime-chat-production-review.md` P1-1, P3-9. **Guardrail:**
  `runHeartbeatCheck` and `syncAgentLiveStatuses` already wrap multi-row
  `agents`/`activities`/`notifications` writes in `db.transaction()`. Preserve
  that; do not split the heartbeat/notify batch into independent auto-commits.

- **No `mc-{id}-{Date.now()}` idempotency keys (P1-3 anti-pattern).** The audit
  flags `src/lib/task-dispatch.ts:984,1291,1351` for the non-deterministic
  `mc-${id}-${Date.now()}` key. **Guardrail:** the `task_dispatch` slot invokes
  `task-dispatch.ts`; any idempotency key produced on this path must be stable
  across retries, not `id+Date.now()`. Do not regress this when touching the
  dispatch pipeline.
  — `realtime-chat-production-review.md` P1-3.

- **Stale-finding ledger — inherited `agents` table is the Engine-A boundary.**
  *"The inherited `agents` table (driven by `src/lib/migrations.ts`, surfaced at
  `src/app/api/agents/`) and the opzava `opzava_agent_roles` table … are separate,
  with no bridge or reconciliation code."* — `92-stale-findings.md` ✅ CONFIRMED
  (two unreconciled agent models). **Guardrail:** the scheduler's heartbeat/sync
  writes touch the **inherited** `agents` table only; do not assume parity with
  `opzava_agent_roles`, and do not add reconciliation logic here.

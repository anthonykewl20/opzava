<!-- agent-context: read this before editing the module -->

# lib/scheduler

## Purpose
The inherited-engine timer loop: a single `setInterval` tick (60s) that runs every background task — DB backup, retention cleanup, agent heartbeat, webhook retry, claude/skill/local-agent/gateway-agent sync, and the task-dispatch chain (route → reconcile → dispatch, Aegis review, stale requeue, recurring spawn). Each task is declared once in a registry; the tick, the status API, and the manual-trigger API all read from it.

## Public surface
Exported from `src/lib/scheduler.ts` (no barrel; `src/lib` is flat).

Registry (the single source of truth for every scheduled task):
- `ScheduledTaskSpec` (`scheduler.ts:42`) — `{ id, name, settingKey, defaultEnabled, intervalMs, firstRunDelay(now), handler(ctx) }`.
- `ScheduledTaskContext` (`scheduler.ts:36`) — `{ manual: boolean }` passed to every handler; `manual` distinguishes a `triggerTask()` call from a scheduled tick.
- `SCHEDULED_TASKS` (`scheduler.ts:83`) — `readonly` array of all 13 specs. initScheduler, `tick`, `getSchedulerStatus`, and `triggerTask` all derive from this.
- `getRegisteredTaskIds()` (`scheduler.ts:195`) — the id list the API route uses as its allow-list.

Lifecycle + API:
- `initScheduler()` (`scheduler.ts:472`) — idempotent (returns early if already running); seeds the `tasks` map from the registry and starts the tick loop. Called from `lib/db.ts` after the DB is ready.
- `getSchedulerStatus()` (`scheduler.ts:539`) — projects each task's runtime state + setting-gated `enabled` flag (for `GET /api/scheduler`).
- `triggerTask(taskId)` (`scheduler.ts:568`) — runs a task's handler with `{ manual: true }` immediately (for `POST /api/scheduler`).
- `stopScheduler()` (`scheduler.ts:575`) — clears the tick interval.

Internal helpers (not exported): `runBackup`, `runCleanup`, `runWalCheckpoint`, `runHeartbeatCheck`, `syncAgentLiveStatuses`, `runTaskDispatchChain`, `runGatewayAgentSync`, `tick`, `getNextDailyMs`, `isSettingEnabled`, `getSettingNumber`, `getEnvNumber`.

## Dependencies
- **Outbound** (what this imports): inherited `src/lib` only — `db`, `agent-sync`, `config`, `logger`, `webhooks`, `claude-sessions`, `sessions`, `event-bus`, `skill-sync`, `local-agent-sync`, `task-dispatch` (`makeDefaultDeps` + the five orchestrators), `recurring-tasks`. Inherited-engine module — does not cross into `src/opzava` (ARD 0007 / `test/engine-boundary.test.mjs`).
- **Inbound** (who imports this — do not silently break):
  - `lib/db.ts:85-86` — calls `initScheduler()` once after DB init.
  - `src/app/api/scheduler/route.ts` — `getSchedulerStatus()` (GET + the POST allow-list) and `triggerTask()` (POST).

## Invariants
1. **The registry is the single source of truth.** Every task id, display name, setting gate, default-enabled flag, interval, first-run offset, and handler is declared exactly once in `SCHEDULED_TASKS` (`scheduler.ts:83`). `initScheduler` (`scheduler.ts:484-494`), `tick` (`scheduler.ts:518`), `getSchedulerStatus` (`scheduler.ts:551`), and `triggerTask` (`scheduler.ts:569`) all read from it. Do not re-derive a task's gate or handler in a second place — the pre-refactor code did this in three ternary chains and they drifted.
2. **Task ids are unique** (`scheduler.ts:195` `getRegisteredTaskIds`, pinned by `src/lib/__tests__/scheduler-registry.test.ts`). The API route's POST allow-list is `getRegisteredTaskIds()`; a duplicate or missing id is a behavior regression.
3. **The setting gate is read per-tick, not cached** (`scheduler.ts:521-522`): `tick` calls `isSettingEnabled(spec.settingKey, spec.defaultEnabled)` every run, so toggling a setting takes effect within one tick. `agent_heartbeat` and the sync/dispatch tasks default to enabled; `auto_backup` / `auto_cleanup` default to **disabled** (`settingKey general.auto_backup` / `general.auto_cleanup`).
4. **First-run offsets are staggered** (`scheduler.ts:83-193` `firstRunDelay`): backup ~3 AM UTC, cleanup ~4 AM UTC (via `getNextDailyMs`), heartbeat after 5 min, and the 60s-tick tasks staggered 5/10/15/20/25/30 s after startup so they don't all fire on the same tick. `claude_session_scan`'s interval is env-tunable (`MC_CLAUDE_SCAN_INTERVAL_MS`, default TICK).
5. **`gateway_agent_sync` differs by mode** (`scheduler.ts:71-81`): a scheduled tick also runs `syncAgentLiveStatuses()` and appends `| Live status: N refreshed`; a manual `triggerTask` run does not (it only re-reads `openclaw.json`). The handler branches on `ctx.manual`.
6. **One tick interval, no per-task timers** (`scheduler.ts:496`): a single `setInterval(tick, TICK_MS)`; `tick` iterates the map and skips tasks that are `running` or not yet due. `initScheduler` is idempotent (`scheduler.ts:473`).

## Harmony rules
- **Engine:** inherited `src/lib` (Engine-A live surface). It coexists with the opzava `platform/runner` maintenance daemon as a **separate timer** — the two engines are not merged (ARD 0007, `test/engine-boundary.test.mjs`). The scheduler owns the task lifecycle + retention; the runner owns campaign-send durability. Do not fold one into the other.
- **Dead-surface / dead-wired:** none. All 13 registry entries are live and gated by real settings.

## Editor guardrails
Copied verbatim from `docs/architecture/system-map/92-stale-findings.md` (scheduler entries):

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

> ## ✅ RESOLVED — scheduler task list deduplicated into a registry
>
> `initScheduler` previously hardcoded ~12 `tasks.set(...)` calls and then
> re-derived each task's setting gate + handler in two more ternary chains
> (`tick` and `getSchedulerStatus`/`triggerTask`). **Resolved** by the
> `SCHEDULED_TASKS` registry (`scheduler.ts:83`) — init/tick/status/trigger all
> read from it. This is an internal data table, not a public `register()` API
> (single caller).
>
> **Guardrail (scheduler MODULE.md):** adding/removing a task means editing
> `SCHEDULED_TASKS` once — do not also edit a parallel `tasks.set` list or a
> ternary chain (they no longer exist). Preserve every task's setting gate,
> default-enabled flag, interval, and first-run offset exactly; the registry
> contract is pinned by `src/lib/__tests__/scheduler-registry.test.ts`.

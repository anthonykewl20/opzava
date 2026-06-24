<!-- agent-context: read this before editing the module -->

# event-bus

## Purpose

In-process, server-side pub/sub bus (`ServerEventBus extends EventEmitter`) that broadcasts database
mutations to SSE/realtime clients and other in-process listeners. Singleton per Next.js server
process. Per the production-review framing (§5 #20, Slack), **this bus is a fanout *accelerator*, not
a reliability layer** — best-effort push to currently-connected clients; durability lives in the
`realtime_events` SQLite outbox, which `broadcast()` writes to before emitting.

## Public surface

Exported from `src/lib/event-bus.ts` (truth):

- `eventBus: ServerEventBus` — the singleton instance (stashed on `globalThis.__eventBus` to survive
  HMR in dev). The only thing callers import.
- `interface ServerEvent` — `{ id?: number; type: string; data: any; timestamp: number;
  workspace_id?: number | null }`.
- `type EventType` — the string-literal union of the ~26 emitted event types (`task.created`,
  `task.updated`, `task.deleted`, `task.status_changed`, `task.escalated`, `chat.message`,
  `chat.message.deleted`, `notification.created`, `notification.read`, `activity.created`,
  `agent.created`, `agent.updated`, `agent.deleted`, `agent.synced`, `agent.status_changed`,
  `audit.security`, `security.event`, `connection.created`, `connection.disconnected`,
  `github.synced`, `run.created`, `run.updated`, `run.completed`, `run.eval_attached`,
  `session.updated`).
- `ServerEventBus.broadcast(type: EventType, data: any): ServerEvent` — the one call publishers use.
  Records to the outbox (assigns the numeric `id`), then `this.emit('server-event', event)`.
- Inherited `on('server-event', ...)` / `off(...)` from `EventEmitter` — how subscribers attach.

`broadcast()` is the single chokepoint: it persists first (so the in-process fast path and the 1s
outbox poll can never disagree on `id`), then emits.

## Dependencies

- **Outbound** (what this imports):
  - `events` (Node stdlib) — base `EventEmitter`.
  - `./logger` — warn on recording failure.
  - `./realtime-events` → `recordServerEvent`, **lazy `require()`** at line 69, deliberately to
    break the `db.ts → event-bus.ts → db.ts` module cycle (comment at line 68). Do not convert to a
    top-level import without breaking the cycle another way.
  - **No `src/opzava` import** — verified (`grep` for `event-bus`/`eventBus` under `src/opzava/` is
    empty). This is Engine-A-internal; `realtime-events.ts` is the only Engine-A sibling it touches.
- **Inbound** (publishers / `broadcast` callers) — all Engine A (`src/lib` + `src/app`):
  - `src/lib/db.ts` (`activity.created`, `notification.created`, `agent.status_changed`,
    `audit.security`), `task-dispatch.ts` (`task.status_changed`, `task.escalated`, `task.updated`),
    `runs.ts` (`run.*`, `run.eval_attached`), `agent-sync.ts` (`agent.created`), `scheduler.ts`
    (`agent.status_changed`), `security-events.ts` (`security.event`), all `src/lib/adapters/*`
    (`agent.created`, `agent.status_changed`, `task.updated`).
  - `src/app/api/events/route.ts` & `src/app/api/v1/runs/stream/route.ts` are the **subscribers**
    (`eventBus.on('server-event', handler)` → SSE stream per connection; `off` on abort/cancel).
  - `src/lib/webhooks.ts` `initWebhookListener()` is a second subscriber — dispatches HTTP webhooks
    on `'server-event'` (head-of-line blocks `broadcast()`; documented in production-review §7).
  - API routes that publish: `agents`, `agents/[id]`, `agents/register`, `tasks`, `tasks/[id]`,
    `tasks/[id]/branch`, `notifications`, `chat/messages`, `connect`, `github`, `hermes/events`,
    `pipelines/run`, `quality-review`.

## Invariants

1. **Record-then-emit ordering.** `broadcast()` calls `recordServerEvent` (assigns `id`) **before**
   `this.emit('server-event')`. The live handler therefore sees the id-bearing event and advances the
   per-client replay cursor; the 1s outbox poll's `WHERE id > cursor` then excludes it. Never reorder
   these (reordering reintroduces a live-vs-replay double-delivery race).
2. **Process singleton via `globalThis`.** Identity is pinned on `globalThis.__eventBus` so dev HMR
   and repeated module loads share one emitter. Subscribers/publishers rely on this being the same
   instance across the process.
3. **Listener cap is 500** (`setMaxListeners(500)` in the private ctor). Each open SSE connection
   registers one `'server-event'` listener; the ~502nd concurrent SSE connection will exceed the cap.
4. **Volatile fallback on recording failure.** If `recordServerEvent` throws, `broadcast()` emits an
   id-less volatile event `{ type, data, timestamp }` and continues — delivery is best-effort, the
   event is not recoverable via replay.
5. **One event-name, `'server-event'`.** All SSE consumers multiplex on this single channel and
   filter by the JSON `type` string in `data`/payload; there is no per-type SSE event name (see
   `formatSseFrame` emitting only `id:`/`data:`, never `event:`).

## Harmony rules

- **This is Engine A** (inherited `src/lib` / `src/app`). The boundary gate to Engine B
  (`src/opzava`) is the **`agents` table** (ARD 0007, `test/engine-boundary.test.mjs`). New product
  behavior must **NOT** be added here — it goes in `src/opzava`. Only hardening/customization of the
  inherited bus is permitted.
- The bus has **no `src/opzava` import** today; do not introduce one. If an Opzava module needs to
  publish a realtime event, it must reach the bus only through the Engine-A public surface
  (e.g. an Engine-A route/service), never by importing `@/lib/event-bus` directly from
  `src/opzava` — that would be a downward Engine-B→Engine-A edge crossing the boundary.
- No stale/dead-surface finding applies to this module (see `92-stale-findings.md`); the dead-surface
  findings there concern `src/opzava/core/workflows`, `social`, `general-va`, not the bus.

## Editor guardrails

Verbatim from `docs/architecture/realtime-chat-production-review.md`:

> **P2-5. ⟐ Recording-failure volatile fallback — latching flag + client dedup mis-key**
> - **Sad path**: One transient `recordServerEvent` throw sets `recordingFailureLogged=true` (never
>   reset), mutes the warning for process life, and emits a volatile `{type,data,timestamp}` with no
>   id. Client dedup at `use-server-events.ts:64` falls back to sticky `event.lastEventId` (the PRIOR
>   event's id, already in the Set) → the volatile event is mis-deduped and skipped.
> - **Calibration**: Server-side SSE drop is REFUTED for chat — `serverEventWorkspaceId` falls back
>   to `data.workspace_id`, and chat broadcasts spread the full row (which carries workspace_id). The
>   genuine bug is the client-side mis-dedupe (drops volatile events) + the latching flag (mutes the
>   warning). Trigger is near-never (requires `busy_timeout=5000` to be exceeded or a disk fault).
> - **Evidence**: `src/lib/event-bus.ts:47,65,71-77`; `src/lib/use-server-events.ts:64-66`;
>   `src/lib/realtime-events.ts:68-76`.
> - **Minimal fix**: (1) In `event-bus.ts`, reset `recordingFailureLogged=false` after a successful
>   `recordServerEvent` (or rate-limit the warn to 1/60s). (2) In `use-server-events.ts:64`, only
>   dedupe when `payload.id` is a real number — id-less volatile events bypass the Set entirely. **Do
>   NOT** add broadcast retry/request-failing semantics to a throwaway realtime log table
>   (over-engineering).

Severity (per the review's P-scale): **P2 — fix soon, scale-aware.** Do not "fix" the latching flag
or the volatile fallback without reading P2-5 in full; the server-side drop path is REFUTED for chat
and the proposed fixes are deliberately minimal.

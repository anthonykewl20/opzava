# Engine A — Live Surfaces (navigability)

> The navigability page for the **live `src/lib` realtime + status surfaces** — the code that
> actually pushes mutations to browsers and serves the dashboard. This complements the
> `src/opzava` MODULE.md layer (which covers Engine B only). `src/lib` has no per-module
> `MODULE.md` files; this single page is the editing-AI context for the blind-edit zones named
> below.
>
> **Scope:** the realtime spine (`event-bus` + `realtime-events` + `use-server-events`), the
> status-action registry (`status-actions`), the two SSE routes (`/api/events`,
> `/api/v1/runs/stream`), and the chat write route (`/api/chat/messages` POST).
>
> **Out of scope:** the gateway control socket (`websocket.ts`), PTY manager, webhooks — those
> are transport/infra, not the realtime spine. They are covered in
> `realtime-chat-production-review.md`.
>
> Verified 2026-06-24 against the shipped source. Where this doc and the code disagree,
> **code wins** — fix this doc.

---

## Engine boundary (read first)

All surfaces here are **Engine A** (`src/lib`, inherited). The realtime spine is the **shared
substrate** both engines write through: every domain mutation — inherited (`tasks`, `agents`,
`messages`) or Engine B (`content`/`team` modules) — reaches the browser through the *same*
`eventBus.broadcast` → `realtime_events` outbox. That is intentional and correct; it is NOT a
boundary violation (a write across the team<->src/lib line would be). The Engine-B modules call
`eventBus` via the public `@/lib/event-bus` import; they never touch `realtime_events` directly.
See `engine-boundary.md` and `test/engine-boundary.test.mjs`.

---

## 1. Realtime spine

### `src/lib/event-bus.ts` — in-process fanout bus

**Purpose.** Singleton `EventEmitter` per Next.js server process. `broadcast()` durably records
an event to the `realtime_events` outbox (via `recordServerEvent`) and then emits to in-process
SSE listeners. It is a **fanout accelerator, not a reliability layer** — reliability lives in
the SQLite outbox (`realtime_events`), and the 1s poll in the SSE routes recovers anything the
in-process emit misses.

**Public surface.**
- `eventBus` — the singleton (`ServerEventBus`), exported and pinned on `globalThis.__eventBus`
  to survive HMR (`event-bus.ts:84-86`).
- `broadcast(type: EventType, data: any): ServerEvent` — record-then-emit (`event-bus.ts:64-80`).
- `interface ServerEvent` — `{ id?, type, data, timestamp, workspace_id? }` (`event-bus.ts:9-15`).
- `type EventType` — the closed union of bus event names (`event-bus.ts:18-43`).

**Dependencies.**
- **Outbound:** `node:events`; `./logger` (warn only on durability failure). `recordServerEvent`
  is `require()`-d lazily inside `broadcast` (`event-bus.ts:69`) to avoid a `db.ts → event-bus.ts
  → db.ts` module cycle — **do not** hoist that import to the top of the file.
- **Inbound:** both SSE routes (`/api/events`, `/api/v1/runs/stream`), the chat write route, and
  every Engine-B service that broadcasts a mutation. Editors must not change the
  record-then-emit ordering or the `'server-event'` channel name without updating all listeners.

**Invariants.**
- **Record-before-emit.** `recordServerEvent` runs (`event-bus.ts:70`) BEFORE `this.emit`
  (`:78`). The persisted numeric `id` is assigned by the outbox INSERT and rides on the emitted
  event; the SSE replay cursor (`WHERE id > lastSentId`) depends on this. Reordering breaks the
  double-delivery guard.
- **Volatile fallback is best-effort.** On a `recordServerEvent` throw, `broadcast` emits a
  volatile `{type,data,timestamp}` with no `id` (`event-bus.ts:65,76`) and latches
  `recordingFailureLogged` (`:47,73`). A volatile event is not replayable and must NOT advance
  the durable cursor (see `realtime-events` §Invariants).
- **`MaxListeners` = 500** (`event-bus.ts:51`). One bus per process; the SSE routes add one
  listener per open connection. Do not lower this without bounding connection count.

**Harmony rules.**
- **Engine:** Engine A (shared substrate). Engine B modules are *callers*, never editors of this
  file's contract.
- **The bus is not a job queue.** Never put a blocking/network call in a bus listener that runs
  on the `'server-event'` channel — `broadcast()` is on the write hot path of every mutation.
  (The `webhooks.ts` listener already violates this and is tracked as debt; do not add another.)

**Editor guardrails.** See `92-stale-findings.md` §"Realtime-chat traps" — the
`recordingFailureLogged` latching flag and the volatile-event cursor rule are CONFIRMED/PARTIAL
items an editor must preserve.

---

### `src/lib/realtime-events.ts` — SQLite outbox + SSE framing

**Purpose.** The durable half of the spine. Persists every broadcast as a row in
`realtime_events` (the SSE outbox), prunes it on a 60s throttle, replays it by `id > cursor` per
workspace, and frames SSE wire bytes. This module is where replay/durability correctness lives.

**Public surface.**
- Constants (`realtime-events.ts:4-10`): `SSE_RETRY_MS`, `SSE_HEARTBEAT_MS`, `SSE_POLL_MS`,
  `SSE_REPLAY_LIMIT`, `SSE_RETENTION_MS`, `SSE_RETENTION_MAX_ROWS`, `SSE_PRUNE_INTERVAL_MS`.
- `recordServerEvent(input): StoredServerEvent` — INSERT into `realtime_events`, returns the row
  with its numeric `id` and resolved `workspace_id` (`:94-108`).
- `pruneRealtimeEvents(now?)` — age-delete + row-cap trim, throttled once/60s (`:110-130`).
- `readServerEventsAfter({afterId, workspaceId, limit?})` — bounded ascending replay
  (`LIMIT ≤ SSE_REPLAY_LIMIT=200`) (`:132-156`).
- `minRealtimeEventId(workspaceId)` — `MIN(id)` for the resync-sentinel gap check (`:158-167`).
- `parseLastEventId(value)` — coerce `Last-Event-ID` header/query to a safe positive int (`:169-173`).
- `formatSseFrame(event)` — emits `id:` + `data:` lines only (NEVER `event:`) (`:175-182`).
- `formatSseRetryFrame(base?, jitter?)` — jittered `retry:` frame (`:184-186`).
- `serverEventWorkspaceId(event)` — resolve workspace from event, falling back to
  `data.workspace_id`/`data.workspaceId` (`:68-76`).
- `interface StoredServerEvent extends ServerEvent` — adds required `id` + `workspace_id`
  (`:12-15`).

**Dependencies.**
- **Outbound:** `./db` (`getDatabase`); type-only `import type { ServerEvent } from './event-bus'`
  (`:2`) — type-only, so no runtime cycle.
- **Inbound:** both SSE routes, `event-bus.ts` (lazy require), and any code that needs the
  constants/framing.

**Invariants.**
- **`formatSseFrame` never emits `event:`.** Only `id:` + `data:` (`:177-180`). Every event
  arrives at the client via `onmessage`; clients CANNOT use `es.addEventListener('chat.message',
  …)`. "Type filters" are server-side JSON `type` string matches, not SSE event names. Real
  client-contract constraint.
- **Cursor purity.** A frame with no numeric `id` (the `connected` ack, the `resync.required`
  sentinel, heartbeat comments, volatile fallback events) must NEVER advance a client's durable
  replay cursor. `formatSseFrame` omits `id:` when `event.id` is not a positive int (`:177-179`);
  replay readers key strictly on `id > lastSentId`.
- **`workspaceIdFromData` has no `chat.*` table branch** (`:48-56`). Chat delivery works only
  because both broadcasters spread the full `messages` row (which carries `workspace_id`). A
  future broadcaster that omits `workspace_id` from `data` will persist the event with
  `workspace_id=NULL` and silently drop it for ALL SSE viewers. If you add a chat broadcaster,
  include `workspace_id` in the payload.
- **Pruning is a SOFT cap.** `pruneRealtimeEvents` is a non-atomic SELECT-then-DELETE
  (`:118-128`), throttled globally to once/60s (`:111`). It runs synchronously on the
  `recordServerEvent` hot path (`:96`) before the INSERT. Single-writer serialization is the
  effective atomicity guarantee — do not add locking here.
- **`recordServerEvent` is not transactional.** It is one auto-commit INSERT (`:98-101`). The
  chat write route calls it via `broadcast` *after* up to ~21s of gateway I/O — the
  transactionality gap is owned by the route, not here (see CONFIRMED trap P1-1/P1-2).

**Harmony rules.**
- **Engine:** Engine A. No Engine-B import of this module's internals except the public
  constants/framing helpers.
- **No DRY extraction across SSE routes here.** The two routes duplicate ~100 lines of
  `safeEnqueue`/`sendEvent`/`replay`/`stop` logic. That duplication is a tracked debt item
  (I20), NOT something to fix by adding a shared module here without a deliberate decision — the
  routes have intentionally divergent filters (workspace+chat-ACL vs run-types-only).

**Editor guardrails.** See `92-stale-findings.md` §"Realtime-chat traps" — jittered retry
(RESOLVED), resync sentinel (RESOLVED), row-cap soft-target (CONFIRMED) are all defined by code
in this file.

---

### `src/lib/use-server-events.ts` — browser SSE hook

**Purpose.** Client React hook that opens one `EventSource('/api/events')`, parses each
`onmessage` frame, dedupes by numeric event id, and dispatches into the Zustand store. The only
browser-side consumer of the spine.

**Public surface.**
- `useServerEvents()` — the hook (`:25`). No exports beyond it; the `ServerEvent` interface here
  (`:9-14`) is local, not the canonical one (that lives in `event-bus.ts`).
- Constants: `MAX_DEDUPED_EVENT_IDS = 500` (`:23`) — the in-memory LRU dedup window, wiped on tab
  reload.

**Dependencies.**
- **Outbound:** `@/store` (Zustand: `useMissionControl` + the reducer actions), `@/lib/client-logger`.
  Connects to `/api/events` only (NOT `/api/v1/runs/stream`).
- **Inbound:** mounted once by the app shell. Editors: changing the endpoint or the dispatch
  switch breaks every realtime store update.

**Invariants.**
- **Dedup keys on real numeric id only.** `eventId = typeof payload.id === 'number' ?
  payload.id : Number(event.lastEventId || 0)` and dedup runs only when `eventId` is a safe
  positive int (`:64-72`). Id-less volatile events bypass the Set entirely (P2-5 fix).
- **Gap protection is the server's job.** This hook NEVER reads `event.lastEventId` for gap
  detection; its only gap protection is the 500-entry LRU Set, wiped on reload. Replay
  correctness on reload depends 100% on the server honoring the browser's sticky `Last-Event-ID`.
  Do not add client-side cursor persistence here without coordinating with the resync-sentinel
  contract in `/api/events`.
- **Every store reducer is id-idempotent.** `addTask`/`addAgent`/`addChatMessage`/etc. dedupe by
  stable DB id. A replayed event whose effect is already applied is a no-op — this is what makes
  the 1s-poll + live-emit race safe (no double-render).

**Harmony rules.**
- **Engine:** Engine A (client). Not an Engine-B concern.
- **`onerror` just logs.** It relies entirely on the browser's native EventSource reconnect
  (`:79-83`). Do not add manual reconnect/backoff — it would fight the browser and the jittered
  `retry:` frame.

---

## 2. Status-action registry

### `src/lib/status-actions.ts` — the `/api/status` dispatcher table

**Purpose.** The deep module behind `GET /api/status`. Replaces a former ~800-line god-handler
with one small interface: a registry (`STATUS_ACTIONS`) mapping `?action=` names to adapters,
each declaring `requiresAuth` and a `run(ctx)`. The route is a thin HTTP adapter (parse action →
enforce auth per declaration → dispatch → uniform errors). **Adding a dashboard surface is a new
table entry, not an edit to a switch** — the documented enabling seam for folding further
surfaces into the one dashboard.

**Public surface.**
- `STATUS_ACTIONS: Record<string, StatusAction>` — the registry (`:824-831`). Six entries:
  `overview`, `dashboard`, `gateway`, `models`, `health` (anonymous), `capabilities`.
- `getStatusAction(action): StatusAction | undefined` — dispatcher lookup (`:834-836`).
- `interface StatusAction` — `{ requiresAuth, run(ctx) }` (`:49-54`).
- `interface StatusActionContext` — `{ workspaceId, request }` (`:42-47`).
- `getMemorySnapshot()` — re-exported cross-platform memory probe (`:154`); used by the
  system-monitor panel, surplus to legacy callers.

**Dependencies.**
- **Outbound (Engine A siblings):** `@/lib/{command,config,db,sessions,models,logger,
  provider-subscriptions,version,hermes-sessions,gateway-runtime,connectivity-health}`.
- **Outbound (Engine B — sanctioned read seams):**
  `@/opzava/modules/content` (`resolveResendCampaignConnection`,
  `resolveWordpressDraftConnection`) and `@/opzava/platform/providers/env-secret-resolver`
  (`:17-18`) — used ONLY by `checkProviderReadiness` for configured-but-not-probed provider
  readiness. These are read-only resolutions of admin config; they never execute a provider call.
- **Inbound:** `GET /api/status` (and `/api/status/:action`).

**Invariants.**
- **`health` is the only anonymous action** (`requiresAuth: false`, `:829`); it runs before auth.
  Every other action requires an authenticated viewer. Do not add an anonymous action casually —
  it is polled frequently and must never make billable external calls.
- **Provider readiness is NOT a live probe.** `checkProviderReadiness` (`:510-527`) deliberately
  resolves config + secret only; live reachability stays at `POST /api/connections/test`. The
  comment at `:507-509` is load-bearing — do not turn this into a network probe.
- **`getDashboardData` aggregates `overview` + `db` in parallel** (`:60-67`). Each sub-handler
  fails soft (returns null on error, `getDbStats:265-268`). A failure in one stat must not tank
  the whole dashboard.

**Harmony rules.**
- **Engine:** Engine A. The two Engine-B imports are sanctioned read-seams (config resolution),
  consistent with the `audit`/`costs` read-seam pattern in `dependency-graph.md`. They do not
  cross the write boundary.
- **The registry is the seam.** New dashboard surfaces (Engine-B workflow status, realtime-chat
  metrics) go in as a new `STATUS_ACTIONS` entry — not as a new route, not as a new god-branch.

**Editor guardrails.** None specific to the realtime traps; this module is out of the
chat-production-review scope.

---

## 3. SSE routes

### `src/app/api/events/route.ts` — primary multiplexed SSE stream

**Purpose.** `GET /api/events`. The single multiplexed SSE stream every browser opens. On
connect: emit jittered `retry:` + `connected` ack, replay `realtime_events` rows
`id > Last-Event-ID` for the viewer's workspace, then tail live via the bus + a 1s outbox poll
(the cross-process bridge). Applies a chat-DM ACL on top of the workspace filter.

**Public surface.** `GET` handler only (`:23`). `export const dynamic = 'force-dynamic'`,
`runtime = 'nodejs'` (`:15-16`).

**Dependencies.**
- **Outbound:** `@/lib/event-bus` (`eventBus`, `ServerEvent`), `@/lib/auth` (`requireRole`),
  `@/lib/realtime-events` (framing + replay + constants).
- **Inbound:** `useServerEvents` hook (the sole browser consumer).

**Invariants.**
- **Workspace filter is the trust boundary.** `sendEvent` drops any event whose resolved
  workspace ≠ the viewer's (`:83`). For a single trusted workspace this is the enforced ACL.
- **Chat-DM ACL.** For `chat.*` events carrying `from_agent`/`to_agent`, delivery is restricted
  to the two participants or an operator/admin (`:87-94`). This closes the DM-leak gap (P2-1
  minimal predicate). Apply the same predicate if you add any other chat delivery path.
- **Resync sentinel.** If the client's cursor predates `MIN(id)` for the workspace
  (`requestedLastEventId > 0 && lastSentId < minId`), emit ONE id-less `resync.required` control
  frame and jump the cursor to `minId - 1` (`:115-122`) — never partial-replay across a known
  retention gap. The sentinel fires at most once per connection (`resyncSentinelEmitted`,
  `:52,118`).
- **`lastSentId` advances on strict-greater only** (`:97,102`). Filtered-out events during replay
  advance the cursor (`advanceFilteredReplay`, `:99`) so the next live event isn't re-replayed;
  live filtered events do NOT advance it.
- **One listener, one poll, one heartbeat per connection** (`:140,144,147-149`). All three are
  torn down in `stop()` (`:54-60`), which is wired to both `cancel()` and `request.signal.abort`
  (`:154-169`). Do not add an interval without registering its cleanup in `stop`.

**Harmony rules.**
- **Engine:** Engine A route. Calls only `src/lib` — no Engine-B import.
- **Duplicated logic with `/api/v1/runs/stream`.** ~100 lines of `safeEnqueue`/`sendEvent`/
  `replay`/`stop` are copied. Tracked debt (I20); do not extract without a deliberate decision —
  the filters differ (this route honors `?types=` AND the chat ACL; the run route ignores
  `?types=` and hardcodes `RUN_EVENT_TYPES`).

**Editor guardrails.** Jittered retry (RESOLVED), resync sentinel (RESOLVED), chat-DM ACL
(RESOLVED) — all live in this file. See `92-stale-findings.md`.

---

### `src/app/api/v1/runs/stream/route.ts` — run-protocol SSE stream

**Purpose.** `GET /api/v1/runs/stream`. SSE stream of Agent-Run-Protocol events only
(`run.created/updated/completed/eval_attached`). Same spine as `/api/events`, narrower filter.

**Public surface.** `GET` handler only (`:28`). `dynamic = 'force-dynamic'`, `runtime = 'nodejs'`
(`:14-15`). Emits `X-Agent-Run-Protocol: 0.1.0` (`:144`).

**Dependencies.** Same as `/api/events` minus nothing — same `event-bus`/`auth`/`realtime-events`
imports (`:1-12`).

**Inbound:** the run-protocol client (separate from the chat/dashboard `useServerEvents`).

**Invariants.**
- **`?types=` is IGNORED.** The route hardcodes `RUN_EVENT_TYPES` (`:18-23,76`) and never reads
  the query param. Do not assume `?types=` filters this stream.
- **No chat-DM ACL.** This stream carries only run events (no `chat.*`), so the ACL predicate is
  absent. If you ever route chat events here, port the ACL from `/api/events:87-94`.
- **`connected` ack carries an `id`-free frame** (`:100-105`) — never advances the replay cursor.

**Harmony rules.** Engine A route; `src/lib` only. Shares the duplication debt (I20) with
`/api/events`.

---

## 4. Chat write route

### `src/app/api/chat/messages/route.ts` POST — the message write path

**Purpose.** `POST /api/chat/messages`. Inserts a user message, logs activity + a unified-audit
row, optionally creates a notification, optionally forwards to the coordinator/agent gateway
(12s send + 9s wait), then broadcasts the persisted row to the SSE spine. `GET` lists messages
workspace-scoped.

**Public surface.** `GET` (`:245`) and `POST` (`:327`) handlers. Module-local helpers
(`createChatReply`, `parseGatewayJson`, `extractReplyText`, `extractToolEvents`,
`toGatewayAttachments`) are NOT exported.

**Dependencies.**
- **Outbound:** `@/lib/{db,command,sessions,event-bus,auth,logger,injection-guard,openclaw-gateway,
  coordinator-routing}`. `logAuditEvent` and `db_helpers` come from `@/lib/db` (`:2`).
- **Inbound:** the chat UI (`chat-workspace.tsx`, `agent-comms-panel.tsx`, `message-list.tsx`).

**Invariants.**
- **Sender identity is server-resolved; `body.from` is ignored.** `const from = auth.user.display_name
  || auth.user.username || 'system'` (`route.ts:354`). The comment block at `:350-353` is the
  P0-1 fix: a client-supplied `body.from` is NEVER trusted on this human-authenticated route. Do
  not reintroduce a `body.from` override for human sessions.
- **Only the human send is audited.** `logAuditEvent({ action: 'chat_message_sent', … })`
  (`route.ts:419`, comment `:413-417`) records the user-originated send in the inherited
  `audit_log` (the one audit surface `GET /api/audit` projects). System-generated replies
  (`createChatReply`) are deliberately excluded — the compliance trail records human actions, not
  agent chatter. Do not audit replies without a deliberate decision.
- **Broadcast is post-I/O, single auto-commit.** The user's own message is broadcast only at
  `:762`, AFTER the gateway send/wait (`:530-745`). The messages INSERT (`:388`), activity
  (`:403`), notification (`:430`), and the outbox row (inside `broadcast`→`recordServerEvent`) are
  FOUR independent auto-commits with no `db.transaction`. This is the CONFIRMED write-path
  atomicity gap (P1-1/P1-2) — not yet fixed.
- **`createChatReply` broadcasts status/tool replies** via `eventBus.broadcast('chat.message', …)`
  (`:108`) BEFORE the originator (`:762`). Reply-before-originator ordering is a known cosmetic
  consequence of the outbox-after-IO positioning; fixed together with P1-2.
- **Idempotency key is non-deterministic.** `const idempotencyKey = \`mc-${messageId}-${Date.now()}\``
  (`route.ts:527`) — a Retry after a lost 201 regenerates both halves → duplicate committed row +
  duplicate gateway run. No `client_message_id` exists anywhere (CONFIRMED, P1-3, not yet fixed).

**Harmony rules.**
- **Engine:** Engine A surface (inherited `messages`, `db_helpers`, `audit_log`). Joins the one
  audit surface via the inherited `audit_log` — no new table, no boundary crossing.
- **No transaction machinery yet.** `db.transaction` is idiomatic elsewhere (31× across runner,
  admin-config, scheduler) but absent from `src/app/api/chat/`. The P1-1 fix wraps the four
  durable writes in one `BEGIN IMMEDIATE` transaction and moves the outbox row inside it; do not
  build a generalized `recordServerEventInTx` abstraction to do it.

**Editor guardrails.** See `92-stale-findings.md` §"Realtime-chat traps" — coordinator spoof
(RESOLVED here), audit emission (RESOLVED here), write-path atomicity (CONFIRMED), idempotency
(CONFIRMED) are all anchored to this file.

---

## Cross-cutting: how a mutation reaches a browser

```
Engine-B service  ─┐
inherited route   ─┼─> eventBus.broadcast(type, data)
chat POST         ─┘            │
                               ├─ recordServerEvent() ──> INSERT realtime_events (outbox row, gets id)
                               └─ this.emit('server-event', event{id})
                                        │
SSE route handler (per connection)      │
  ├─ live: eventBus.on('server-event') ─┘ ──> sendEvent() ──> formatSseFrame ──> controller.enqueue
  └─ poll: setInterval(replayFromStore, 1s) ──> readServerEventsAfter(id>cursor) ──> sendEvent()
        │
        └─ resync sentinel (once): if cursor < MIN(id) ──> emit resync.required, jump cursor

browser: EventSource('/api/events').onmessage ──> useServerEvents ──> dedup by id ──> Zustand reducer
```

The 1s poll is the **cross-process bridge**: events recorded by another process sharing the DB
are delivered even if this process never saw `emit()`. Reliability lives in the outbox; the bus
is the accelerator.

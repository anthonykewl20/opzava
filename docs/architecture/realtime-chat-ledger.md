# Opzava Realtime Chat — Implementation Playbook

> **Role of this doc.** This is the IMPLEMENTATION PLAYBOOK an AI agent executes
> item-by-item to harden and deploy durable user chat on Opzava. It is the
> authoritative execution surface for the realtime-chat contract; every name
> (event, table, column, endpoint, constant, metric, health-check id, env var)
> is copied verbatim from the canonical contract. Every code claim cites a
> verified `file:line`. Every work item has a deterministic acceptance test and
> an EXACT verification command.
>
> **Brand.** Product surfaces say Opzava, never Mission Control. Icons are raw
> text/emoji only.
>
> **Scale baseline (governs every severity call).** Self-hosted, single-node
> SQLite (better-sqlite3, synchronous), WAL + `busy_timeout=5000`, internal AI
> team. Multi-instance / horizontal concerns are phase-gated to Phase 2/3.

Status: Implementation Playbook
Date: 2026-06-24

**Companion documents** (single source of truth is the architecture doc; this playbook carries the verbatim contract tables + the I-item ledger):
- Single source of truth (canonical architecture spec): `docs/architecture/realtime-chat-architecture.md`.
- Audit of record (file:line evidence + primary-source research): `docs/architecture/realtime-chat-production-review.md`.
- Ops/logging/doctor/health registry: `docs/architecture/realtime-chat-inventory.md`.
- Topology rendering: `docs/architecture/realtime-chat-topology.mmd`.
- Ratifying ARD: `docs/ard/0009-realtime-user-chat-transport-and-fanout.md`.

---

## Objective

Close every P0/P1 production-readiness gap so durable user chat is safe to ship
single-node on Opzava, and define the Phase 2/3 path to horizontal scale —
without over-engineering the single-writer SQLite path.

The durable chat spine is fixed and primary-source-validated (Slack
persist-before-fanout; Zulip after-commit dispatch; Discord RESUMED; AWS
Full-Jitter; sqlite.org WAL/BEGIN IMMEDIATE):

```
                      POST /api/chat/messages            GET /api/events  (one multiplexed SSE)
  browser ────────────────►  Opzava route handler  ──►  ┌──────────────────────────────┐
   ▲                          │                          │ realtime_events (SQLite outbox)│
   │                          │  ONE db.transaction()    │   id = global monotonic cursor │
   │                          │  BEGIN IMMEDIATE          │   workspace-scoped, 7d / 50k  │
   │                          ▼                          └──────────────────────────────┘
   │                 messages INSERT ──┐                            ▲
   │                 activity log      │  all INSIDE tx             │ 1s poll bridge (cross-process)
   │                 notification      │  (D-TX-OUTBOX)             │ + in-process eventBus fanout
   │                 outbox INSERT ────┘                            │   (ACCELERATOR only)
   │                                                               │
   └── eventBus.broadcast AFTER commit (best-effort fast path) ─────┘
```

Reliability lives in the SQLite outbox + the write transaction. The in-process
`eventBus` is a best-effort fanout **accelerator**, NOT a reliability layer.

---

## Consensus Ledger

Decisions carried forward verbatim from the contract. Status is final.

| ID | Consensus (binding) |
|---|---|
| **D-SPINE** | Durable user-chat transport = HTTP POST writes + ONE multiplexed SSE stream (`GET /api/events`) using `realtime_events.id` (global monotonic autoincrement) as the `Last-Event-ID` replay cursor. Write = `POST /api/chat/messages`; read fanout = `/api/events`. The in-process `eventBus` is a best-effort fanout ACCELERATOR; reliability lives in the SQLite outbox + write transaction. |
| **D-WS-SEPARATE** | Gateway control WebSocket (`src/lib/websocket.ts`) and PTY WebSocket (`src/lib/pty-websocket.ts`) are NOT canonical durable chat transport. WebSocket MAY be used later for ephemeral typing/presence only (Phase 2, I14); durable message recovery always comes from the DB/outbox cursor. |
| **D-NO-CONVSEQ** | DROP `conversation_seq` (I4) as over-engineering for single-writer synchronous better-sqlite3. Display ordering = `messages.created_at ASC, id ASC` tie-breaker (P3-1). The SSE replay/durability cursor is the GLOBAL `realtime_events.id` only. `conversation_seq` is reconsidered ONLY at Postgres multi-writer (Phase 3). |
| **D-TX-OUTBOX** | Message INSERT + activity log + notification + `realtime_events` outbox INSERT happen in ONE `db.transaction()` begun with `BEGIN IMMEDIATE`. `eventBus.broadcast` fires AFTER commit; the `realtime_events` row lives INSIDE the tx. `BEGIN IMMEDIATE` is load-bearing: better-sqlite3 `db.transaction` defaults to DEFERRED and `busy_timeout` is not reliably honored on DEFERRED→write upgrade. |
| **D-IDEMPOTENCY** | `client_message_id` (client UUID per logical send) + partial UNIQUE INDEX `(workspace_id, conversation_id, from_agent, client_message_id) WHERE client_message_id IS NOT NULL`. POST does `INSERT ... ON CONFLICT(...) DO NOTHING RETURNING id`; if RETURNING yields nothing, SELECT the existing id so retry returns byte-identical `message_id` 42. Gateway idempotency key derived from `client_message_id`, NOT `messageId+Date.now()`. |
| **D-COORDINATOR-FROM** | Stop honoring `body.from` for human sessions (P0-1). `from` is ALWAYS resolved server-side: `auth.user.display_name || auth.user.username || 'system'`. The coordinator override is allowed ONLY when authenticated with the coordinator agent's scoped API key (`auth.user.agent_name === COORDINATOR_AGENT` via `agent_api_keys`). |
| **D-MEMBERSHIP-PREDICATE** | `workspace_id` remains the trust boundary for Phase 1. Minimal chat privacy = a from/to predicate at the `sendEvent` boundary: for `chat.*` events drop unless viewer identity matches `message.from_agent` or `message.to_agent`, OR viewer role is operator/admin. Same predicate applied in replay. Full `chat_participants` tier is Phase 2. |
| **D-RESYNC-SENTINEL** | At SSE connect, fetch `min(id)` for the workspace; if `parseLastEventId > 0 AND lastSentId < min(id)`, emit control event `{type:'resync.required', data:{reason:'retention-gap'}}` and set `lastSentId = min(id)-1` — NO partial replay across a known gap. Client forces a full REST re-fetch of affected collections. |
| **D-REPLAY-COMPLETE** | After Last-Event-ID replay finishes and live tailing begins, emit a synthetic `replay.complete` control event (Discord RESUMED equivalent) so the client can distinguish "still catching up" from "now live". |
| **D-EPHEMERAL** | Typing/presence events are EPHEMERAL-ONLY: never persisted to `realtime_events`, never retried, never replayed, and MUST NOT advance or break the durable SSE cursor. Enforced by an event-type guard in `event-bus.ts` that routes ephemeral types to a volatile broadcast that skips the DB row. |
| **D-JITTER-RETRY** | Replace fixed `SSE_RETRY_MS=5000` with per-connection jittered retry frame: `retry = base + random(0, jitter)`. AWS Full-Jitter. Zero new client code; keeps native EventSource reconnect semantics. |
| **D-GRACEFUL-DRAIN** | On SIGTERM, retain the HTTP server reference (existing `patchCreateServer` wrapper) and call `server.close()` + a bounded `setTimeout(~2s)` before `disposePtysOnly()`. NO draining-flag / `resync.broadcast` / grace-period-coordination subsystem — durable replay is the complete safety net. |
| **D-DRY-SSE** | Extract a shared SSE module (start/stream helpers: highWaterMark, safeEnqueue, stop, sendEvent, replay, abort, cancel, heartbeat, retry frame) from `/api/events` and `/api/v1/runs/stream` (~100 duplicated lines). `/api/v1/runs/stream` MUST honor `?types=` instead of ignoring it. |
| **D-SMOKE-TEMPORAL** | Make `dokploy-parity-test.sh` temporal: open SSE connection, POST a workspace-scoped event from a second authenticated curl, assert the matching data frame arrives on the same open connection within ~3s. Do NOT add Traefik `responseForwarding.flushInterval` labels (Traefik v3 auto-detects `text/event-stream`; labels would be dead config). |
| **D-VOLATILE-DEDUP-FIX** | (1) In `event-bus.ts` reset `recordingFailureLogged=false` after a successful `recordServerEvent` (or rate-limit the warn to 1/60s). (2) In `use-server-events.ts` onmessage, only dedupe when `payload.id` is a real number — id-less volatile events bypass the Set entirely. |
| **D-BROADCAST-REORDER** | Broadcast the originating user message BEFORE generating coordinator replies (fixes reply-before-original ordering). Move the `chat.message` outbox insert INTO the message-insert transaction (P1-2) so it commits before any gateway I/O. |
| **D-PROXY-MATRIX** | Document an SSE-safe proxy config matrix per deployment target: nginx `proxy_read_timeout 3600s` + `proxy_buffering off` + `proxy_ignore_headers X-Accel-Buffering`; Traefik buffering middleware OFF (auto-detects SSE); Cloudflare heartbeat <100s caveat + 524 after ~100-120s. HTTP/2 preferred at the reverse proxy (SSE/HTTP/1.1 ~6-conn/browser cap). |
| **D-OBSERVABILITY** | Phase 1: lightweight in-process counter module (no metrics backend). Gauge `activeSseConnections`, rolling p95 of `(now - event.timestamp)` at sendEvent delivery, `realtime_events` row count. Expose via `GET /api/ops/chat-metrics` (admin) + 60s log line. Broker-lag/load-tests are Phase 3 (dropped from P1). |
| **D-CHAT-DOCTOR** | Add a chat doctor following the `OpenClawDoctorStatus` shape at `GET /api/ops/chat-doctor` (admin role): single-flight + TTL cache like `/api/openclaw/doctor`. Checks write-path atomicity, idempotency constraint presence, SSE replay/resync wiring, ephemeral-guard, drain handler. |
| **D-BROKER** | Phase 2/3 = broker adapter (Redis Streams + `realtime_event_consumers(consumer_id, partition_key, last_processed_event_number)` consumer-offset table), full `chat_participants` membership tier, presence/typing ephemeral channel, NATS JetStream, Postgres migration. None of these block single-node production user chat. |

---

## Current-Code Parity Ledger

Each surface is grounded in the audited `file:line`. "Decision" restates the
binding verdict; "Follow-up" is the implementation item that closes the gap.

| Surface | Current behavior (verified) | Decision | Follow-up (item) |
|---|---|---|---|
| `src/app/api/chat/messages/route.ts:327-735` POST | 4 independent auto-commits: INSERT messages `:374`, `logActivity` `:389`, `createNotification` `:401`, `eventBus.broadcast` (outbox row via `recordServerEvent`) `:733`. Outbox row written AFTER up to ~21s of gateway I/O (`:510,:537,:617`). Grep confirms ZERO `db.transaction` in `src/app/api/chat/`. | Wrap all durable writes in ONE `BEGIN IMMEDIATE` tx; broadcast AFTER commit; broadcast originator BEFORE coordinator replies. | I6, I-broadcast-reorder |
| `src/app/api/chat/messages/route.ts:336-340` | `requestedFrom = body.from`; `isCoordinatorOverride = requestedFrom.toLowerCase() === COORDINATOR_AGENT.toLowerCase()` — pure string match from any operator session. Comment `:325` "Sender identity is always resolved server-side" is FALSE for the coordinator case. | Stop honoring `body.from` for human sessions; coordinator override only via agent-scoped key (`auth.user.agent_name === COORDINATOR_AGENT`). | I13 |
| `src/app/api/chat/messages/route.ts:369-382,498` | No `client_message_id` anywhere (grep-confirmed zero hits). Gateway key `idempotencyKey = mc-${messageId}-${Date.now()}` at `:498` is non-deterministic (new messageId + new Date.now on retry). | Add `client_message_id` + partial UNIQUE index; `INSERT ... ON CONFLICT DO NOTHING RETURNING id`; derive gateway key from `client_message_id`. | I2 |
| `src/app/api/chat/messages/route.ts:284` GET | `ORDER BY created_at ASC` with NO `, id ASC` tie-breaker. (`messages.created_at` is `DEFAULT (unixepoch())` — second granularity; `src/lib/migrations.ts:73`.) | Add `, id ASC` tie-breaker. DROP `conversation_seq` (D-NO-CONVSEQ). | I4-DROPPED (ordering portion) |
| `src/lib/realtime-events.ts:4,173-175` | `SSE_RETRY_MS = 5_000` sent as fixed `retry:` frame on every connect — the dominant reconnect-storm amplifier (all clients share one clock). | Replace with jittered `retry = SSE_RETRY_BASE_MS(3000) + random(0, SSE_RETRY_JITTER_MS(4000))` per connection. | I9-jitter |
| `src/lib/realtime-events.ts:164-171` | `formatSseFrame` emits only `id:` + `data:`, NEVER `event:`. Clients CANNOT use `es.addEventListener('chat.message', ...)`; every event arrives via `onmessage`. | Preserve as a binding client-contract constraint. | (constraint, referenced by I20) |
| `src/lib/realtime-events.ts:48-56` | `workspaceIdFromData` table-lookup map has NO `chat.*` branch. Chat delivery works only because both broadcasters spread the full `messages` row (carries `workspace_id`). | Latent gap; addressed by D-BROADCAST-REORDER keeping the full row on the outbox payload. | (defensive, I-broadcast-reorder) |
| `src/lib/realtime-events.ts:96,110-130` | `pruneRealtimeEvents` runs synchronously on the broadcast hot path BEFORE the INSERT; age-DELETE + `COUNT(*)` + `OFFSET` row-cap trim, non-atomic. Globally throttled once/60s. | Move to a boot-started 60s `setInterval` (mirrors `github-sync-poller`/`scheduler`). Keep throttle as guard. Do NOT wrap trim in a tx. | (P3-4; opportunistic, not P1-blocking) |
| `src/lib/realtime-events.ts:132-156` | `readServerEventsAfter` = `WHERE id>N AND workspace_id=? ORDER BY id ASC LIMIT 200` — no overflow/gap check, no comparison against `min(id)`. Grep: NO `resync|gap_expired|overflow|sentinel|min(id)` in `src/`. | Emit `resync.required` when `lastSentId < min(id)`; emit `replay.complete` after replay. | I-resync |
| `src/lib/event-bus.ts:47,65,71-77` | `recordingFailureLogged` latching flag, NEVER reset — one transient `recordServerEvent` throw mutes the durability warning for process life. | Reset `recordingFailureLogged=false` after success (or rate-limit warn to 1/60s). | I16 |
| `src/app/api/events/route.ts:42-132` | Viewer-auth, workspace-scoped, replay, type filters, heartbeat, slow-client close at `SSE_STREAM_HIGH_WATER_MARK=256` (`:16`). Poll bridge `setInterval(replayFromStore, SSE_POLL_MS)` `:116`. Headers `:144-149`. | Reuse and harden: add resync/replay-complete + from/to predicate + jittered retry. | I-resync, I3-predicate, I9-jitter, I20 |
| `src/app/api/events/route.ts:78` | `sendEvent` filter is workspace-only: `if (serverEventWorkspaceId(event) !== userWorkspaceId) return`. No per-conversation membership. | Add minimal from/to predicate for `chat.*` (drop unless viewer matches `from_agent`/`to_agent` OR role operator/admin); same in replay. | I3-predicate |
| `src/app/api/v1/runs/stream/route.ts:18-23,74-87` | `?types=` IGNORED — hardcoded `RUN_EVENT_TYPES`. Shares ZERO code with `/api/events` despite ~100 duplicated lines (`highWaterMark`/`safeEnqueue`/`stop`/`sendEvent`/`replay`/`abort`/`cancel`). | Extract shared SSE module; honor `?types=` in both routes. | I20 |
| `src/lib/use-server-events.ts:64-66,79-83` | onmessage dedups on `event.lastEventId` fallback (`Number(event.lastEventId||0)`) when `payload.id` is absent — volatile events mis-dedupe against the prior event's sticky id. `onerror` only logs; relies on native EventSource reconnect. | Only dedupe when `payload.id` is a real number; id-less volatile events bypass the Set. | I16 |
| `src/store/index.ts:1120` | `addChatMessage` dedups on `message.id > 0 && ...` only; no `client_message_id` reconciliation. | Upsert-by-`client_message_id` so optimistic temp bubble reconciles to the real row (no double-render). | I2 |
| `src/components/chat/message-list.tsx:98-125` | Retry re-POSTs identical content with no idempotency key. | Generate one UUID per logical send, replay on Retry. | I2 |
| `scripts/mc-server.cjs:31-49` | `patchCreateServer` wraps `http`/`https`.createServer; SIGTERM handler `:47-49` calls only `disposeAllPtySessions()` — HTTP server is NEVER `.close()`'d; every SSE viewer hard-drops on redeploy. | Retain server ref; on SIGTERM `server.close()` + bounded `DRAIN_GRACE_MS=2000` then `disposePtysOnly()`. | I10-minimal |
| `scripts/dokploy-parity-test.sh:89-111` | Static-content assertion: greps `retry: 5000` + `"type":"connected"` (both emitted at stream open `events/route.ts:102-103`). A proxy buffering AFTER the initial flush passes green. | Make temporal: open SSE, POST from a second curl, assert matching frame on the SAME open conn within ~3s. | I11 |
| `docker-compose.dokploy.yml:13-33` | No SSE buffering/timeout config; Traefik auto-detects `text/event-stream`. | Document nginx/CF/Traefik proxy matrix; verify no buffering middleware; no `flushInterval` labels. | I18 |
| `src/lib/db.ts:46-52` | WAL + `synchronous=NORMAL` + `cache_size=1000` (~4MB) + `busy_timeout=5000` set correctly. Omits `temp_store=MEMORY`; leaves `wal_autocheckpoint` unset; carries dead index `idx_realtime_events_id` (`migrations.ts:1473`). | Add `cache_size=-65536`, `temp_store=MEMORY` (keep `wal_autocheckpoint` default 1000); drop `idx_realtime_events_id`. | (P3-9; migration 054b) |
| `src/lib/openclaw-doctor.ts:6-14`; `src/app/api/openclaw/doctor/route.ts:28-66` | `OpenClawDoctorStatus { level, category, healthy, summary, issues, canFix, raw }`; single-flight + TTL cache module. | Mirror this shape + cache pattern for `GET /api/ops/chat-doctor`. | I-doctor |
| `src/app/api/status/route.ts:511-659` | `performHealthCheck()` pushes `HealthCheckEntry[]` via `health.checks.push(...)` (`:597,:598`). `HealthCheckEntry` shape in `src/lib/connectivity-health.ts:18-24`. | Push a `name:'Realtime Chat'` entry (pure evaluator, reads in-process metrics). | I-health |
| `src/lib/websocket.ts` (gateway control) | Application-level RPC `{type:'req',method:'ping'}`, NOT a protocol ping; degrades to passive mode when gateway replies `unknown method: ping`. | NOT canonical chat transport (D-WS-SEPARATE). Out of chat scope. | (D-WS-SEPARATE) |
| `src/lib/pty-websocket.ts` (PTY) | Auth + heartbeat + backpressure; `ptyPool` is in-process `Map`, no affinity header. | NOT canonical chat transport; sticky/local affinity remains required for PTY. | (D-WS-SEPARATE) |

---

## Decision Ledger

Final D-item status, copied from the contract. All Phase-1 decisions are
**Accepted**.

| ID | Phase | Status |
|---|---|---|
| D-SPINE | Phase-1 | Accepted |
| D-WS-SEPARATE | Phase-1 | Accepted |
| D-NO-CONVSEQ | Phase-1 | Accepted |
| D-TX-OUTBOX | Phase-1 | Accepted |
| D-IDEMPOTENCY | Phase-1 | Accepted |
| D-COORDINATOR-FROM | Phase-1 | Accepted |
| D-MEMBERSHIP-PREDICATE | Phase-1 | Accepted |
| D-RESYNC-SENTINEL | Phase-1 | Accepted |
| D-REPLAY-COMPLETE | Phase-1 | Accepted |
| D-EPHEMERAL | Phase-1 | Accepted |
| D-JITTER-RETRY | Phase-1 | Accepted |
| D-GRACEFUL-DRAIN | Phase-1 | Accepted |
| D-DRY-SSE | Phase-1 | Accepted |
| D-SMOKE-TEMPORAL | Phase-1 | Accepted |
| D-VOLATILE-DEDUP-FIX | Phase-1 | Accepted |
| D-BROADCAST-REORDER | Phase-1 | Accepted |
| D-PROXY-MATRIX | Phase-1 | Accepted |
| D-OBSERVABILITY | Phase-1 | Accepted |
| D-CHAT-DOCTOR | Phase-1 | Accepted |
| D-BROKER | Phase-2 | Deferred |

---

## IMPLEMENTATION LEDGER

> **How an agent executes this.** Each item is self-contained: read the target
> files, apply the change, then run the EXACT verification command. Acceptance
> criteria are deterministic (a test passes OR a grep asserts presence/absence).
> Respect `dependsOn` ordering. Phase-1 items MUST all be green before flipping
> chat on for real users.

### Phase 1 — production-readiness (before user chat)

Item dependency graph (topological order, bottom-up):

```
I6 (tx) ──► I2 (idempotency)          I20 (DRY SSE) ──► I-resync (sentinel)
   │           │                            │      └──► I9-jitter (retry)
   │           └──► I-doctor                 └──► I3-predicate (membership)
   └──► I-broadcast-reorder                              │
                                                          └──► (replay path)
 I13 (from-guard)   I16 (dedup)   I10 (drain)   I11 (smoke)   I18 (proxy)
    (independent)      (independent)  (independent)  (independent)  (independent)
 I12-phase1 (metrics) ──► I-health
```

---

#### I6 — Transactional outbox: message+activity+notification+outbox in ONE BEGIN IMMEDIATE tx (P1-1)

- **What.** Wrap the durable writes in `POST /api/chat/messages` in a single
  `db.transaction(() => {...})` begun with `BEGIN IMMEDIATE`. The
  `realtime_events` outbox INSERT lives INSIDE the tx. `eventBus.broadcast`
  fires AFTER commit. Conforms to D-TX-OUTBOX.
- **Target files.**
  - `src/app/api/chat/messages/route.ts:369-409,733` — wrap the messages INSERT
    (`:374`), `db_helpers.logActivity` (`:389`), `db_helpers.createNotification`
    (`:401`), and the `chat.message` outbox INSERT in one
    `db.transaction(() => {...}, { begin: 'IMMEDIATE' })` (or raw
    `BEGIN IMMEDIATE`). Position the post-commit `eventBus.broadcast` AFTER the
    tx returns.
  - `src/lib/realtime-events.ts:94-108` — `recordServerEvent` MUST be usable
    inside a caller tx (the INSERT runs on the same connection tx). Drop the
    internal `pruneRealtimeEvents()` call from the recording path (P3-4 moves
    prune to a boot timer) so it does not run inside the write tx.
  - `src/lib/event-bus.ts:64-80` — `broadcast` calls `recordServerEvent` then
    `this.emit('server-event', event)`; the emit stays AFTER commit (caller
    invokes broadcast post-tx).
- **Deterministic acceptance criteria.** Failure injected between the writes
  leaves NO orphan message (no outbox row) AND NO orphan outbox row (no
  message). `BEGIN IMMEDIATE` acquires the reserved lock at BEGIN so
  `busy_timeout=5000` (`src/lib/db.ts:52`) is honored against a concurrent
  MCP/CLI/cron writer. `broadcast` fires only after commit.
- **EXACT verification command.**
  ```bash
  grep -Rn 'BEGIN IMMEDIATE\|db.transaction' src/app/api/chat/   # expect >=1 wrapping the durable writes
  node --test test/chat-tx-atomicity.test.mjs                     # inject throw between writes, assert all-or-nothing
  pnpm typecheck
  ```
- **Phase.** Phase-1.
- **Depends on.** (none) — execute FIRST.

---

#### I-broadcast-reorder — Outbox inside tx + broadcast originator before coordinator replies (P1-2)

- **What.** Move the `chat.message` outbox INSERT INTO the message-insert
  transaction (folds into I6) so it commits before any gateway I/O. Emit the
  originator broadcast BEFORE `createChatReply` generates coordinator status
  replies. Conforms to D-BROADCAST-REORDER.
- **Target files.**
  - `src/app/api/chat/messages/route.ts:374` (outbox insert INTO the tx),
    `:108` / `:733` (emit originator broadcast BEFORE `createChatReply` at
    `:79-112`, `:482,:564,:588,:625,:650,:661,:674,:685,:706`).
- **Deterministic acceptance criteria.** Coworker B's SSE sees A's question
  BEFORE the "Received. I am coordinating..." status frame. A SIGKILL between
  commit and gateway I/O leaves the row + outbox row durable, recoverable via
  the 1s poll + Last-Event-ID replay. No ~21s window where the message is
  committed-but-SSE-invisible.
- **EXACT verification command.**
  ```bash
  node --test test/chat-broadcast-order.test.mjs   # assert originator frame seq < coordinator status frame seq on the SAME SSE connection
  pnpm test:e2e -- --grep 'coordinator reply order'
  ```
- **Phase.** Phase-1.
- **Depends on.** I6.

---

#### I2 — client_message_id write idempotency (P1-3)

- **What.** Add `client_message_id` + partial UNIQUE index; POST does
  `INSERT ... ON CONFLICT(...) DO NOTHING RETURNING id` and SELECTs the existing
  id on empty RETURNING. Derive the gateway key from `client_message_id`.
  Conforms to D-IDEMPOTENCY.
- **Target files.**
  - `src/lib/migrations.ts` — add migration `054_chat_idempotency`:
    `ALTER TABLE messages ADD COLUMN client_message_id TEXT;` +
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_message_id ON messages(workspace_id, conversation_id, from_agent, client_message_id) WHERE client_message_id IS NOT NULL;`
  - `src/app/api/chat/messages/route.ts:369-382,498` — accept
    `client_message_id` (UUID, required) from body; `ON CONFLICT(...) DO
    NOTHING RETURNING id`; SELECT existing id when RETURNING empty; change
    `idempotencyKey = mc-${messageId}-${Date.now()}` (`:498`) to derive from
    `client_message_id`.
  - `src/store/index.ts:1120` — `addChatMessage` upsert-by-`client_message_id`.
  - `src/components/chat/message-list.tsx:98-125` — generate one UUID per
    logical send, replay the SAME UUID on Retry.
- **Deterministic acceptance criteria.** Duplicate POST with the same
  `client_message_id` returns byte-identical `message_id` (not a new
  autoincrement). Retry after a lost-201 does NOT insert a second row and does
  NOT trigger a second gateway run. Store reconciles the optimistic temp bubble
  to the real row by `client_message_id` (no double-render).
- **EXACT verification command.**
  ```bash
  node --test test/chat-idempotency.test.mjs                              # POST twice, assert same id + single messages row
  pnpm test:e2e -- --grep 'chat retry'
  grep -Rn 'mc-\${messageId}-\${Date.now()}' src/                          # expect ZERO hits in the chat path
  ```
- **Phase.** Phase-1.
- **Depends on.** I6.

---

#### I13 — Stop honoring body.from; coordinator override via agent-scoped key only (P0-1)

- **What.** Remove the `isCoordinatorOverride` string-match for human sessions.
  `from` is ALWAYS `auth.user.display_name || auth.user.username || 'system'`.
  The coordinator override is honored ONLY when
  `auth.user.agent_name === COORDINATOR_AGENT` (agent-scoped API key via
  `agent_api_keys`). Conforms to D-COORDINATOR-FROM.
- **Target files.**
  - `src/app/api/chat/messages/route.ts:336-340` — replace
    `isCoordinatorOverride` with a guard that checks
    `auth.user.agent_name === COORDINATOR_AGENT`.
  - `src/lib/auth.ts:632-644` — ensure agent-scoped key resolution populates
    `auth.user.agent_name` from `agent_api_keys`.
- **Deterministic acceptance criteria.** An operator POSTing
  `{from:'coordinator', to:<victim>}` is treated as their OWN identity, NOT
  coordinator. Only the coordinator runtime authenticated with its scoped API
  key can author coordinator messages. The comment at `:325` becomes true.
- **EXACT verification command.**
  ```bash
  node --test test/chat-coordinator-spoof.test.mjs   # operator token POST with from:coordinator asserts from==operator display_name
  # then: curl with the coordinator agent_api_key asserts from==coordinator
  ```
- **Phase.** Phase-1.
- **Depends on.** (none) — independent.

---

#### I-resync — resync.required sentinel + replay.complete marker (P1-4)

- **What.** At SSE connect, fetch `min(id)` for the workspace; if
  `parseLastEventId > 0 AND lastSentId < minId`, emit
  `{type:'resync.required', data:{reason:'retention-gap'}}` (NO id) and set
  `lastSentId = minId-1`. After `replayFromStore` finishes, emit
  `{type:'replay.complete'}` (NO id). Conforms to D-RESYNC-SENTINEL +
  D-REPLAY-COMPLETE.
- **Target files.**
  - `src/lib/sse-stream.ts` (from I20) — add `minId` query +
    `resync.required` / `replay.complete` emitters. (Both emit NO id so they
    never advance the cursor.)
  - `src/app/api/events/route.ts:92-104` — wire into the shared module's
    start sequence.
  - `src/lib/use-server-events.ts:86-187` `dispatch` — handle
    `resync.required` (force full REST re-fetch of affected collections) and
    `replay.complete` (mark live).
- **Deterministic acceptance criteria.** A reconnect whose Last-Event-ID
  predates retention emits `resync.required` and does NOT partial-replay across
  the gap. After any successful replay the client receives `replay.complete`.
  Ephemeral/control frames never advance the cursor.
- **EXACT verification command.**
  ```bash
  node --test test/sse-resync.test.mjs            # seed events, delete old rows, reconnect with stale Last-Event-ID, assert resync.required frame
  node --test test/sse-replay-complete.test.mjs
  ```
- **Phase.** Phase-1.
- **Depends on.** I20.

---

#### I3-predicate — Minimal from/to chat membership predicate at sendEvent + replay (P2-1, Phase-1 slice)

- **What.** At the `sendEvent` boundary, for `chat.*` events, drop unless
  viewer identity matches `data.from_agent` OR `data.to_agent`, OR viewer role
  is operator/admin. Apply the same predicate in the `replayFromStore` path.
  Conforms to D-MEMBERSHIP-PREDICATE. ZERO schema change (`from_agent`/
  `to_agent` already on the row).
- **Target files.**
  - `src/lib/sse-stream.ts` (from I20) `sendEvent` — predicate for `chat.*`
    types, threading viewer identity + role into the stream context.
  - `src/app/api/events/route.ts:77-90` — pass `auth.user` identity/role into
    the shared module; replay path applies the same predicate.
- **Deterministic acceptance criteria.** Two operators in the same workspace
  but different DM threads do NOT receive each other's `chat.*` events (live OR
  replay). operator/admin role retains full workspace visibility.
- **EXACT verification command.**
  ```bash
  node --test test/sse-chat-membership.test.mjs   # two viewers, assert cross-thread delivery blocked
  pnpm test:e2e -- --grep 'chat privacy'
  ```
- **Phase.** Phase-1.
- **Depends on.** I20.

---

#### I16 — recordingFailureLogged reset + volatile-event client dedup fix (P2-5)

- **What.** (1) In `event-bus.ts`, reset `recordingFailureLogged=false` after a
  successful `recordServerEvent` (or rate-limit the warn to 1/60s). (2) In
  `use-server-events.ts`, only dedupe when `payload.id` is a real number;
  id-less volatile events bypass the Set entirely. Conforms to
  D-VOLATILE-DEDUP-FIX.
- **Target files.**
  - `src/lib/event-bus.ts:47,73` — reset flag on success path.
  - `src/lib/use-server-events.ts:64-66` — guard dedup on
    `typeof payload.id === 'number'`.
- **Deterministic acceptance criteria.** A transient `recordServerEvent`
  failure no longer mutes the durability warning for process life. Id-less
  volatile events are delivered to the client, not mis-deduped against the
  prior event's sticky `lastEventId`.
- **EXACT verification command.**
  ```bash
  node --test test/event-bus-recording-failure.test.mjs   # throw once, succeed, assert warn can re-fire
  node --test test/use-server-events-volatile.test.mjs     # volatile event with no id is dispatched
  ```
- **Phase.** Phase-1.
- **Depends on.** (none) — independent.

---

#### I9-jitter — Jittered per-connection retry frame (P2-3)

- **What.** Replace `formatSseRetryFrame()` with
  `formatSseRetryFrame(base=SSE_RETRY_BASE_MS=3000, jitter=SSE_RETRY_JITTER_MS=4000)`
  => `retry: ${base + Math.floor(Math.random()*jitter)}`. Re-emit the jittered
  frame on each (re)connect. Conforms to D-JITTER-RETRY. AWS Full-Jitter.
- **Target files.**
  - `src/lib/realtime-events.ts:4,173-175` — export `SSE_RETRY_BASE_MS=3000`
    and `SSE_RETRY_JITTER_MS=4000`; rewrite `formatSseRetryFrame`.
    `SSE_RETRY_MS=5000` retained as the documented base default.
  - `src/app/api/events/route.ts:102` + `src/app/api/v1/runs/stream/route.ts:99`
    — emit the jittered frame via the shared module (I20).
- **Deterministic acceptance criteria.** Each connection picks an independent
  retry in `[3000,7000)`ms. Zero new client code; native EventSource semantics
  preserved.
- **EXACT verification command.**
  ```bash
  node --test test/sse-retry-jitter.test.mjs                          # sample N frames, assert distribution across the window
  grep -Rn 'SSE_RETRY_MS\b' src/lib/realtime-events.ts                # expect base+jitter form, not the fixed literal in the frame
  ```
- **Phase.** Phase-1.
- **Depends on.** I20.

---

#### I10-minimal — Minimal graceful drain: server.close() + bounded 2s wait (P2-4)

- **What.** Retain the HTTP server reference from `patchCreateServer`; on
  SIGTERM call `server.close()` + `setTimeout(DRAIN_GRACE_MS=2000)` then
  `disposePtysOnly()`. NO draining-flag / `resync.broadcast` /
  grace-period-coordination subsystem. Conforms to D-GRACEFUL-DRAIN.
- **Target files.**
  - `scripts/mc-server.cjs:31-49` — capture the server ref returned by the
    patched `createServer`; add a SIGTERM handler that calls `server.close()`
    then `setTimeout(disposePtysOnly, DRAIN_GRACE_MS)`.
- **Deterministic acceptance criteria.** SIGTERM no longer hard-kills SSE
  mid-stream; in-flight requests get a ~2s grace window. Durable replay
  recovers any gap on reconnect.
- **EXACT verification command.**
  ```bash
  bash scripts/dokploy-parity-test.sh   # or manual: docker compose up -d --build; assert SSE viewers reconnect within ~5s without data loss
  grep -n 'server.close()' scripts/mc-server.cjs   # expect present in the SIGTERM handler
  ```
- **Phase.** Phase-1.
- **Depends on.** (none) — independent.

---

#### I11 — Temporal SSE smoke test (P1-5)

- **What.** Make `dokploy-parity-test.sh` temporal: open the SSE connection,
  POST a workspace-scoped event from a second authenticated curl, assert the
  matching data frame arrives on the SAME open connection within ~3s; fail if
  not. Do NOT add Traefik `responseForwarding.flushInterval` labels (dead
  config). Conforms to D-SMOKE-TEMPORAL. `/api/v1/runs/stream` gains smoke
  coverage.
- **Target files.**
  - `scripts/dokploy-parity-test.sh:89-111` — replace the static
    `retry: 5000` + `"type":"connected"` grep with a POST-then-assert-on-open-conn
    sequence (background a `curl -N` reader, POST from a second curl, grep the
    reader's output for the posted frame within 3s).
- **Deterministic acceptance criteria.** A proxy that buffers AFTER the
  initial flush FAILS the test. Traefik `flushInterval` labels are absent.
- **EXACT verification command.**
  ```bash
  bash scripts/dokploy-parity-test.sh                 # assert temporal liveness pass
  grep -n 'responseForwarding\|flushInterval' docker-compose.dokploy.yml scripts/*.sh   # expect ZERO hits
  ```
- **Phase.** Phase-1.
- **Depends on.** (none) — independent.

---

#### I18 — SSE-safe proxy config matrix (docs + compose)

- **What.** Document the per-target proxy matrix; verify compose files carry
  SSE-safe config or an explicit note. Conforms to D-PROXY-MATRIX.
- **Target files.**
  - `docs/architecture/realtime-chat-deployment.md` (new) — the matrix in the
    Deployment Runbook below.
  - `docker-compose.dokploy.yml:13-33` — verify NO buffering middleware;
    document nginx/CF matrix inline.
- **Deterministic acceptance criteria.** Per-target matrix documented: nginx
  `proxy_read_timeout 3600s` + `proxy_buffering off` +
  `proxy_ignore_headers X-Accel-Buffering`; Traefik buffering OFF (auto-detects
  SSE); CF heartbeat <100s + 524 caveat; HTTP/2 preferred. Compose files carry
  SSE-safe config or an explicit note.
- **EXACT verification command.**
  ```bash
  grep -RnE 'proxy_read_timeout|proxy_buffering|respondingTimeouts|responseForwarding' docker-compose*.yml docs/   # expect documented, not dead
  ```
- **Phase.** Phase-1.
- **Depends on.** (none) — independent.

---

#### I20 — DRY shared SSE module; honor ?types= in /api/v1/runs/stream

- **What.** Extract `src/lib/sse-stream.ts` (shared module: highWaterMark,
  safeEnqueue, stop, sendEvent w/ type filter, replayFromStore, abort, cancel,
  heartbeat, jittered retry frame, resync/replay.complete emitters). Both
  routes consume it; `/api/v1/runs/stream` honors `?types=`. Conforms to
  D-DRY-SSE. Closes the maintenance hazard flagged by CLAUDE.md (zero shared
  code between the two SSE routes).
- **Target files.**
  - `src/lib/sse-stream.ts` (new) — the shared helpers (~100 lines collapsed
    from `src/app/api/events/route.ts:42-132` and
    `src/app/api/v1/runs/stream/route.ts:39-121`).
  - `src/app/api/events/route.ts` + `src/app/api/v1/runs/stream/route.ts` —
    consume the module; `runs/stream` reads `?types=` instead of
    `RUN_EVENT_TYPES` (`:18-23`).
- **Deterministic acceptance criteria.** ~100 duplicated lines collapse into
  one tested module. Both routes honor `?types=`.
- **EXACT verification command.**
  ```bash
  pnpm typecheck
  node --test test/sse-stream.test.mjs
  diff <(sed -n '42,132p' src/app/api/events/route.ts) <(sed -n '40,129p' src/app/api/v1/runs/stream/route.ts)   # expect near-empty after refactor
  ```
- **Phase.** Phase-1.
- **Depends on.** (none) — foundational; I-resync, I3-predicate, I9-jitter
  build on it.

---

#### I12-phase1 — In-process realtime observability module + GET /api/ops/chat-metrics (P3-5)

- **What.** New in-process counter module: `activeSseConnections` gauge,
  rolling p95 of `(Date.now() - event.timestamp)` at sendEvent delivery,
  `realtime_events` row count. 60s log line. Expose via
  `GET /api/ops/chat-metrics` (admin). No metrics backend. Broker-lag /
  load-tests are Phase 3 (dropped here). Conforms to D-OBSERVABILITY.
- **Target files.**
  - `src/opzava/platform/observability/realtime-metrics.ts` (new).
  - `src/app/api/ops/chat-metrics/route.ts` (new, admin role via
    `requireRole(request, 'admin')`).
  - `src/lib/sse-stream.ts` (from I20) — increment/decrement
    `activeSseConnections` on stream start/stop; sample delivery lag at
    `sendEvent`.
- **Deterministic acceptance criteria.** `GET /api/ops/chat-metrics` (admin)
  returns `activeSseConnections`, `deliveryLagP95Ms`, `realtimeEventRows`,
  `retryBaseMs`, `retryJitterMs`, `ssePollMs`. A 60s structured log line emits
  the same fields.
- **EXACT verification command.**
  ```bash
  curl -fsS -H "Authorization: Bearer <admin>" http://localhost:3000/api/ops/chat-metrics   # 200 JSON with all six fields
  node --test test/realtime-metrics.test.mjs
  ```
- **Phase.** Phase-1.
- **Depends on.** I20.

---

#### I-doctor — Chat doctor at GET /api/ops/chat-doctor (OpenClawDoctorStatus shape)

- **What.** New chat doctor returning `OpenClawDoctorStatus[]` (single-flight +
  TTL cache mirroring `src/app/api/openclaw/doctor/route.ts:28-66`). Checks:
  write-path atomicity, idempotency index, SSE resync/replay wiring,
  ephemeral-guard, drain handler, coordinator-from-guard, SSE DRY module.
  Conforms to D-CHAT-DOCTOR.
- **Target files.**
  - `src/lib/chat-doctor.ts` (new) — aggregator + single-flight + TTL cache;
    shape `{ level, category, healthy, summary, issues, canFix }`
    (`src/lib/openclaw-doctor.ts:6-14`).
  - `src/app/api/ops/chat-doctor/route.ts` (new, admin role).
- **Deterministic acceptance criteria.** `GET /api/ops/chat-doctor` (admin)
  returns doctorCheck entries covering `chat-write-atomicity`,
  `chat-idempotency-index`, `chat-sse-resync-wiring`, `chat-ephemeral-guard`,
  `chat-drain-handler`, `chat-coordinator-from-guard`, `chat-sse-dry-module`.
  Single-flight prevents concurrent runs; TTL cache coalesces ambient polls.
  Headers include `X-Doctor-Cache: hit|miss`.
- **EXACT verification command.**
  ```bash
  curl -fsS -D - -H "Authorization: Bearer <admin>" http://localhost:3000/api/ops/chat-doctor   # 200; Headers X-Doctor-Cache:hit|miss present
  node --test test/chat-doctor.test.mjs
  ```
- **Phase.** Phase-1.
- **Depends on.** I6, I2, I-resync.

---

#### I-health — Push Realtime Chat health check into performHealthCheck() (HealthCheckEntry)

- **What.** Push a `name:'Realtime Chat'` entry into the health check array via
  `health.checks.push(...)`. Pure evaluator (reads the in-process metrics
  module; no DB on the anonymous probe path). Conforms to D-OBSERVABILITY.
- **Target files.**
  - `src/app/api/status/route.ts:597` — `health.checks.push(checkRealtimeChat())`
    (near the existing `checkDirectConnections` / `checkProviderReadiness`
    pushes).
  - `src/lib/connectivity-health.ts:18-24` — add `checkRealtimeChat()`
    returning a `HealthCheckEntry` (`{ name, status, message, detail? }`).
- **Deterministic acceptance criteria.** `GET /api/status?action=health`
  includes a checks entry `name:'Realtime Chat'` with status
  healthy/warning/critical per the criteria in the Health & Doctor section.
- **EXACT verification command.**
  ```bash
  curl -fsS 'http://localhost:3000/api/status?action=health' | jq '.checks[] | select(.name=="Realtime Chat")'   # present with a valid status
  node --test test/realtime-chat-health.test.mjs
  ```
- **Phase.** Phase-1.
- **Depends on.** I12-phase1.

---

#### I17 — Client half-open watchdog on lastRecv (Discord heartbeat_timeout) — DEFERRED

- **Status.** **Deferred.** Native EventSource + the 15s server heartbeat
  (`SSE_HEARTBEAT_MS=15000`) + jittered retry (I9-jitter) + the resync sentinel
  (I-resync) together cover liveness at internal scale. Reassess ONLY if
  half-open proxies are observed. Listed so it is not silently re-invented.
- **Target files (if revisited).** `src/lib/use-server-events.ts` (client-only:
  track `lastRecv`; if no frame within N heartbeats, force `es.close()` +
  reconnect).
- **Verification of the deferral.** Document the rationale in
  `docs/architecture/realtime-chat-architecture.md`.
- **Phase.** Phase-1 (assessment) → deferred.

---

#### I4-DROPPED — conversation_seq counter table — DROPPED (D-NO-CONVSEQ)

- **Status.** **Dropped** for single-writer SQLite. Ordering =
  `created_at ASC, id ASC` tie-breaker (add `, id ASC` to GET
  `/api/chat/messages` `ORDER BY` at `route.ts:284` and the conversations
  route). Reconsidered ONLY at Postgres multi-writer (Phase 3, I15).
- **EXACT verification command.**
  ```bash
  grep -Rn 'conversation_seq' src/   # expect ZERO in Phase-1 code; only documentary mentions in Phase-3 context
  ```

---

### Phase 2 — broker adapter seam + full collaboration tier

(SSE browser contract UNCHANGED.) Execute only before multi-instance production.

| ID | Title | Target files | Deterministic acceptance | EXACT verification | Depends on |
|---|---|---|---|---|---|
| **I-conv-tables** | `chat_conversations` + `chat_participants` full membership tier | `src/lib/migrations.ts` (055_chat_conversations); `src/opzava/modules/chat/conversations.ts`; `src/app/api/chat/conversations/route.ts` | Explicit conversation metadata + participant membership replace derive-from-messages; replaces the Phase-1 from/to predicate with full ACL; per-eventName subscription index `Map<topic,Set<connection>>` (topic=`chat.conv:{conversationId}`). | `node --test test/chat-membership.test.mjs`; `pnpm test:e2e -- --grep 'conversation ACL'` | — |
| **I5** | `chat_read_states` derived cursor (Chatwoot/Rocket.Chat `lr`) | `src/lib/migrations.ts` (055); `src/opzava/modules/chat/read-state.ts` | Single moving `last_read_seq` cursor; `unread_count` DERIVED by SQL, NOT a per-message ack table; UPSERT with `MAX(current,new)` is idempotent under retry; emit `chat.read` only when cursor advances. | `node --test test/chat-read-state.test.mjs` | I-conv-tables |
| **I14** | Typing/presence ephemeral channel (SQLite `presence_heartbeats` → Redis ZSET) | `src/opzava/modules/chat/presence.ts`; `src/lib/event-bus.ts` (ephemeral guard from Phase-1 part of I16); typing debounce + exclude-originator + server per-pair rate gate | Typing emitted once per 3s, "stopped" 5s after last keystroke; server drops typing faster than once per 2s per `(sender,conversation)`; under queue pressure drop typing first, presence next, durable messages last; never echo to originator; ephemeral events NEVER persisted, NEVER advance cursor. | `node --test test/chat-typing.test.mjs`; `grep -n 'ephemeral' src/lib/event-bus.ts` | I16 (ephemeral guard) |
| **I8 (partial)** | Redis Streams broker adapter + consumer-offset table | `src/opzava/platform/realtime/broker/` (local + redis-streams adapters); `realtime_event_consumers` (057); keep DB event ids as browser replay cursors | Two app processes consume one Redis Stream; broker lag metric exists; SSE browser contract unchanged; consumer-offset table gives per-instance `WHERE id > offset` reads. | `node --test test/broker-redis-streams.test.mjs` | — |
| **I19-conditional** | Web Locks leader-tab collapse | `src/lib/use-server-events.ts` (`navigator.locks.request('opzava-sse-leader')` + BroadcastChannel; ~10 lines) | **Deferred — add ONLY if** multi-tab users hit HTTP/1.1 connection limits in non-HTTP/2 environments. Collapses N tabs into ONE EventSource per browser. | Documented as conditional in `realtime-chat-architecture.md` | — |

---

### Phase 3 — true horizontal scale

| ID | Title | Target files | Deterministic acceptance | EXACT verification | Depends on |
|---|---|---|---|---|---|
| **I8** | Redis Streams broker adapter (full) | (see Phase 2 partial; expanded) | Two app processes consume one Redis Stream; broker lag + oldest-retained-event metrics exist. | `node --test test/broker-redis-streams.test.mjs` (integration, two processes) | — |
| **I15** | NATS JetStream + Postgres migration | `src/opzava/platform/realtime/broker/nats.ts`; datastore migration plan | Deferred until multi-host production or broader event-fabric scope. `conversation_seq` RECONSIDERED HERE (Postgres multi-writer) — the only point I4 is revisited. | Documented in `realtime-chat-architecture.md` Phase 3 | — |
| **I4-DROPPED (revisit)** | `conversation_seq` at Postgres multi-writer | N/A in Phase 1 | Reconsidered ONLY at Postgres multi-writer (this row). | `grep -Rn 'conversation_seq' docs/architecture/realtime-chat-architecture.md` | I15 |

---

## Risk Ledger

Grounded in the audit, with binding mitigations (item IDs reference the
IMPLEMENTATION LEDGER).

| Risk | Impact | Likelihood | Mitigation (binding) |
|---|---|---|---|
| Workspace-only SSE leaks private conversation events to other workspace viewers. | High | High once human chat exists | **I3-predicate**: from/to predicate at `sendEvent` + replay. Full tier Phase 2 (D-MEMBERSHIP-PREDICATE). |
| Coordinator identity spoofing via `body.from` string match. | High | High | **I13**: stop honoring `body.from` for human sessions; override only via agent-scoped key (D-COORDINATOR-FROM). |
| Duplicate message on retry + duplicate gateway run. | High | Medium | **I2**: `client_message_id` + partial UNIQUE index + byte-identical response; gateway key derived from `client_message_id` (D-IDEMPOTENCY). |
| Committed message invisible to SSE after restart (outbox row after ~21s I/O). | High | Medium | **I6 + I-broadcast-reorder**: outbox INSERT inside `BEGIN IMMEDIATE` tx; broadcast originator before replies (D-TX-OUTBOX, D-BROADCAST-REORDER). |
| Reply-before-original ordering. | Medium | High | **I-broadcast-reorder**: emit originator broadcast before `createChatReply`. |
| SSE silently drops events past the 200-row / 7-day cap (no resync signal). | High | Low (requires backgrounded tab) | **I-resync**: `resync.required` sentinel + `replay.complete` marker (D-RESYNC-SENTINEL, D-REPLAY-COMPLETE). |
| Out-of-order display under same-second concurrent sends. | Medium | Medium | **I4-DROPPED ordering portion**: `created_at ASC, id ASC` tie-breaker at `route.ts:284` (D-NO-CONVSEQ). NOT `conversation_seq`. |
| Reconnect storm (fixed `retry:5000`, browser lockstep). | Medium | Medium (bounded) | **I9-jitter**: jittered `retry = 3000 + random(0,4000)` per connection (D-JITTER-RETRY). |
| SIGTERM hard-kills SSE mid-stream. | Medium | High (every redeploy) | **I10-minimal**: `server.close()` + `DRAIN_GRACE_MS=2000` (D-GRACEFUL-DRAIN). |
| `recordingFailureLogged` latches; volatile events mis-deduped client-side. | Medium | Low | **I16**: reset flag after success; dedupe only on real numeric `payload.id` (D-VOLATILE-DEDUP-FIX). |
| SSE buffered by reverse proxy. | High | Medium | **I18**: proxy matrix + temporal smoke test (**I11**); mandatory headers `X-Accel-Buffering:no`. |
| HTTP/1.1 EventSource connection cap with many tabs. | Medium | Medium | One multiplexed stream + HTTP/2 preferred; **I19-conditional** only if limits are hit. |
| Process-local event bus misses other app instances. | High | High when scaled | 1s outbox poll is the single-node bridge; Redis Streams + consumer-offset table is Phase 2/3 (**I8**, D-BROKER). |
| SQLite write contention. | Medium | Medium | WAL + `BEGIN IMMEDIATE` + `busy_timeout=5000`; short tx; single-writer serialization. Postgres/single-writer service Phase 3. |
| Slow clients exhaust memory. | High | Medium | Bounded `SSE_STREAM_HIGH_WATER_MARK=256`; close slow streams; replay on reconnect (preserved by I20). |
| `realtime_events` row growth toward 50k soft cap. | Medium | Low | Boot-started 60s prune timer (P3-4); health check warns at 40k, critical at 50k (**I-health**). |

---

## Events, Schema, Endpoints, Constants (canonical reference)

> Copy-verbatim reference. An implementing agent MUST use these exact names.

### Events

| `type` | family | durable | cursor-advancing | Envelope |
|---|---|---|---|---|
| `chat.message` | chat.durable | true | true | `{id:number(realtime_events.id), type:'chat.message', data:{...messages row incl id, conversation_id, from_agent, to_agent, content, message_type, metadata, workspace_id, created_at}, timestamp:number(ms)}`. `formatSseFrame` emits only `id:` + `data:` (NEVER `event:`); arrives via `EventSource.onmessage`. |
| `chat.message.deleted` | chat.durable | true | true | `{id, type:'chat.message.deleted', data:{id, conversation_id, workspace_id}, timestamp}` |
| `chat.read` | chat.durable | true | true | Phase 2 read-state cursor; emitted only when `last_read_seq` actually advances. `data:{conversation_id, participant_id, last_read_seq}` |
| `connected` | control | false | false | Emitted at stream open; NO id (never advances cursor). `data:null` (`/api/events`) or `{stream:'runs'}` (`/api/v1/runs/stream`) |
| `resync.required` | control | false | false | `{type:'resync.required', data:{reason:'retention-gap'}, timestamp}`; NO id. Client forces full REST re-fetch. |
| `replay.complete` | control | false | false | Synthetic terminal marker after Last-Event-ID replay ends + live tailing begins. NO id. `{type:'replay.complete', timestamp}` |
| `chat.typing.started` | chat.ephemeral | false | false | Phase 2. NEVER persisted, retried, replayed; never carries id; never advances cursor. Volatile broadcast skips `realtime_events` INSERT. Exclude originator. |
| `chat.typing.stopped` | chat.ephemeral | false | false | Phase 2. Same guards as `chat.typing.started`. |
| `presence.updated` | chat.ephemeral | false | false | Phase 2. View-scoped (subscribe, not broadcast). Ephemeral only. |

**Cursor purity invariant (binding).** Ephemeral and control frames (`connected`,
`resync.required`, `replay.complete`, `chat.typing.*`, `presence.updated`) NEVER
carry an `id` and NEVER advance the SSE replay cursor. The durable cursor is
advanced ONLY by `chat.durable` events via the strict-greater guard
(`if (event.id > lastSentId) lastSentId = event.id`).

### Schema (migrations)

| table | purpose | DDL (copy verbatim into the migration) | migrationId | phase |
|---|---|---|---|---|
| `realtime_events` | Durable SSE outbox / replay-cursor source. Global monotonic id = SSE Last-Event-ID cursor. Workspace-scoped. Retention 7d / 50k rows soft cap. | `CREATE TABLE IF NOT EXISTS realtime_events (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, data TEXT NOT NULL, timestamp INTEGER NOT NULL, workspace_id INTEGER DEFAULT NULL);` + indexes `idx_realtime_events_workspace_id(workspace_id, id)`, `idx_realtime_events_timestamp(timestamp)`. | `053_realtime_events` (EXISTS — `src/lib/migrations.ts:1463-1478`) | Phase-0 |
| `messages` | Chat durability base. Phase 1 adds `client_message_id` + partial UNIQUE idempotency index. Ordering = `created_at ASC, id ASC` (NO `conversation_seq`). | `ALTER TABLE messages ADD COLUMN client_message_id TEXT; CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_message_id ON messages(workspace_id, conversation_id, from_agent, client_message_id) WHERE client_message_id IS NOT NULL;` | `054_chat_idempotency` | Phase-1 |
| `realtime_events` (hardening) | Raise `cache_size`, add `temp_store=MEMORY`, keep `wal_autocheckpoint` default 1000 (do NOT disable), drop dead redundant `idx_realtime_events_id`. Add to PRAGMA block in `db.ts`; no logic change. | `-- PRAGMA additions in src/lib/db.ts: cache_size=-65536; temp_store=MEMORY; (wal_autocheckpoint stays default 1000). DROP INDEX IF EXISTS idx_realtime_events_id;` | `054b_realtime_events_pragmas` | Phase-1 |
| `chat_conversations` | Explicit conversation metadata. Replaces deriving conversations from messages. Phase 2. | `CREATE TABLE IF NOT EXISTS chat_conversations (id TEXT PRIMARY KEY, workspace_id INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'dm', created_by TEXT, last_message_id INTEGER, last_message_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()), updated_at INTEGER NOT NULL DEFAULT (unixepoch())); CREATE INDEX IF NOT EXISTS idx_chat_conversations_workspace ON chat_conversations(workspace_id, last_message_at);` | `055_chat_conversations` | Phase-2 |
| `chat_participants` | Conversation membership + notification role. Authorization source for full-tier fanout (Phase 1 uses the from/to predicate instead). | `CREATE TABLE IF NOT EXISTS chat_participants (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT NOT NULL, participant_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at INTEGER NOT NULL DEFAULT (unixepoch()), UNIQUE(conversation_id, participant_id)); CREATE INDEX IF NOT EXISTS idx_chat_participants_conversation ON chat_participants(conversation_id);` | `055_chat_conversations` | Phase-2 |
| `chat_read_states` | Derived-cursor read receipts. UPSERT with `MAX(current,new)`; unread derived by SQL. Emit `chat.read` only when cursor advances. NOT a per-message ack table. | `CREATE TABLE IF NOT EXISTS chat_read_states (participant_id TEXT NOT NULL, conversation_id TEXT NOT NULL, last_read_seq INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(participant_id, conversation_id));` | `055_chat_conversations` | Phase-2 |
| `presence_heartbeats` | Ephemeral online state, SQLite ZSET-equivalent (swap to Redis ZSET at broker phase). `online = last_seen_at > now - TTL`. Two-tier TTL agents 20s / widget 90s. Bounded DELETE on read. | `CREATE TABLE IF NOT EXISTS presence_heartbeats (user_id TEXT PRIMARY KEY, scope TEXT NOT NULL DEFAULT 'workspace', last_seen_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS idx_presence_heartbeats_scope ON presence_heartbeats(scope, last_seen_at);` | `056_chat_presence` | Phase-2 |
| `realtime_event_consumers` | Phase 2/3 broker consumer-offset table. Each SSE instance reads `WHERE id > offset`. Kafka-style per-consumer cursor. NOT needed single-node. | `CREATE TABLE IF NOT EXISTS realtime_event_consumers (consumer_id TEXT NOT NULL, partition_key TEXT NOT NULL, last_processed_event_number INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT (unixepoch()), PRIMARY KEY(consumer_id, partition_key));` | `057_realtime_consumers` | Phase-3 |

**Migration hook.** `registerMigrations(newMigrations)`
(`src/lib/migrations.ts:13-15`) + `runMigrations(db)` (`:1481-1500`). Migration
shape `{ id: string, up: (db) => void }`. Idempotent, transactional, tracked in
`schema_migrations`. Chat schema migrations use ids `054_*` / `055_*` / etc.

### Endpoints

| Method | Path | Role | Purpose | Phase |
|---|---|---|---|---|
| POST | `/api/chat/messages` | operator | Durable chat write. Sender identity resolved server-side. Coordinator override only via agent-scoped API key. Message+activity+notification+outbox in ONE `BEGIN IMMEDIATE` tx; broadcast AFTER commit; broadcast originator BEFORE coordinator replies. Request: `{to?, content (req), message_type? ('text'|'status'|'tool_call', default text), conversation_id?, client_message_id (UUID, REQ), metadata?, forward?, sessionKey?, attachments?[]}`. `body.from` MUST NOT be honored for human sessions. Response: `201 {message: MessageRow (with metadata.forwardInfo), forward: ForwardInfo|null}` — byte-identical on retry. `400` missing content; `422` injection blocked; `500` failure. | Phase-1 |
| GET | `/api/chat/messages` | viewer | List messages with filters. P3-1 fix: `ORDER BY created_at ASC, id ASC`. Query: `?conversation_id&from_agent&to_agent&limit(max 200)&offset&since`. Response: `{messages: MessageRow[], total, page, limit}`. | Phase-1 |
| GET | `/api/events` | viewer | Primary multiplexed SSE stream. Last-Event-ID replay cursor = `realtime_events.id`. Honors `?types=`. Adds `resync.required` + `replay.complete` + from/to predicate + jittered retry. Headers: `Last-Event-ID` (or `?lastEventId`), `?types=csv`. Frames: `id:`/`data:` only (no `event:`). `connected` (no id), data events, `resync.required` (no id) when `lastSentId<min(id)`, `replay.complete` (no id) after replay. Heartbeat `: heartbeat\n\n` every 15s. Response headers: `Cache-Control:no-cache,no-transform; Connection:keep-alive; X-Accel-Buffering:no`. | Phase-1 |
| GET | `/api/v1/runs/stream` | viewer | SSE stream of Agent-Run-Protocol events. Honors `?types=` (currently IGNORED at `:18-23` — MUST be honored). Shares the extracted SSE module. Same frame/heartbeat/headers as `/api/events` plus `X-Agent-Run-Protocol:0.1.0`. | Phase-1 |
| GET | `/api/ops/chat-metrics` | admin | Realtime chat observability. In-process counters, no metrics backend. `requireRole(request,'admin')`. Optional `?reset`. Response: `{activeSseConnections, deliveryLagP95Ms, realtimeEventRows, retryBaseMs, retryJitterMs, ssePollMs}`. | Phase-1 |
| GET | `/api/ops/chat-doctor` | admin | Chat health doctor, `OpenClawDoctorStatus` shape, single-flight + TTL cache. Headers `Cache-Control:no-store; X-Doctor-Cache:hit|miss`. | Phase-1 |
| GET | `/api/status?action=health` | viewer | Full health; chat check PUSHED in `performHealthCheck()` near `status/route.ts:597`. Response includes `checks:[{name:'Realtime Chat', ...}]`. | Phase-1 |
| GET | `/api/health` | anonymous | Anonymous liveness probe. No chat logic. `{status:'ok', db:'ok', ts}`, 503 on DB fail. Existing. | Phase-0 |

### Constants

| Name | Value | Unit | Purpose | File |
|---|---|---|---|---|
| `SSE_RETRY_MS` | 5000 | ms | BASE value for the SSE retry frame. Phase 1: replaced by jittered `retry = SSE_RETRY_BASE_MS + random(0, SSE_RETRY_JITTER_MS)` (D-JITTER-RETRY). Constant retained as base default. | `src/lib/realtime-events.ts` |
| `SSE_RETRY_BASE_MS` | 3000 | ms | Phase 1 NEW. Base of the jittered retry frame (AWS Full-Jitter). `formatSseRetryFrame(base=SSE_RETRY_BASE_MS, jitter=SSE_RETRY_JITTER_MS)`. | `src/lib/realtime-events.ts` |
| `SSE_RETRY_JITTER_MS` | 4000 | ms | Phase 1 NEW. Jitter window: `retry = base + Math.floor(Math.random()*jitter)`. Re-emit on each (re)connect. | `src/lib/realtime-events.ts` |
| `SSE_HEARTBEAT_MS` | 15000 | ms | SSE comment heartbeat (`: heartbeat\n\n`). MUST stay below every reverse-proxy idle timeout (nginx `proxy_read_timeout`, CF ~100-120s). Existing, unchanged. | `src/lib/realtime-events.ts` |
| `SSE_POLL_MS` | 1000 | ms | Per-connection cross-process outbox poll interval (`setInterval(replayFromStore, SSE_POLL_MS)`). CORRECTNESS parameter — the floor guaranteeing a missed event recovers within ~1s. MUST stay at-least-once, monotonic (`id>cursor`), never coalesce/drop under load. Existing. | `src/lib/realtime-events.ts` |
| `SSE_REPLAY_LIMIT` | 200 | rows | Max rows per replay scan. Paired with the `resync.required` sentinel — if `Last-Event-ID < min(id)`, emit resync and do NOT partial-replay across the gap. Existing. | `src/lib/realtime-events.ts` |
| `SSE_RETENTION_MS` | 604800000 | ms | `realtime_events` age retention = 7 days. Existing. | `src/lib/realtime-events.ts` |
| `SSE_RETENTION_MAX_ROWS` | 50000 | rows | `realtime_events` soft row cap (non-atomic SELECT-then-DELETE trim). P3-4: move prune off the broadcast hot path to a boot-started 60s `setInterval`. Existing. | `src/lib/realtime-events.ts` |
| `SSE_PRUNE_INTERVAL_MS` | 60000 | ms | Global prune throttle. P3-4: move to a dedicated boot-started timer (mirrors `github-sync-poller`/`scheduler`/`rate-limit`). Existing. | `src/lib/realtime-events.ts` |
| `SSE_STREAM_HIGH_WATER_MARK` | 256 | frames | ReadableStream highWaterMark; slow-client close threshold. When `controller.desiredSize<=0` the stream stops+closes and relies on replay-after-reconnect. Shared via the DRY module. | `src/app/api/events/route.ts` (→ `src/lib/sse-stream.ts`) |
| `MAX_DEDUPED_EVENT_IDS` | 500 | entries | Client-side in-memory LRU Set of seen event ids. Phase 1 fix: only dedupe when `payload.id` is a real number — id-less volatile events bypass the Set. Existing. | `src/lib/use-server-events.ts` |
| `COORDINATOR_AGENT` | `process.env.MC_COORDINATOR_AGENT \|\| process.env.NEXT_PUBLIC_COORDINATOR_AGENT \|\| 'coordinator'` | string | Coordinator agent identity. P0-1: `body.from==='coordinator'` override honored ONLY when `auth.user.agent_name===COORDINATOR_AGENT` (agent-scoped API key). Existing. | `src/app/api/chat/messages/route.ts:33` |
| `DRAIN_GRACE_MS` | 2000 | ms | Phase 1 NEW. Bounded wait after `server.close()` on SIGTERM before `disposePtysOnly()`. Hard-coded ~2s; no draining-flag subsystem. | `scripts/mc-server.cjs` |
| `SQLITE_BUSY_TIMEOUT_MS` | 5000 | ms | `PRAGMA busy_timeout`. Existing (`src/lib/db.ts:52`). Load-bearing with `BEGIN IMMEDIATE` (D-TX-OUTBOX): makes the timeout deterministic on the reserved-lock acquisition. | `src/lib/db.ts` |
| `SQLITE_CACHE_SIZE` | -65536 | bytes(KiB) | P3-9 fix: raise `cache_size` from 1000 (~4MB) to -65536 (~64MB resident). Add to PRAGMA block in `db.ts`. | `src/lib/db.ts` |
| `PRESENCE_TTL_AGENT_MS` | 20000 | ms | Phase 2. Agent presence heartbeat expiry. `online = last_seen_at > now - TTL`. | `src/opzava/modules/chat/presence` |
| `PRESENCE_TTL_WIDGET_MS` | 90000 | ms | Phase 2. Widget/browser presence heartbeat expiry. | `src/opzava/modules/chat/presence` |

---

## Observability — Metrics, Health, Doctor, Logs

### Metrics (Phase-1 in-process counters)

| Name | Type | Description | Source |
|---|---|---|---|
| `opzava_chat_active_sse_connections` | gauge | Currently open SSE viewer connections across this process. Incremented on stream start, decremented on stop/cancel/abort. Labels: `route(/api/events\|/api/v1/runs/stream)`. | in-process counter module; `GET /api/ops/chat-metrics` field `activeSseConnections` |
| `opzava_chat_delivery_lag_p95_ms` | gauge | Rolling p95 of `(Date.now() - event.timestamp)` measured at sendEvent delivery. Proxy for end-to-end latency floor. | in-process rolling p95; `GET /api/ops/chat-metrics` field `deliveryLagP95Ms` |
| `opzava_realtime_event_rows` | gauge | Current row count of `realtime_events` (outbox depth). Watch for drift toward `SSE_RETENTION_MAX_ROWS=50000`. | `SELECT COUNT(*) FROM realtime_events`; field `realtimeEventRows` |
| `opzava_chat_outbox_poll_iterations_total` | counter | **Phase 3 only** (broker track). Not emitted in Phase 1. | — |
| `opzava_chat_broker_lag_ms` | histogram | **Phase 2/3 only** (Redis Streams adapter). Dropped from Phase 1. | broker adapter |
| `opzava_chat_write_path_p99_ms` | histogram | **Phase 3 only**. Write-path DB transaction p99 — the real user SLA (Slack: persist-before-fanout). Not instrumented Phase 1. | — |

### Health check — `realtime-chat` (`GET /api/status?action=health`)

Entry `name:'Realtime Chat'` pushed in `performHealthCheck()` at
`src/app/api/status/route.ts:597`.

| Status | Criteria (binding) |
|---|---|
| **healthy** | `activeSseConnections>=0` (stream alive), `realtimeEventRows < SSE_RETENTION_MAX_ROWS` (50000), `deliveryLagP95Ms < 1000`, idempotency index `idx_messages_client_message_id` present, drain handler wired. |
| **warning** | `realtimeEventRows >= 40000` (80% cap) OR `deliveryLagP95Ms` between 1000-2500 OR `recordingFailureLogged` latched (transient `recordServerEvent` failure muted). |
| **critical** | `realtimeEventRows >= 50000` (cap reached, prune failing) OR `deliveryLagP95Ms > 5000` (events severely delayed) OR `messages` table missing `client_message_id` column (idempotency not migrated) OR outbox poll throwing. |

### Doctor checks — `GET /api/ops/chat-doctor` (admin)

Returns `OpenClawDoctorStatus[]` (`{ level, category, healthy, summary, issues, canFix }`,
`src/lib/openclaw-doctor.ts:6-14`). Single-flight + TTL cache
(`src/app/api/openclaw/doctor/route.ts:28-66`).

| id | category | summary | canFix |
|---|---|---|---|
| `chat-write-atomicity` | state | POST wraps message+activity+notification+outbox INSERT in one `BEGIN IMMEDIATE` tx and broadcasts AFTER commit. Fails (error) if the tx boundary is absent or broadcast precedes commit. | false |
| `chat-idempotency-index` | state | `messages.client_message_id` column + partial UNIQUE index `idx_messages_client_message_id(workspace_id, conversation_id, from_agent, client_message_id) WHERE client_message_id IS NOT NULL` exist. | true |
| `chat-sse-resync-wiring` | config | `/api/events` emits `resync.required` when `lastSentId < min(realtime_events.id)` and emits `replay.complete` after replay. | false |
| `chat-ephemeral-guard` | security | `event-bus.ts` routes ephemeral types (`chat.typing.*`, `presence.updated`) to a volatile broadcast that skips the `realtime_events` INSERT and never advances the cursor. | false |
| `chat-drain-handler` | config | `mc-server.cjs` SIGTERM handler calls `server.close()` + bounded `DRAIN_GRACE_MS` wait before `disposePtysOnly()`. | false |
| `chat-coordinator-from-guard` | security | `body.from` is NOT honored for human sessions; the coordinator override requires `auth.user.agent_name===COORDINATOR_AGENT`. Fails (error) if `body.from==='coordinator'` is a pure string-match override. | false |
| `chat-sse-dry-module` | general | `/api/events` and `/api/v1/runs/stream` share an extracted SSE module and `/api/v1/runs/stream` honors `?types=`. | false |

### Log fields (pino, `module: 'realtime-chat'`)

Server: `import { logger } from '@/lib/logger'; logger.child({ module: 'realtime-chat' })`.
Client: `createClientLogger('realtime-chat')`. Log shipping:
`src/opzava/platform/observability/log-shipping.ts:54-63` (dual-stream stdout +
HTTP POST, fail-open; `realtime-chat` child logs ship at `>=info`).

| Event | Level | Fields |
|---|---|---|
| `chat.message.write` | info | `{ messageId, conversation_id, from_agent, to_agent, workspace_id, client_message_id, forwardAttempted, txDurationMs }` |
| `chat.message.idempotent_replay` | info | `{ client_message_id, existingMessageId, workspace_id }` — duplicate POST returned existing committed row |
| `chat.sse.connect` | debug | `{ workspace_id, lastEventId, types, retryMs }` — on stream open |
| `chat.sse.resync_required` | warn | `{ workspace_id, lastEventId, minId }` — cursor predates retention |
| `chat.sse.replay_complete` | debug | `{ workspace_id, lastEventId, replayedCount }` |
| `realtime.event.durability_unavailable` | warn | `{ err, type }` — `recordServerEvent` threw; reset `recordingFailureLogged` after success (P2-5) |
| `chat.sse.slow_client_closed` | warn | `{ workspace_id, lastEventId }` — highWaterMark exceeded |
| `chat.drain.sigterm` | info | `{ activeSseConnections, graceMs }` — graceful drain begin |
| `chat.coordinator_override_blocked` | warn | `{ requestedFrom, authUser }` — `body.from` override denied for non-agent-scoped session (P0-1) |
| `chat.message.broadcast_reorder` | debug | `{ messageId, conversation_id }` — originator broadcast before coordinator reply generation |

---

## Deployment Runbook

### Env vars

| Name | Default | Purpose |
|---|---|---|
| `MC_COORDINATOR_AGENT` | `coordinator` | Coordinator agent identity string. `body.from` override to this value honored ONLY when `auth.user.agent_name === this` (agent-scoped API key). Existing. |
| `NEXT_PUBLIC_GATEWAY_OPTIONAL` | `true` | Disables gateway-socket reconnect from the first failure for standalone deployments without gateway connectivity. Existing. |
| `MISSION_CONTROL_DATA_DIR` | `.data/` | Data directory (gitignored). `realtime_events` lives in the DB here. Existing. |
| `MISSION_CONTROL_DB_PATH` | `<data-dir>/mission-control.db` | SQLite DB path. The single-writer serialized chat store. Existing. |
| `OPZAVA_SSE_RETRY_BASE_MS` | 3000 | Phase 1 OPTIONAL override for `SSE_RETRY_BASE_MS`. |
| `OPZAVA_SSE_RETRY_JITTER_MS` | 4000 | Phase 1 OPTIONAL override for `SSE_RETRY_JITTER_MS`. `retry = base + random(0, jitter)`. |
| `OPZAVA_DRAIN_GRACE_MS` | 2000 | Phase 1 OPTIONAL override for the SIGTERM graceful-drain bounded wait before `disposePtysOnly()`. |
| `MC_DOCTOR_TTL_MS` | 30000 | TTL cache for `/api/openclaw/doctor` GET. The chat doctor at `/api/ops/chat-doctor` mirrors this pattern — reuse the same tuning convention. |
| `LOG_SHIP_ENABLED` / `LOG_SHIP_ENDPOINT` / `LOG_SHIP_MIN_LEVEL` | `info` (min level default) | Centralized log shipping. Dual-stream stdout + HTTP POST, fail-open. `realtime-chat` pino child logs ship at `>=info`. Existing. |

### Reverse proxy / HTTP-2 config (D-PROXY-MATRIX)

```
                       ┌─────────────┐
   browser ──HTTP/2──► │ reverse proxy│ ──HTTP/1.1──► Opzava (/api/events SSE)
                       └─────────────┘
   ONE multiplexed SSE stream per browser (never per-conversation)
```

| Target | Binding config | Rationale |
|---|---|---|
| **nginx** | `proxy_read_timeout 3600s; proxy_buffering off; proxy_ignore_headers X-Accel-Buffering;` | `proxy_read_timeout` defaults to 60s (kills SSE). `proxy_buffering off` + ignore `X-Accel-Buffering` so the app's escape hatch is honored. |
| **Traefik** | buffering middleware OFF. Do NOT add `responseForwarding.flushInterval` labels (dead config). | Traefik v3 auto-detects `text/event-stream` and ignores `flushInterval` for streaming responses. Verify no `respondingTimeouts` killing the stream. |
| **Cloudflare** | heartbeat < 100s; expect 524 after ~100-120s. | CF 524 after ~100-120s and observed buffering to ~100KB regardless of heartbeat. The 15s `SSE_HEARTBEAT_MS` keeps CF happy; long-lived CF-fronted deployments need the documented caveat. |
| **HTTP/2** | preferred at the reverse proxy. | SSE over HTTP/1.1 hits a ~6-connection-per-browser-per-domain cap; one multiplexed SSE stream + HTTP/2 avoids it. Never open per-conversation SSE streams. |

**Mandatory SSE response headers (both routes):**
`Cache-Control: no-cache, no-transform; Connection: keep-alive; X-Accel-Buffering: no`.
`/api/v1/runs/stream` additionally sets `X-Agent-Run-Protocol: 0.1.0`. Preserved
by the DRY SSE module (I20).

### Graceful drain (D-GRACEFUL-DRAIN, I10-minimal)

1. SIGTERM received.
2. Retain the HTTP server ref from `patchCreateServer`.
3. `server.close()` — stops accepting new connections; existing SSE streams
   get a bounded grace window.
4. `setTimeout(disposePtysOnly, DRAIN_GRACE_MS=2000)`.
5. Durable replay recovers any event committed-but-not-yet-pushed on the next
   reconnect (1s poll + Last-Event-ID).
6. NO draining-flag / `resync.broadcast` / grace-period-coordination subsystem.

### Smoke test (I11, D-SMOKE-TEMPORAL)

```bash
# Temporal liveness: open SSE, POST a workspace-scoped event from a second
# authenticated curl, assert the matching data frame arrives on the SAME open
# connection within ~3s. Covers /api/events AND /api/v1/runs/stream.
bash scripts/dokploy-parity-test.sh
```

A proxy that buffers AFTER the initial flush FAILS this test. Traefik
`responseForwarding.flushInterval` labels MUST be absent (dead config).

### Build / verify (before deploy)

```bash
pnpm install && pnpm build
pnpm test:all          # lint + typecheck + test + build + e2e
node .next/standalone/server.js    # standalone (next.config.js output:'standalone')
```

---

## Open Questions RESOLVED

1. **Is the global `realtime_events.id` cursor sufficient, or do we need a
   per-conversation seq?** RESOLVED (D-NO-CONVSEQ): the global `realtime_events.id`
   cursor is sufficient for replay/durability. Per-conversation seq is NOT needed for
   ordering at single-node SQLite scale (`created_at ASC, id ASC` tie-breaker
   suffices — P3-1). `conversation_seq` is reconsidered ONLY at Postgres
   multi-writer (Phase 3, I15). DROP I4.

2. **Cross-process fanout: broker now or defer?** RESOLVED (D-BROKER): DEFER.
   The 1s SQLite poll IS a working cross-process bridge for SSE clients. At
   internal-team scale the synchronous indexed reads are rounding-error load
   (WAL means no read/write contention; sqlite.org/wal.html §1). Real broker
   (Redis Streams + consumer-offset table) is Phase 2/3, gated on actual
   multi-instance need.

3. **Typing/presence: ephemeral-only or durable?** RESOLVED (D-EPHEMERAL):
   EPHEMERAL-ONLY. Never persisted, never retried, never replayed, drop-if-late.
   Enforced by an event-type guard in `event-bus.ts` (Phase-1 part of I16).
   Cursor purity invariant: ephemeral frames MUST NOT advance or break the SSE
   replay cursor.

4. **Read state: per-message ack or derived cursor?** RESOLVED (Phase 2, I5):
   DERIVED CURSOR. `chat_read_states(participant_id, conversation_id,
   last_read_seq)`; UPSERT with `MAX`; unread derived by SQL. Emit `chat.read`
   only when the cursor advances. NOT a per-message ack table.

5. **Workspace trust boundary vs per-conversation membership?** RESOLVED for
   now (D-MEMBERSHIP-PREDICATE): WORKSPACE IS THE BOUNDARY; minimal from/to
   predicate now (I3-predicate, Phase 1), full `chat_participants` tier
   deferred (Phase 2, I-conv-tables). The P0-1 coordinator-impersonation fix
   (I13) is the load-bearing integrity fix; the from/to predicate is the cheap
   privacy gate.

---

## Sources (primary)

- **Slack** persist-before-fanout + transient events + view-scoped presence:
  https://slack.engineering/scaling-datastores-at-slack-with-vitess/ ,
  https://slack.engineering/real-time-messaging/ ,
  https://docs.slack.dev/reference/events/presence_sub/
- **Zulip** after-commit dispatch + initial-state reconcile + stale-cursor
  rejection: https://github.com/zulip/zulip/blob/main/docs/subsystems/events-system.md ,
  https://github.com/zulip/zulip/blob/main/zerver/lib/events.py
- **Discord** RESUMED + heartbeat piggyback + monotonic seq guard:
  https://docs.discord.com/developers/events/gateway ,
  https://github.com/discordjs/discord.js/blob/main/packages/ws/src/ws/WebSocketShard.ts
- **AWS Full-Jitter**: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- **event-driven.io** outbox/inbox + consumer-offset:
  https://event-driven.io/en/outbox_inbox_patterns_and_delivery_guarantees_explained/
- **Chatwoot / Rocket.Chat** derived-cursor read receipts + presence:
  https://github.com/chatwoot/chatwoot/blob/develop/app/models/conversation.rb ,
  https://github.com/chatwoot/chatwoot/blob/develop/lib/online_status_tracker.rb
- **Mattermost** idempotency caveat (node-local cache fails behind non-sticky
  LB — key on shared SQLite, not in-process memory):
  https://github.com/mattermost/mattermost/blob/master/server/channels/app/post.go
- **HTML spec SSE** (reconnect, Last-Event-ID, retry, empty-id reset, comment
  heartbeat): https://html.specwhatwg.org/multipage/server-sent-events.html
- **sqlite.org** WAL concurrency + BEGIN IMMEDIATE + busy_timeout-on-upgrade +
  PRAGMA: https://sqlite.org/wal.html , https://sqlite.org/lang_transaction.html ,
  https://sqlite.org/pragma.html
- **better-sqlite3** performance (WAL, checkpoint starvation):
  https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md
- **nginx / Cloudflare / Traefik** SSE proxy specifics:
  https://nginx.org/en/docs/http/ngx_http_proxy_module.html ,
  https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/ ,
  https://github.com/traefik/traefik/issues/8623

### Opzava internal (code verified)

- `src/app/api/chat/messages/route.ts` (POST `:327-735`, GET `:245-320`, coordinator override `:336-340`, idempotency gap `:369-382,498`, broadcast `:733`)
- `src/app/api/events/route.ts` (`:42-151`; workspace filter `:78`; poll `:116`; headers `:144-149`)
- `src/app/api/v1/runs/stream/route.ts` (`:18-23` ignored `?types=`; `:39-147`)
- `src/lib/realtime-events.ts` (`:4-10` constants; `:48-56` no `chat.*` branch; `:94-130` record+prune; `:132-175` replay+frames)
- `src/lib/event-bus.ts` (`:47,64-80` latching flag + broadcast)
- `src/lib/use-server-events.ts` (`:64-66,79-83` dedup + onerror)
- `src/lib/db.ts` (`:46-52` PRAGMAs)
- `src/lib/migrations.ts` (`:60-83` messages; `:1463-1478` realtime_events; `:583-684` workspace_id)
- `src/lib/auth.ts` (`:632-644` requireRole)
- `src/lib/openclaw-doctor.ts` (`:6-14` shape); `src/app/api/openclaw/doctor/route.ts` (`:28-66` single-flight + TTL)
- `src/app/api/status/route.ts` (`:511-659` performHealthCheck; `:597-598` push sites)
- `src/lib/connectivity-health.ts` (`:18-24` HealthCheckEntry)
- `src/store/index.ts` (`:1120` addChatMessage dedup)
- `scripts/mc-server.cjs` (`:31-49` patchCreateServer + SIGTERM)
- `scripts/dokploy-parity-test.sh` (`:89-111` static SSE assertion)
- `docker-compose.dokploy.yml` (`:13-33`)

# Opzava Realtime Chat — Canonical Architecture

Status: **Canonical spec.** Phase 1 implementation gated behind the work items in §Rollout Phases. This document is the single source of truth for design. Every name (event, table, column, endpoint, constant, metric, health-check id, env var) is normative and MUST be copied verbatim into code. The embedded ASCII topology in §Target Topology OWNS the diagram; `docs/architecture/realtime-chat-topology.mmd` is a rendering convenience only and MUST NOT be edited independently of this file.

Date: 2026-06-24
Scale baseline: **self-hosted, single-node SQLite (better-sqlite3, synchronous, WAL + `busy_timeout=5000`), internal AI team.** All single-node claims are graded against this scale first; horizontal-scale concerns are phase-gated to Phase 2/3.

**Companion documents** (this doc is the single source of truth for design; the rest are views of it):
- Audit of record: `docs/architecture/realtime-chat-production-review.md` (file:line evidence + primary-source research).
- Implementation Playbook (verbatim contract tables + I-item ledger): `docs/architecture/realtime-chat-ledger.md`.
- Ops/logging/doctor/health registry: `docs/architecture/realtime-chat-inventory.md`.
- Topology rendering: `docs/architecture/realtime-chat-topology.mmd` (rendering convenience for the ASCII diagram in §3; MUST NOT be edited independently of this file).
- Ratifying ARD: `docs/ard/0009-realtime-user-chat-transport-and-fanout.md`.

---

## 1. Executive Answer (verdict from audit)

The Opzava realtime **spine** — HTTP POST write + ONE multiplexed SSE stream (`GET /api/events`) using `realtime_events.id` (global monotonic autoincrement) as the `Last-Event-ID` replay cursor + a 1 s cross-process outbox poll — is **sound, primary-source-validated, and production-curable** for the intended scale. **It is NOT production-ready as shipped for user chat today.** (Audit §1, `docs/architecture/realtime-chat-production-review.md`.)

Three classes of defect MUST be closed before flipping chat on for real users. All three are small, localized, and well-precedented:

1. **Write-path atomicity.** Message + activity log + notification + outbox are 4 independent auto-commits, and the outbox row is written AFTER up to ~21 s of gateway I/O. A hard kill leaves committed-but-SSE-invisible messages and a reply-before-original ordering bug. Fix: wrap the durable writes in one `BEGIN IMMEDIATE` transaction, emit AFTER commit, broadcast the originator BEFORE coordinator replies. (`src/app/api/chat/messages/route.ts:374,389,401,733`; decision `D-TX-OUTBOX`, `D-BROADCAST-REORDER`.)
2. **Authorization boundary.** SSE/replay filter is workspace-only, and `body.from === 'coordinator'` is honored from ANY operator session (coordinator impersonation). Fix: stop honoring `body.from` for human sessions; coordinator override ONLY via the agent-scoped API key. (`src/app/api/chat/messages/route.ts:336-340`; decision `D-COORDINATOR-FROM`.)
3. **Idempotency.** No `client_message_id`; a lost-201 + Retry inserts a duplicate row and re-runs the downstream agent. Fix: one column + one partial UNIQUE index + a client UUID. (`src/lib/migrations.ts:64-74`; decision `D-IDEMPOTENCY`.)

Everything else — broker adapter, presence/typing, `conversation_seq`, consumer-Slack concurrency — is **scale-dependent and correctly deferred** to the Phase 2/3 broker track. `conversation_seq` is DROPPED for single-writer SQLite (decision `D-NO-CONVSEQ`); ordering is `created_at ASC, id ASC`.

WebSocket (gateway `src/lib/websocket.ts`, PTY `src/lib/pty-websocket.ts`) is NOT canonical durable chat transport (decision `D-WS-SEPARATE`). WebSocket MAY be used later for ephemeral typing/presence only (Phase 2). Durable message recovery ALWAYS comes from the DB/outbox cursor.

---

## 2. Current Surfaces Inventory

Code-verified, file:line-anchored.

| Surface | File | Role | Production chat fit |
|---|---|---|---|
| Browser SSE stream | `src/app/api/events/route.ts:22` | Primary multiplexed SSE. Workspace-scoped (`:27,78`), `Last-Event-ID` replay (`:28-29,37`), `?types=` filter (`:30-36`), 1 s cross-process poll (`:116`), 15 s heartbeat (`:119-121`), slow-client close at `desiredSize<=0` (`:59-67`). | Primary candidate. Phase 1 hardens it: resync sentinel, replay.complete marker, from/to predicate, jittered retry, DRY module. |
| In-process bus + durable replay table | `src/lib/event-bus.ts:64` (`broadcast`), `src/lib/realtime-events.ts` (`recordServerEvent :94`, `readServerEventsAfter :132`) | `broadcast()` records into `realtime_events` THEN emits; on record failure falls back to volatile in-process event (`event-bus.ts:71-77`). | Good single-node base. The bus is a best-effort ACCELERATOR, NOT a reliability layer (`D-SPINE`). Reliability lives in the outbox + write transaction. |
| Run-protocol SSE stream | `src/app/api/v1/runs/stream/route.ts:28` | SSE of Agent-Run-Protocol events. **Hardcodes `RUN_EVENT_TYPES` and IGNORES `?types=`** (`:18-23,76`). Shares ZERO common code with `/api/events` (~100 duplicated lines). | Phase 1: honor `?types=`, share the extracted SSE module (`D-DRY-SSE`). |
| Browser EventSource consumer | `src/lib/use-server-events.ts:25` | EventSource into Zustand. In-memory 500-entry LRU Set (`:23,27`); dedup keyed on `payload.id` falling back to sticky `event.lastEventId` (`:64`). | Reuse. Phase 1: dedup ONLY when `payload.id` is a real number (`D-VOLATILE-DEDUP-FIX`); dispatch `resync.required`/`replay.complete`. |
| Gateway control WebSocket | `src/lib/websocket.ts` | Browser→external gateway control. Application-level RPC ping that silently degrades to passive mode (`websocket.ts:168-210`); reconnect gives up after 10 attempts (`:815-824`). | NOT chat transport (`D-WS-SEPARATE`). Integration/control only. |
| PTY WebSocket | `src/lib/pty-websocket.ts`, `scripts/pty-websocket-standalone.cjs` | Terminal I/O over `/ws/pty`. `ptyPool` is a plain in-process `Map` (`src/lib/pty-manager.ts:201`); no affinity. | NOT chat transport. Sticky/local-affinity required; state is lost on horizontal scale (tmux is the real durable state). |
| Chat UI + REST write path | `src/app/api/chat/messages/route.ts`, `src/components/chat/*` | Current agent chat. POST inserts message (`:374`), logs activity (`:389`), creates notification (`:401`), optionally forwards to gateway, broadcasts `chat.message` (`:733`). | Reuse UI + REST write path. Phase 1 wraps durable writes in one tx (`D-TX-OUTBOX`). |
| Standalone server drain | `scripts/mc-server.cjs:43-49` | SIGTERM handler calls ONLY `disposePtysOnly()`. The Next HTTP server is NEVER `.close()`'d → every SSE viewer hard-drops on redeploy. | Phase 1: `server.close()` + bounded 2 s wait (`D-GRACEFUL-DRAIN`). |

Verified current constraints (audit §2.2):

- `formatSseFrame` emits ONLY `id:` and `data:`, NEVER `event:` (`realtime-events.ts:164-171`). Every event arrives via `EventSource.onmessage`; clients MUST NOT use `addEventListener('chat.message', ...)`. Type filtering is server-side JSON `type` string match.
- The `connected` ack frame carries NO `id` (`events/route.ts:103`, `stream/route.ts:101`), so it never advances the replay cursor. Same for the planned `resync.required` / `replay.complete` control frames.
- `workspaceIdFromData` has NO `chat.*` branch in its table-lookup map (`realtime-events.ts:48-56`). Chat delivery works only because both broadcasters spread the full `messages` row (which carries `workspace_id`, NOT NULL DEFAULT 1). Latent gap — a future broadcaster that omits it persists `workspace_id=NULL` and silently drops for all viewers.
- `recordingFailureLogged` is a latching flag, NEVER reset (`event-bus.ts:47,73`). One transient SQLite error permanently mutes the durability warning for process life (`D-VOLATILE-DEDUP-FIX`).
- `pruneRealtimeEvents` runs synchronously on the broadcast hot path before the INSERT (`realtime-events.ts:96,110-130`); row-cap is a SOFT target (non-atomic SELECT-then-DELETE). Globally throttled to once/60 s.
- `messages.created_at` is `DEFAULT (unixepoch())` — second granularity, no ms/seq column (`migrations.ts:73`). GET orders `ORDER BY created_at ASC` with NO `, id ASC` tie-breaker (`messages/route.ts:284`); conversations route orders `ORDER BY created_at DESC` (`conversations/route.ts:65`).

---

## 3. Target Topology

The browser contract is STABLE from single-node to multi-node; only the server-side publisher adapter changes per phase. This ASCII diagram is the canonical reference.

```
                                    OPAVA REALTIME CHAT — DURABLE WRITE -> OUTBOX -> SSE -> CLIENT
                                    (single-node SQLite now; broker/scale tiers disabled until Phase 2/3)

  +-----------------------------+        +-------------------------------------------- NEX.JS APP INSTANCE -----------------------------+
  |  BROWSER / DESKTOP WEBVIEW  |        |                                                                        |
  |                             |        |  requireRole(operator)                                                 |
  |  Chat UI (optimistic bubble)|   1    |  +-------------------+        +----------------------------------------------+                 |
  |          |                  |------->|  | POST /api/chat/   |        |  BEGIN IMMEDIATE  db.transaction(...)        |                 |
  |          v (UUID per send)  |  HTTP  |  | messages          |  2     |  {                                            |                 |
  |  POST /api/chat/messages    |  POST  |  | - resolve from    |------->|    INSERT messages (ON CONFLICT DO NOTHING    |                 |
  |  body: { content,           |        |  |   server-side     |        |        RETURNING id)  -- D-IDEMPOTENCY        |                 |
  |    to?, conversation_id?,   |        |  |   (D-COORD-FROM)  |        |    logActivity('chat_message')               |                 |
  |    client_message_id(UUID), |        |  | - injection scan  |        |    createNotification (if to)                |                 |
  |    metadata?, forward? }    |        |  +-------------------+        |    INSERT realtime_events (chat.message)      |                 |
  |          |                  |        |                               |  }  <-- D-TX-OUTBOX (one tx, outbox row IN tx)|                 |
  |          | 7 (store upsert  |        |                               |  COMMIT  --> messageId + eventId returned    |                 |
  |          |     by            |        |                               +--------------------+-------------------------+                 |
  |          |     client_       |        |                                                    |  (broadcast AFTER commit)                    |
  |          |     message_id)   |        |                          3 (originator BEFORE coord replies)                                            |
  |          v                  |        |                                                    v                                               |
  |  Zustand chat store         |        |                               +--------------------+                                                |
  |  + useServerEvents()        |        |                               | eventBus.broadcast |  <-- BEST-EFFORT ACCELERATOR (D-SPINE)        |
  |  (id/event dedupe +         |        |                               | (in-process emit)  |   NOT a reliability layer                  |
  |   resync/replay.complete)   |        |                               +----+---------------+                                                |
  |          ^ 6 (frame:         |        |                                    | 4 (same-process live push)                         |
  |            id:/data: only)   |        |                                    v                                                    |
  |          |                   |        |  +-------------------+   +-----------------------+   +-----------------------+         |
  |          |                   |        |  | eventBus.off ->   |   |  SSE stream (DRY mod) |   | cross-process poll    |         |
  |          |                   |        |  | 'server-event'    |<--|  highWaterMark=256    |<--| setInterval(replay,    |         |
  |          |                   |        |  | handler           |   |  heartbeat 15s        |   |   SSE_POLL_MS=1000)    |         |
  |          |                   |        |  | ?types= filter    |   |  jittered retry frame |   | readServerEventsAfter  |         |
  |          |                   |        |  | from/to predicate |   |  resync / replay.     |   |  (WHERE id > cursor    |         |
  |          |                   |        |  |   (D-MEMBERSHIP)  |   |    complete sentinels |   |   AND workspace_id=?)  |         |
  |          |                   |  5     |  +-------------------+   +-----------------------+   +-----------+-----------+         |
  |          |                   |<-------|          ^                                                          |                   |
  |          |                   | SSE    |          |                                                          | 8                 |
  |          |                   | stream |          +----------------------------------------------------------+                   |
  +-----------------------------+        +---------------------------------------------------------------------------------------+
                                                                                                                           |
                          DURABLE STATE (SQLite, single writer)                                                            |
                          +-----------------------------------------------------------------------------------------+      |
                          | messages (client_message_id + partial UNIQUE idempotency idx -- 054)                      |      |
                          | realtime_events (global monotonic id = SSE Last-Event-ID cursor; 7d/50k cap -- 053) <---------+
                          | audit_log, notifications, activities (inherited)                                          |
                          | [Phase 2] chat_conversations, chat_participants, chat_read_states (055)                   |
                          | [Phase 2] presence_heartbeats (056)                                                      |
                          | [Phase 3] realtime_event_consumers (057)                                                 |
                          +-----------------------------------------------------------------------------------------+

  -- SCALE ADAPTER TIERS (DISABLED in Phase 1; SSE browser contract UNCHANGED across all tiers) ----------------------

  Phase 2 (broker seam, before multi-instance):
                          +-------------------------+        +---------------------------------+
   realtime_events row -->| Publisher interface     | -----> | Redis Streams adapter           |
                          | (local | redis-streams) |        | + realtime_event_consumers      |
                          | DB event ids STAY the   |        |   (consumer_id, partition_key,  |
                          | browser replay cursor   |        |    last_processed_event_number) |
                          +-------------------------+        +---------------------------------+
                                     |
                                     v  SSE instance reads WHERE id > per-consumer offset (Kafka-style cursor)

  Phase 2 (collab tier):  chat_conversations + chat_participants full ACL  -> replaces from/to predicate
                          chat_read_states derived last_read_seq cursor    -> emit chat.read only on advance
                          presence_heartbeats (SQLite ZSET-equiv -> Redis ZSET)
                          typing/presence EPHEMERAL channel (never persisted, never cursor-advancing)

  Phase 3 (true horizontal scale):
                          Postgres migration OR single-writer SQLite service
                          Redis Streams / NATS JetStream fanout
                          broker-lag + load tests (reconnect storms, fanout bursts, slow clients)
                          conversation_seq RECONSIDERED HERE ONLY (Postgres multi-writer)
                          PTY/gateway WebSockets stay sticky unless separately brokered
```

### Path numbering

1. Browser POSTs with a freshly-minted `client_message_id` (UUID) per logical send.
2. Server resolves sender identity server-side; runs durable writes inside ONE `BEGIN IMMEDIATE` transaction (message + activity + notification + outbox row). The outbox row commits BEFORE any gateway I/O.
3. AFTER commit, `eventBus.broadcast` fires — the originator message is broadcast BEFORE coordinator replies are generated (`D-BROADCAST-REORDER`).
4. Same-process live push to connected SSE viewers (best-effort fast path).
5. SSE frames are `id:` + `data:` only (never `event:`). Viewer receives `retry:` (jittered) + `connected` (no id) at open, then data events, then `replay.complete`.
6. Client `onmessage` dedups ONLY on real numeric `payload.id`; id-less volatile/control events bypass the Set.
7. Store reconciles the optimistic temp bubble to the real row by `client_message_id` (byte-identical `message_id` on retry).
8. Cross-process poll reads `WHERE id > cursor AND workspace_id=?` every `SSE_POLL_MS=1000` — the correctness floor guaranteeing a missed event recovers within ~1 s.

### Latency targets

| Path | Current | Target |
|---|---:|---:|
| Same-process commit → visible SSE frame | observed <100 ms | p95 <150 ms |
| Cross-process same-host DB-poll bridge | up to 1000 ms | replace before horizontal production (Phase 2) |
| Broker-backed cross-instance fanout | not present | p95 <250 ms (Phase 2/3) |
| Client optimistic render after send | immediate | <16 ms UI update |
| Reconnect gap repair | EventSource retry + replay | replay before live append; full resync if gap expired |

---

## 4. Write Path

```
Browser                Next API                          SQLite (single writer)              eventBus               SSE streams
  |                      |                                     |                                |                        |
  | POST /api/chat/      |                                     |                                |                        |
  |  messages            |                                     |                                |                        |
  |  client_message_id   |                                     |                                |                        |
  |--------------------->|                                     |                                |                        |
  |                      | requireRole('operator')             |                                |                        |
  |                      | resolve from = display_name||       |                                |                        |
  |                      |   username||'system' (D-COORD-FROM) |                                |                        |
  |                      | injection scan (if forward+to)      |                                |                        |
  |                      |------------BEGIN IMMEDIATE-------->|                                |                        |
  |                      |                                     | reserve unique client_         |                        |
  |                      |                                     |   message_id (ON CONFLICT      |                        |
  |                      |                                     |   DO NOTHING RETURNING id)     |                        |
  |                      |                                     | INSERT messages                |                        |
  |                      |                                     | logActivity('chat_message')    |                        |
  |                      |                                     | createNotification (if to)     |                        |
  |                      |                                     | INSERT realtime_events         |                        |
  |                      |                                     |   (chat.message) -- IN tx      |                        |
  |                      |<--COMMIT (messageId + eventId)------|                                |                        |
  |                      |                                     |                                |                        |
  |                      | eventBus.broadcast('chat.message',  |                                |                        |
  |                      |   {originator row})  AFTER commit   |                                |                        |
  |                      |   --- originator BEFORE coord -------|-------------------------------->|                        |
  |                      |                                     |                                | emit('server-event')   |
  |                      |                                     |                                |----------------------->| (live push)
  |                      |                                     |                                |                        | id:/data: frame
  |                      | (coordinator reply generation,      |                                |                        |
  |                      |  createChatReply, gateway I/O)      |                                |                        |
  |                      |                                     |                                |                        |
  |<--201 {message,      |                                     |                                |                        |
  |     forward}---------|                                     |                                |                        |
  |                      |                                     |                                |                        |
  |                      |              (cross-process viewers reached by the SSE_POLL_MS=1000 outbox poll)        |
```

Required invariants (all load-bearing, enforced by tests):

- **The HTTP response acknowledges durable commit, NOT socket delivery.** The 201 returns `{message, forward}`; the SSE frame is a projection of already-durable state, not the source of truth.
- **`BEGIN IMMEDIATE` is load-bearing.** better-sqlite3's `db.transaction` defaults to DEFERRED; per https://sqlite.org/lang_transaction.html §2.1 the `busy_timeout` handler is NOT reliably honored when a DEFERRED read upgrades to a write. A concurrent writer (MCP/CLI/cron) can surface `SQLITE_BUSY` mid-transaction despite the 5 s budget. Acquiring the reserved lock at `BEGIN` makes the timeout deterministic against the `SQLITE_BUSY_TIMEOUT_MS=5000` PRAGMA (`D-TX-OUTBOX`).
- **The outbox row lives INSIDE the transaction.** A crash between commit and SSE still delivers via the 1 s poller. There MUST be no window where the message is committed-but-SSE-invisible.
- **Broadcast fires only AFTER commit.** The in-process `eventBus.broadcast` is a best-effort accelerator (`D-SPINE`); reliability lives in the outbox + transaction.
- **Broadcast the originator BEFORE generating coordinator replies** (`D-BROADCAST-REORDER`). Fixes the reply-before-original ordering defect (`route.ts:108` broadcasts coordinator status before `:733` broadcasts the originator).
- **Duplicate sends with the same `client_message_id` return the FIRST committed message_id** (byte-identical, never a new autoincrement). Gateway idempotency key derived from `client_message_id`, NEVER `messageId+Date.now()` (`D-IDEMPOTENCY`).
- **Ephemeral events NEVER enter this path.** `chat.typing.*` and `presence.updated` are routed to a volatile broadcast that SKIPS the `realtime_events` INSERT and MUST NOT advance the cursor (`D-EPHEMERAL`).

---

## 5. Event Envelope

Every durable chat event follows ONE envelope. The SSE wire frame is `id:\n data:\n\n` ONLY — `formatSseFrame` (`realtime-events.ts:164-171`) NEVER emits `event:`. Clients receive everything via `EventSource.onmessage`.

### chat.message (durable, cursor-advancing)

```json
{
  "id": 18422,
  "type": "chat.message",
  "data": {
    "id": 812,
    "conversation_id": "coord:anthony:coordinator",
    "from_agent": "Anthony",
    "to_agent": "coordinator",
    "content": "Ship the plan.",
    "message_type": "text",
    "metadata": null,
    "workspace_id": 1,
    "created_at": 1782268800
  },
  "timestamp": 1782268800123
}
```

`id` = `realtime_events.id` (the global SSE cursor). `data` = the full `messages` row (including `workspace_id`, which is load-bearing for the workspace filter since `workspaceIdFromData` has no `chat.*` branch).

### chat.message.deleted (durable, cursor-advancing)

```json
{
  "id": 18423,
  "type": "chat.message.deleted",
  "data": { "id": 812, "conversation_id": "coord:anthony:coordinator", "workspace_id": 1 },
  "timestamp": 1782268800456
}
```

### chat.read (durable, cursor-advancing) — Phase 2 only

Emitted ONLY when `last_read_seq` actually advances. `data:{conversation_id, participant_id, last_read_seq}`.

### Control events (NOT durable, NEVER cursor-advancing, NO `id`)

| type | When emitted | data |
|---|---|---|
| `connected` | stream open | `null` (`/api/events`) or `{stream:'runs'}` (`/api/v1/runs/stream`) |
| `resync.required` | `lastSentId > 0 AND lastSentId < min(id)` at connect | `{reason:'retention-gap'}` |
| `replay.complete` | after `Last-Event-ID` replay finishes + live tailing begins (Discord RESUMED equivalent) | (none beyond `timestamp`) |

### Ephemeral events (Phase 2; NEVER persisted, NEVER cursor-advancing, NO `id`)

| type | family | Notes |
|---|---|---|
| `chat.typing.started` | `chat.ephemeral` | Volatile broadcast skips `realtime_events` INSERT. Exclude originator. |
| `chat.typing.stopped` | `chat.ephemeral` | Same guards as `typing.started`. |
| `presence.updated` | `chat.ephemeral` | View-scoped (subscribe, NOT broadcast). Ephemeral only. |

---

## 6. Data Model

Exact DDL from the contract. Migration IDs are normative. Phase-gated.

### Phase 0 (exists) — `053_realtime_events`

Durable SSE outbox / replay-cursor source. `realtime_events.id` (global monotonic autoincrement) = SSE `Last-Event-ID` cursor. Workspace-scoped. Retention 7 d / 50 000 rows soft cap.

```sql
-- migration 053_realtime_events (src/lib/migrations.ts:1463)
CREATE TABLE IF NOT EXISTS realtime_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  workspace_id INTEGER DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_realtime_events_workspace_id ON realtime_events(workspace_id, id);
CREATE INDEX IF NOT EXISTS idx_realtime_events_timestamp ON realtime_events(timestamp);
```

> Note: the inherited migration also created `idx_realtime_events_id ON realtime_events(id)` (`migrations.ts:1473`). This is a DEAD redundant index — `INTEGER PRIMARY KEY AUTOINCREMENT` is already the rowid index. Dropped in `054b`.

### Phase 1 — `054_chat_idempotency` (messages table)

Chat message durability base (inherited). Phase 1 adds `client_message_id` + the partial UNIQUE idempotency index. Ordering = `created_at ASC, id ASC` (NO `conversation_seq`).

```sql
-- migration 054_chat_idempotency
ALTER TABLE messages ADD COLUMN client_message_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_message_id
  ON messages(workspace_id, conversation_id, from_agent, client_message_id)
  WHERE client_message_id IS NOT NULL;
```

### Phase 1 — `054b_realtime_events_pragmas` (schema hardening, no logic change)

Audit P3-9. Raise `cache_size` (from `1000` ≈ 4 MB to `-65536` ≈ 64 MB resident), add `temp_store=MEMORY`, KEEP `wal_autocheckpoint` default 1000 (do NOT disable — sqlite.org/wal.html §2.3: disabling grows the WAL and degrades read latency). Drop the dead redundant index. Add to the `PRAGMA` block in `src/lib/db.ts` (currently `:46-52`).

```sql
-- PRAGMA additions in src/lib/db.ts PRAGMA block
PRAGMA cache_size = -65536;
PRAGMA temp_store = MEMORY;
-- wal_autocheckpoint stays default 1000
DROP INDEX IF EXISTS idx_realtime_events_id;
```

Current PRAGMA state (`src/lib/db.ts:46-52`): `journal_mode=WAL`, `synchronous=NORMAL`, `cache_size=1000`, `busy_timeout=5000`. No `temp_store`, no `wal_autocheckpoint`, dead `idx_realtime_events_id` present.

### Phase 2 — `055_chat_conversations`

Explicit conversation metadata (replaces deriving conversations from `messages`). Full membership tier + derived read-receipt cursor.

```sql
-- migration 055_chat_conversations
CREATE TABLE IF NOT EXISTS chat_conversations (
  id TEXT PRIMARY KEY,
  workspace_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'dm',
  created_by TEXT,
  last_message_id INTEGER,
  last_message_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_workspace
  ON chat_conversations(workspace_id, last_message_at);

CREATE TABLE IF NOT EXISTS chat_participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(conversation_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_participants_conversation
  ON chat_participants(conversation_id);

-- Derived-cursor read receipts (Chatwoot/Rocket.Chat lr).
-- UPSERT with MAX(current,new); unread derived by SQL. NOT a per-message ack table.
-- Emit chat.read only when last_read_seq advances.
CREATE TABLE IF NOT EXISTS chat_read_states (
  participant_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  last_read_seq INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(participant_id, conversation_id)
);
```

### Phase 2 — `056_chat_presence`

Ephemeral online state, SQLite ZSET-equivalent (swap to Redis ZSET at broker phase). `online = last_seen_at > now - TTL`. Two-tier TTL agents 20 s / widget 90 s. Bounded DELETE on read.

```sql
-- migration 056_chat_presence
CREATE TABLE IF NOT EXISTS presence_heartbeats (
  user_id TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT 'workspace',
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_presence_heartbeats_scope
  ON presence_heartbeats(scope, last_seen_at);
```

### Phase 3 — `057_realtime_consumers`

Broker consumer-offset table (event-driven.io outbox/inbox). Each SSE instance reads `WHERE id > offset` instead of polling all rows. Kafka-style per-consumer cursor. NOT needed single-node.

```sql
-- migration 057_realtime_consumers
CREATE TABLE IF NOT EXISTS realtime_event_consumers (
  consumer_id TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  last_processed_event_number INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY(consumer_id, partition_key)
);
```

### DROPPED — `conversation_seq`

`conversation_seq` is DROPPED for single-writer synchronous SQLite (decision `D-NO-CONVSEQ`, item `I4-DROPPED`). Conversation display ordering = `messages.created_at ASC, id ASC` tie-breaker (audit P3-1). The SSE replay/durability cursor is the GLOBAL `realtime_events.id` ONLY. `conversation_seq` is reconsidered ONLY at Postgres multi-writer (Phase 3).

---

## 7. Transport Decision

### SSE for durable chat fanout

SSE matches Opzava's durable chat needs (`D-SPINE`):

- Server→client event stream suffices because writes happen through HTTP POST.
- `EventSource` has native reconnect + `Last-Event-ID` (https://html.spec.whatwg.org/multipage/server-sent-events.html).
- Normal HTTP infrastructure + cookies; multiplexes all app events through ONE stream.
- The current code already implements bounded stream behavior, heartbeats, replay, slow-client close.

**Non-negotiable deployment condition:** HTTP/2 at the reverse proxy, OR a single-tab leader strategy. Per https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events SSE over HTTP/1.1 hits a ~6-connection-per-browser-per-domain cap. Opzava MUST keep exactly ONE multiplexed SSE stream and MUST NEVER open per-conversation streams.

### WebSocket for PTY / gateway / ephemeral ONLY

WebSocket (`D-WS-SEPARATE`) is NOT canonical durable chat transport. Durable chat on WebSocket would still require the same DB/outbox/replay/idempotency/membership/reconnect logic, PLUS sticky connection state, custom auth/reconnect, and manual backpressure (https://developer.mozilla.org/en-US/docs/Web/API/WebSocket). Use WebSocket ONLY for:

- PTY terminal I/O (`src/lib/pty-websocket.ts`).
- External gateway session control (`src/lib/websocket.ts`).
- Phase 2 ephemeral typing/presence IF SSE latency is insufficient.

Durable message recovery ALWAYS comes from the DB/outbox cursor, never from a socket.

### WebTransport — NOT yet

Not the production baseline for self-hosted internal chat. Adds HTTP/3/QUIC + proxy/firewall complexity without solving durable message semantics.

---

## 8. Broker Decision

| Broker | Phase | Decision | Use |
|---|---|---|---|
| Local `EventEmitter` (`event-bus.ts`) | Phase 1 | KEEP | Same-process best-effort ACCELERATOR (`D-SPINE`). Optimize freely. |
| SQLite outbox 1 s poll | Phase 1 | KEEP | Cross-process same-host bridge. The 1 s poll is a CORRECTNESS parameter — the floor guaranteeing a missed event recovers within ~1 s. MUST stay at-least-once, monotonic (`id > cursor`), NEVER coalesce/drop under load (`SSE_POLL_MS=1000`). |
| Redis Pub/Sub | Phase 2 | Optional | Wakeup for EPHEMERAL events only. At-most-once (https://redis.io/docs/latest/develop/pubsub/) — acceptable for typing, NEVER for durable history. |
| Redis Streams | Phase 2/3 | First external broker (`I8`) | Durable fanout adapter + `realtime_event_consumers` per-consumer cursor. SSE browser contract UNCHANGED. |
| Postgres `LISTEN/NOTIFY` | Phase 3 | Wakeup only | Post-migration. Delivers after commit, preserves order, but payload-limited and NOT a durable log — use only to wake listeners to fetch rows (https://www.postgresql.org/docs/current/sql-notify.html). |
| NATS JetStream | Phase 3 | Deferred (`I15`) | ONLY if Opzava becomes a broader multi-service event fabric (https://docs.nats.io/nats-concepts/jetstream). |

The in-process `eventBus` is a fanout ACCELERATOR, not a reliability layer (Slack framing: reliability lives in the SQLite outbox + write transaction). This decides what MAY be optimized (the bus) vs. what MUST be hardened (the outbox + write transaction).

---

## 9. Authorization Model

**Phase 1:** `workspace_id` remains the trust boundary (`D-MEMBERSHIP-PREDICATE`). Minimal chat privacy = a `from`/`to` predicate at the `sendEvent` boundary:

- For `chat.*` events, DROP unless viewer identity matches `message.from_agent` OR `message.to_agent`, OR viewer role is `operator`/`admin`.
- Apply the SAME predicate in the `replayFromStore` path (live + replay parity).
- Zero schema change — `from_agent`/`to_agent` are already on the row.

**Phase 1 sender resolution (`D-COORDINATOR-FROM`, audit P0-1):** `body.from` MUST NOT be honored for human sessions. `from` is ALWAYS resolved server-side: `auth.user.display_name || auth.user.username || 'system'`. The coordinator override is allowed ONLY when authenticated with the coordinator agent's scoped API key (`auth.user.agent_name === COORDINATOR_AGENT` via `agent_api_keys`). Current code at `src/app/api/chat/messages/route.ts:336-340` does a pure string match on `body.from === 'coordinator'` — this is the load-bearing integrity fix.

**Phase 2:** full `chat_participants` membership tier replaces the predicate; `chat_conversations` provides explicit conversation metadata (replacing the derive-from-messages pattern); per-eventName subscription index `Map<topic, Set<connection>>` where `topic = chat.conv:{conversationId}` (Rocket.Chat `subscriptionsByEventName` pattern).

---

## 10. Failure Handling

Every sad path + required behavior, from the audit. Deterministic acceptance = a test assertion.

| Failure | Sad path | Required behavior | Test/verification |
|---|---|---|---|
| Coordinator spoof (`D-COORDINATOR-FROM`, P0-1) | Operator POSTs `{from:'coordinator', to:<victim>}`; route treats `from==='coordinator'` as a privileged override (`route.ts:336-340`) and inserts as `from_agent='coordinator'` with no verification. | Stop honoring `body.from` for human sessions. Override honored ONLY when `auth.user.agent_name === COORDINATOR_AGENT`. | `node --test test/chat-coordinator-spoof.test.mjs` — operator token POST with `from:coordinator` asserts `from==operator display_name`; coordinator agent_api_key asserts `from==coordinator`. |
| Write-path orphan (P1-1) | Message INSERT (`:374`), `logActivity` (`:389`), `createNotification` (`:401`), outbox (`:733`) are 4 independent auto-commits. A kill between any two leaves half-state (e.g. message row with NO outbox row → permanently SSE-invisible). | Wrap message+activity+notification+outbox INSERT in ONE `db.transaction(()=>{...}, { begin:'IMMEDIATE' })`. `eventBus.broadcast` AFTER commit. Outbox row INSIDE tx. | `node --test test/chat-tx-atomicity.test.mjs` — inject throw between writes, assert all-or-nothing. |
| Committed-but-SSE-invisible + reply-before-original (P1-2) | Outbox write positioned after ~21 s gateway I/O; `createChatReply` (`:108`) broadcasts coordinator status BEFORE originator (`:733`). | Move outbox insert INTO the message-insert tx (commits before gateway I/O). Broadcast originator BEFORE coordinator replies. | `node --test test/chat-broadcast-order.test.mjs` — assert originator frame seq < coordinator status frame seq on same SSE connection. |
| Duplicate send (P1-3, `D-IDEMPOTENCY`) | POST commits row 42; 201 lost; Retry re-POSTs; server inserts row 43; gateway runs the agent a SECOND time (`mc-${messageId}-${Date.now()}` non-deterministic). | `INSERT ... ON CONFLICT(...) DO NOTHING RETURNING id`; if RETURNING empty, SELECT existing id → retry returns byte-identical `message_id` 42. Gateway key derived from `client_message_id`. | `node --test test/chat-idempotency.test.mjs` — POST twice, assert same id + single row. |
| Replay gap expired (P1-4, `D-RESYNC-SENTINEL`, `D-REPLAY-COMPLETE`) | Tab backgrounded >7 d; browser keeps `Last-Event-ID=N`; `readServerEventsAfter` returns only the newest ≤200 rows — permanent silent gap, no client signal. | At connect, `SELECT min(id) WHERE workspace_id=?`. If `parseLastEventId > 0 AND lastSentId < min(id)`, emit `{type:'resync.required', data:{reason:'retention-gap'}}` (NO id), set `lastSentId = min(id)-1`. Do NOT partial-replay across a known gap. After replay, emit `{type:'replay.complete'}` (NO id). | `node --test test/sse-resync.test.mjs`; `node --test test/sse-replay-complete.test.mjs`. |
| Static-only smoke test (P1-5, `D-SMOKE-TEMPORAL`) | `dokploy-parity-test.sh` curls for `retry: 5000` + `connected` (both emitted at stream open) — a proxy buffering AFTER the initial flush passes green. | Make the test temporal: open SSE conn, POST a workspace-scoped event from a second authenticated curl, assert the matching data frame on the SAME open conn within ~3 s. Do NOT add Traefik `flushInterval` labels (dead config — Traefik v3 auto-detects `text/event-stream`). | `bash scripts/dokploy-parity-test.sh` (assert temporal pass). |
| Cross-thread leak (P2-1, `D-MEMBERSHIP-PREDICATE`) | Two operators in the same workspace but different DM threads receive each other's `chat.*` events (live AND replay) — the only boundary is `workspace_id`. | At `sendEvent`, for `chat.*` events drop unless viewer matches `from_agent`/`to_agent` OR role operator/admin. Same predicate in replay. | `node --test test/sse-chat-membership.test.mjs` — two viewers, assert cross-thread delivery blocked. |
| Reconnect storm (P2-3, `D-JITTER-RETRY`) | Deploy drops all sockets simultaneously; every browser reconnects at the fixed 5 s mark (lockstep). | Per-connection jittered retry frame: `retry = SSE_RETRY_BASE_MS + Math.floor(Math.random()*SSE_RETRY_JITTER_MS)` → [3000,7000) ms. AWS Full-Jitter. Re-emit on each (re)connect. Zero new client code. | `node --test test/sse-retry-jitter.test.mjs` — sample N frames, assert distribution across the window. |
| SIGTERM hard-kill (P2-4, `D-GRACEFUL-DRAIN`) | `mc-server.cjs:43-49` SIGTERM calls only `disposePtysOnly()`; HTTP server never `.close()`'d → every SSE viewer hard-drops. | Retain server ref from `patchCreateServer`; on SIGTERM `server.close()` + bounded `setTimeout(DRAIN_GRACE_MS=2000)` then `disposePtysOnly()`. NO draining-flag/resync.broadcast subsystem — durable replay is the safety net. | `docker compose up -d --build`; assert SSE viewers reconnect within ~5 s without data loss; `grep mc-server.cjs` for `server.close()`. |
| Latching warn + volatile mis-dedupe (P2-5, `D-VOLATILE-DEDUP-FIX`) | One `recordServerEvent` throw sets `recordingFailureLogged=true` (never reset, `event-bus.ts:47,73`); id-less volatile event falls back to sticky prior `event.lastEventId` → mis-deduped and skipped (`use-server-events.ts:64`). | (1) Reset `recordingFailureLogged=false` after successful `recordServerEvent` (or rate-limit warn to 1/60 s). (2) Dedup ONLY when `payload.id` is a real number — id-less volatile events bypass the Set. | `node --test test/event-bus-recording-failure.test.mjs`; `node --test test/use-server-events-volatile.test.mjs`. |
| SSE disconnect | Connection drops. | EventSource reconnects with `Last-Event-ID`; server replays gap (`id > cursor`). | Covered by resync/replay tests. |
| Slow browser | Stream queue exceeds high-water mark (`controller.desiredSize<=0`, `events/route.ts:59-67`). | Close stream; reconnect repairs from event id (replay after reconnect). | Existing behavior (`SSE_STREAM_HIGH_WATER_MARK=256`). |
| SQLite busy | Concurrent writer (MCP/CLI/cron). | `BEGIN IMMEDIATE` + `busy_timeout=5000` make the timeout deterministic. Keep transactions short. | `SQLITE_BUSY_TIMEOUT_MS=5000` (`src/lib/db.ts:52`). |
| App instance restart | All sockets drop. | Client reconnects; durable outbox rows replayed via 1 s poll + `Last-Event-ID`. | Covered by drain test. |
| Broker outage (Phase 2/3) | Redis/NATS down. | DB writes stay available; local same-process fanout continues; poll/outbox catches up when broker returns. | Phase 3 load tests. |

---

## 11. Rollout Phases

### Phase 1 — Harden single-node user chat (MUST COMPLETE before flipping chat on for real users)

Closes all P0/P1 production-readiness gaps. Set of work items (each has deterministic acceptance + verification in the ledger):

- `I13` — Stop honoring `body.from`; coordinator override via agent-scoped key only (P0-1). `src/app/api/chat/messages/route.ts:336-340`; `src/lib/auth.ts`.
- `I6` — Transactional outbox: message+activity+notification+outbox in ONE `BEGIN IMMEDIATE` tx (P1-1). `src/app/api/chat/messages/route.ts`; `src/lib/realtime-events.ts`; `src/lib/event-bus.ts`.
- `I-broadcast-reorder` — Outbox inside tx + broadcast originator before coordinator replies (P1-2). `src/app/api/chat/messages/route.ts`.
- `I2` — `client_message_id` write idempotency (P1-3). `src/lib/migrations.ts` (`054_chat_idempotency`); `src/app/api/chat/messages/route.ts`; `src/store/index.ts`; `src/components/chat/message-list.tsx`.
- `I-resync` — `resync.required` sentinel + `replay.complete` marker (P1-4). `src/app/api/events/route.ts`; `src/lib/use-server-events.ts`.
- `I11` — Temporal SSE smoke test (P1-5). `scripts/dokploy-parity-test.sh`.
- `I3-predicate` — Minimal from/to membership predicate at `sendEvent` + replay (P2-1). `src/app/api/events/route.ts`.
- `I9-jitter` — Jittered per-connection retry frame (P2-3). `src/lib/realtime-events.ts`; both SSE routes.
- `I10-minimal` — Minimal graceful drain (P2-4). `scripts/mc-server.cjs:43-49`.
- `I16` — `recordingFailureLogged` reset + volatile-event client dedup fix (P2-5). `src/lib/event-bus.ts:47,73`; `src/lib/use-server-events.ts:64-66`.
- `I12-phase1` — In-process realtime observability module + `GET /api/ops/chat-metrics` (P3-5). `src/opzava/platform/observability/realtime-metrics.ts`; `src/app/api/ops/chat-metrics/route.ts`.
- `I18` — SSE-safe proxy config matrix (docs + compose).
- `I20` — DRY shared SSE module; honor `?types=` in `/api/v1/runs/stream`. `src/lib/sse-stream.ts`; both SSE routes.
- `I-doctor` — Chat doctor at `GET /api/ops/chat-doctor`. `src/lib/chat-doctor.ts`; `src/app/api/ops/chat-doctor/route.ts`.
- `I-health` — Push Realtime Chat health check into `performHealthCheck()`. `src/app/api/status/route.ts` (near `:597`); `src/lib/connectivity-health.ts`.
- `I4` `conversation_seq` DROPPED here — ordering = `created_at ASC, id ASC`.

### Phase 2 — Broker adapter seam + full collaboration tier (before multi-instance production)

SSE browser contract UNCHANGED. Set:

- `I-conv-tables` — `chat_conversations` + `chat_participants` full membership tier (replaces Phase 1 from/to predicate). `055_chat_conversations`; per-eventName subscription index `Map<topic, Set<connection>>`.
- `I5` — `chat_read_states` derived cursor (UPSERT MAX; emit `chat.read` only on advance).
- `I14` — Typing/presence ephemeral channel (`presence_heartbeats` now → Redis ZSET behind same interface at broker phase).
- `I8` (partial) — Redis Streams broker adapter + `realtime_event_consumers` (`057`); keep DB event ids as browser replay cursors.
- `I19-conditional` — Web Locks leader-tab collapse — add ONLY if multi-tab users hit HTTP/1.1 connection limits in non-HTTP/2 environments.

### Phase 3 — True horizontal scale (before multi-host production)

- `I8` — Redis Streams / NATS JetStream fanout; broker-lag + load tests (reconnect storms, fanout bursts, slow clients).
- `I15` — Postgres migration OR single-writer SQLite service. `conversation_seq` RECONSIDERED HERE ONLY (Postgres multi-writer) — the only point `I4` is revisited.
- PTY/gateway WebSockets stay sticky unless separately brokered.

---

## 12. Endpoints

| Method | Path | Role | Purpose |
|---|---|---|---|
| POST | `/api/chat/messages` | operator | Durable chat write. Sender identity resolved server-side. Coordinator override only via agent-scoped key. Message+activity+notification+outbox in ONE `BEGIN IMMEDIATE` tx; broadcast AFTER commit; broadcast originator BEFORE coordinator replies. |
| GET | `/api/chat/messages` | viewer | List messages. ORDER BY `created_at ASC, id ASC` (add `, id ASC` tie-breaker, P3-1). |
| GET | `/api/events` | viewer | Primary multiplexed SSE. `Last-Event-ID` replay cursor = `realtime_events.id`. Honors `?types=`. Phase 1: resync.required + replay.complete + from/to predicate + jittered retry. |
| GET | `/api/v1/runs/stream` | viewer | SSE of Agent-Run-Protocol events. Phase 1: honor `?types=` (currently IGNORED); share extracted SSE module. |
| GET | `/api/ops/chat-metrics` | admin | Realtime observability. In-process counters, no metrics backend. |
| GET | `/api/ops/chat-doctor` | admin | Chat health doctor (`DoctorStatus` shape, single-flight + TTL cache). |
| GET | `/api/status?action=health` | viewer | Full health; chat check PUSHED in `performHealthCheck()` near `status/route.ts:597`. |
| GET | `/api/health` | anonymous | Liveness probe (orchestrator). No chat logic. |

POST `/api/chat/messages` request: `{to?, content(required), message_type?('text'|'status'|'tool_call', default text), conversation_id?, client_message_id(UUID, required for idempotency), metadata?, forward?, sessionKey?, attachments?}`. `body.from` MUST NOT be honored for human sessions. Response: `201 {message: MessageRow, forward: ForwardInfo|null}` — byte-identical on retry. `400` missing content; `422` injection blocked; `500` failure.

GET `/api/events` response: `text/event-stream`. `retry: <base+jitter>`. Frames: `connected` (no id), data events, `resync.required` (no id) when `lastSentId<min(id)`, `replay.complete` (no id) after replay. Heartbeat `': heartbeat\n\n'` every 15 s. Headers: `Cache-Control:no-cache,no-transform`; `Connection:keep-alive`; `X-Accel-Buffering:no`. runs/stream additionally sets `X-Agent-Run-Protocol:0.1.0`.

---

## 13. Constants

All in `src/lib/realtime-events.ts` unless noted. Normative.

| Constant | Value | Purpose |
|---|---|---|
| `SSE_RETRY_MS` | `5000` ms | BASE value. Phase 1: replaced by jittered `SSE_RETRY_BASE_MS + random(0, SSE_RETRY_JITTER_MS)` (`D-JITTER-RETRY`). Retained as base default. |
| `SSE_RETRY_BASE_MS` | `3000` ms | Phase 1 new. Base of jittered retry frame. |
| `SSE_RETRY_JITTER_MS` | `4000` ms | Phase 1 new. Jitter window. `retry = base + Math.floor(Math.random()*jitter)`. |
| `SSE_HEARTBEAT_MS` | `15000` ms | Comment heartbeat (`': heartbeat\n\n'`). MUST stay below every reverse-proxy idle timeout. |
| `SSE_POLL_MS` | `1000` ms | Per-connection cross-process outbox poll. CORRECTNESS parameter — the floor guaranteeing a missed event recovers within ~1 s. MUST stay at-least-once, monotonic, never coalesce/drop. |
| `SSE_REPLAY_LIMIT` | `200` rows | Max rows per replay scan. Paired with `resync.required` sentinel. |
| `SSE_RETENTION_MS` | `604800000` ms (7 d) | `realtime_events` age retention. |
| `SSE_RETENTION_MAX_ROWS` | `50000` rows | Soft row cap (non-atomic SELECT-then-DELETE). P3-4: move prune off broadcast hot path to boot-started 60 s `setInterval`. |
| `SSE_PRUNE_INTERVAL_MS` | `60000` ms | Global prune throttle. P3-4: dedicated boot-started timer. |
| `SSE_STREAM_HIGH_WATER_MARK` | `256` frames | ReadableStream highWaterMark; slow-client close threshold (`controller.desiredSize<=0`). |
| `MAX_DEDUPED_EVENT_IDS` | `500` entries | Client in-memory LRU Set. Phase 1: dedupe ONLY when `payload.id` is a real number. |
| `COORDINATOR_AGENT` | `process.env.MC_COORDINATOR_AGENT \|\| ... \|\| 'coordinator'` | Coordinator identity. Override honored ONLY when `auth.user.agent_name === COORDINATOR_AGENT`. `src/app/api/chat/messages/route.ts`. |
| `DRAIN_GRACE_MS` | `2000` ms | Phase 1 new. Bounded wait after `server.close()` on SIGTERM. `scripts/mc-server.cjs`. |
| `SQLITE_BUSY_TIMEOUT_MS` | `5000` ms | `PRAGMA busy_timeout`. Load-bearing with `BEGIN IMMEDIATE`. `src/lib/db.ts:52`. |
| `SQLITE_CACHE_SIZE` | `-65536` (KiB, ≈64 MB) | P3-9: raise from `1000`. `src/lib/db.ts:48`. |
| `PRESENCE_TTL_AGENT_MS` | `20000` ms | Phase 2. Agent presence expiry. |
| `PRESENCE_TTL_WIDGET_MS` | `90000` ms | Phase 2. Widget/browser presence expiry. |

---

## 14. Observability

Phase 1: lightweight in-process counter module, NO metrics backend (`D-OBSERVABILITY`).

| Metric | Type | Source |
|---|---|---|
| `opzava_chat_active_sse_connections` | gauge | In-process counter; `GET /api/ops/chat-metrics` field `activeSseConnections`. Label `route(/api/events\|/api/v1/runs/stream)`. |
| `opzava_chat_delivery_lag_p95_ms` | gauge | Rolling p95 of `Date.now() - event.timestamp` at `sendEvent` delivery. Field `deliveryLagP95Ms`. |
| `opzava_realtime_event_rows` | gauge | `SELECT COUNT(*) FROM realtime_events`. Field `realtimeEventRows`. Watch drift toward `SSE_RETENTION_MAX_ROWS=50000`. |
| `opzava_chat_outbox_poll_iterations_total` | counter | Phase 3 only. Not emitted Phase 1. |
| `opzava_chat_broker_lag_ms` | histogram | Phase 2/3 only (Redis Streams adapter). Dropped from Phase 1. |
| `opzava_chat_write_path_p99_ms` | histogram | Phase 3 only. The real user SLA (Slack persist-before-fanout). Not instrumented Phase 1. |

### Health check — `realtime-chat`

Name `Realtime Chat`. PUSHED in `performHealthCheck()` near `src/app/api/status/route.ts:597` (`HealthCheckEntry` shape from `src/lib/connectivity-health.ts:18-24`).

- **healthy**: `activeSseConnections>=0`, `realtimeEventRows < SSE_RETENTION_MAX_ROWS` (50000), `deliveryLagP95Ms < 1000`, idempotency index `idx_messages_client_message_id` present, drain handler wired.
- **warning**: `realtimeEventRows >= 40000` (80% cap) OR `deliveryLagP95Ms` 1000–2500 OR `recordingFailureLogged` latched.
- **critical**: `realtimeEventRows >= 50000` (cap reached, prune failing) OR `deliveryLagP95Ms > 5000` OR `messages` missing `client_message_id` column OR outbox poll throwing.

### Chat doctor — `GET /api/ops/chat-doctor` (admin)

Follows the route-local `DoctorStatus` shape from `/api/openclaw/doctor`: `{level, category, healthy, summary, issues, canFix}`, `level 'healthy'|'warning'|'error'`, `category 'config'|'state'|'security'|'general'`. OpenClaw doctor is now a Docker sidecar health probe; do not depend on a local `openclaw doctor` parser. Headers `Cache-Control:no-store`.

Checks (each `canFix` per contract):

| id | category | summary | canFix |
|---|---|---|---|
| `chat-write-atomicity` | state | POST wraps message+activity+notification+outbox INSERT in one `BEGIN IMMEDIATE` tx; broadcasts AFTER commit. | false |
| `chat-idempotency-index` | state | `messages.client_message_id` column + partial UNIQUE `idx_messages_client_message_id` exist. | true |
| `chat-sse-resync-wiring` | config | `/api/events` emits `resync.required` when `lastSentId < min(id)` and `replay.complete` after replay. | false |
| `chat-ephemeral-guard` | security | `event-bus.ts` routes ephemeral types to a volatile broadcast that skips the `realtime_events` INSERT. | false |
| `chat-drain-handler` | config | `mc-server.cjs` SIGTERM calls `server.close()` + bounded `DRAIN_GRACE_MS` before `disposePtysOnly()`. | false |
| `chat-coordinator-from-guard` | security | `body.from` not honored for human sessions; override requires `auth.user.agent_name === COORDINATOR_AGENT`. | false |
| `chat-sse-dry-module` | general | `/api/events` and `/api/v1/runs/stream` share an extracted SSE module; runs/stream honors `?types=`. | false |

---

## 15. Deployment & Proxy Matrix

SSE-safe proxy config per deployment target (`D-PROXY-MATRIX`, `I18`):

| Target | Config |
|---|---|
| nginx | `proxy_read_timeout 3600s; proxy_buffering off; proxy_ignore_headers X-Accel-Buffering;` (nginx default `proxy_read_timeout=60s` kills SSE). |
| Traefik | Buffering middleware OFF. Traefik v3 auto-detects `text/event-stream` and IGNORES `responseForwarding.flushInterval` — do NOT add `flushInterval` labels (dead config). Verify no `respondingTimeouts` killing the stream. |
| Cloudflare | Heartbeat `<100s`; expect `524` after ~100–120 s and observed buffering to ~100 KB regardless of heartbeat. The 15 s `SSE_HEARTBEAT_MS` keeps CF happy; long-lived CF-fronted deployments need the documented caveat. |
| Reverse proxy general | HTTP/2 preferred (SSE/HTTP/1.1 ~6-conn/browser cap). Never open per-conversation SSE streams. |

Mandatory SSE response headers (both routes): `Cache-Control: no-cache, no-transform`; `Connection: keep-alive`; `X-Accel-Buffering: no`. runs/stream additionally: `X-Agent-Run-Protocol: 0.1.0`.

Env: `OPZAVA_SSE_RETRY_BASE_MS=3000`, `OPZAVA_SSE_RETRY_JITTER_MS=4000`, `OPZAVA_DRAIN_GRACE_MS=2000` (optional overrides); `MC_COORDINATOR_AGENT=coordinator`; `MISSION_CONTROL_DB_PATH=<data-dir>/mission-control.db`; `NEXT_PUBLIC_GATEWAY_OPTIONAL=true` (disables gateway reconnect for standalone); `MC_DOCTOR_TTL_MS=30000` (TTL cache convention reused by the chat doctor).

---

## 16. Deferred / Explicitly Dropped (so they are not silently re-invented)

- **`I17` — Client half-open watchdog on `lastRecv` (Discord `heartbeat_timeout`):** DEFERRED. Native EventSource + the 15 s server heartbeat + jittered retry + `resync.required` sentinel together cover liveness at internal scale. Reassess ONLY if half-open proxies are observed.
- **`I4` — `conversation_seq`:** DROPPED for single-writer SQLite. Ordering = `created_at ASC, id ASC`. Reconsidered ONLY at Postgres multi-writer (Phase 3).
- **`I19` — Web Locks leader-tab collapse:** Phase 2, CONDITIONAL — add ONLY if multi-tab users hit HTTP/1.1 connection limits in non-HTTP/2 environments.
- **Single-reader-per-process SSE refactor:** REJECTED as over-engineering (audit P2-2 refutation — WAL readers do not block writers; the indexed 200-row range scan is rounding-error load at internal scale).

---

## 17. Sources

External (primary-source research + reusable patterns):

- HTML spec SSE (reconnect, Last-Event-ID, retry, empty-id reset, comment heartbeat): https://html.spec.whatwg.org/multipage/server-sent-events.html
- MDN SSE + HTTP/1.1 6-conn cap: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- MDN WebSocket (no auto backpressure): https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- SQLite transactions (DEFERRED/IMMEDIATE + busy_timeout-on-upgrade): https://sqlite.org/lang_transaction.html
- SQLite WAL (readers/writers concurrency, WAL-growth latency, SQLITE_BUSY): https://sqlite.org/wal.html
- SQLite PRAGMA (synchronous, busy_timeout, cache_size, temp_store, wal_autocheckpoint): https://sqlite.org/pragma.html
- better-sqlite3 performance (WAL, checkpoint starvation): https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md
- Discord gateway + opcodes + RESUMED: https://docs.discord.com/developers/events/gateway , https://docs.discord.com/developers/events/gateway-events
- discord.js WebSocketShard (resume, heartbeat, monotonic seq guard): https://github.com/discordjs/discord.js/blob/main/packages/ws/src/ws/WebSocketShard.ts
- Matrix spec + Synapse (single-writer-monotonic stream_id in tx; EDU/PDU durable/ephemeral split): https://spec.matrix.org/v1.13/client-server-api/ , https://github.com/element-hq/synapse/blob/develop/docs/development/synapse_architecture/streams.md
- Mattermost post.go (client-supplied idempotency; AGPL, pattern only): https://github.com/mattermost/mattermost/blob/master/server/channels/app/post.go
- Zulip events-system (after-commit dispatch, queue-then-fetch-then-drain; Apache-2.0): https://github.com/zulip/zulip/blob/main/docs/subsystems/events-system.md , https://github.com/zulip/zulip/blob/main/zerver/tornado/django_api.py
- Rocket.Chat streamer (per-eventName subscription index `Map<topic,Set<res>>`; source-available, pattern only): https://github.com/RocketChat/Rocket.Chat/blob/develop/apps/meteor/server/modules/streamer/streamer.module.ts
- Chatwoot (read-receipt derived cursor; Redis sorted-set presence; MIT, pattern only): https://github.com/chatwoot/chatwoot/blob/develop/app/models/conversation.rb , https://github.com/chatwoot/chatwoot/blob/develop/lib/online_status_tracker.rb
- event-driven.io outbox/inbox + consumer-offset table: https://event-driven.io/en/outbox_inbox_patterns_and_delivery_guarantees_explained/
- Slack engineering (persist-before-fanout; transient events not persisted; view-scoped presence): https://slack.engineering/real-time-messaging/ , https://slack.engineering/scaling-datastores-at-slack-with-vitess/ , https://slack.engineering/flannel-an-application-level-edge-cache-to-make-slack-scale/
- AWS Full-Jitter: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- PostgreSQL NOTIFY (transactional delivery, payload-limited): https://www.postgresql.org/docs/current/sql-notify.html
- Redis Pub/Sub (at-most-once): https://redis.io/docs/latest/develop/pubsub/
- NATS JetStream: https://docs.nats.io/nats-concepts/jetstream
- nginx proxy module (proxy_buffering, X-Accel-Buffering, proxy_read_timeout): https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- Cloudflare 524: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/
- Web Locks API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API

Opzava internal (code verified, file:line):

- `src/app/api/chat/messages/route.ts` (`:336-340` coordinator override, `:374` INSERT, `:389` logActivity, `:401` createNotification, `:284` ORDER BY, `:108` createChatReply broadcast, `:733` originator broadcast)
- `src/app/api/events/route.ts` (`:27` workspace, `:37` lastSentId, `:59-67` slow-client close, `:77-90` sendEvent, `:92-100` replayFromStore, `:102-103` retry+connected frames, `:116` poll, `:119-121` heartbeat, `:148` X-Accel-Buffering)
- `src/app/api/v1/runs/stream/route.ts` (`:18-23,76` hardcoded RUN_EVENT_TYPES ignores `?types=`, `:101` connected, `:144` X-Agent-Run-Protocol)
- `src/lib/realtime-events.ts` (`:4` SSE_RETRY_MS, `:48-56` workspaceIdFromData no chat.* branch, `:94` recordServerEvent, `:110-130` pruneRealtimeEvents, `:132` readServerEventsAfter, `:164-171` formatSseFrame, `:173-175` formatSseRetryFrame)
- `src/lib/event-bus.ts` (`:47,73` latching recordingFailureLogged, `:64-80` broadcast records-then-emits)
- `src/lib/use-server-events.ts` (`:23` MAX_DEDUPED_EVENT_IDS, `:64` dedup keyed on payload.id||sticky lastEventId)
- `src/lib/db.ts` (`:46-52` PRAGMA block: WAL, synchronous=NORMAL, cache_size=1000, busy_timeout=5000)
- `src/lib/migrations.ts` (`:64-74` messages table, `:1463` 053_realtime_events, `:1473` dead idx_realtime_events_id)
- `src/app/api/chat/conversations/route.ts` (`:65` ORDER BY created_at DESC)
- `scripts/mc-server.cjs` (`:31-41` patchCreateServer, `:43-49` SIGTERM disposePtysOnly only)
- `docs/architecture/realtime-chat-production-review.md` (audit §1–§10)

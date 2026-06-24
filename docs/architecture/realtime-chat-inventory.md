# Opzava Realtime Chat — Integration Inventory (machine-readable)

> THE artifact for wiring realtime chat into Opzava's centralized logging, doctor, health checks, metrics, and ops surfaces — the **ops/logging/doctor/health registry**. Every registry below carries the EXACT integration target (`file:line`) so an implementing agent knows where to write code. Names are copied verbatim from the canonical contract — do NOT rename.
>
> Scope: single-node SQLite (better-sqlite3, synchronous, WAL + `busy_timeout=5000`), internal AI team. Multi-instance broker concerns are Phase 2/3 and tracked in `docs/architecture/realtime-chat-ledger.md`.
>
> Conformance source: the single source of truth is `docs/architecture/realtime-chat-architecture.md` (canonical architecture spec); the verbatim contract tables (decisions D-SPINE … D-BROKER, events, schema, endpoints, constants) are carried in `docs/architecture/realtime-chat-ledger.md`. This doc is the registry view of that contract. Brand: say Opzava, never Mission Control.

---

## How to use this inventory

Each section is a registry keyed by a stable identifier. Every row MUST be wired at the cited `file:line`. When a target file does not yet exist (new route / new module), the `target` column names the path to CREATE, and the acceptance + verification columns give the deterministic test that proves it. Three status conventions:

- **Live** — code exists today at the cited location (verified against the tree on 2026-06-24).
- **Phase-1** — MUST be implemented before flipping chat on for real users (gates production).
- **Phase-2 / Phase-3** — Deferred; tracked here so an agent does not silently re-invent it.

ASCII transport spine (the spine every registry row hangs off):

```
                 ┌─────────────────────────────────────────────────────────────┐
  Client         │  POST /api/chat/messages   (durable write, idempotent)      │
  (EventSource) ─┼─► GET /api/events          (ONE multiplexed SSE stream)     │
                 │     Last-Event-ID = realtime_events.id  (global monotonic)  │
                 └─────────────────────────┬───────────────────────────────────┘
                                           │ ONE db.transaction(BEGIN IMMEDIATE)
                                           ▼
        ┌──────────────────────────────────────────────────────────────────┐
        │ messages + activity_log + notification + realtime_events outbox   │
        │   (in-process eventBus.broadcast fires AFTER commit — ACCELERATOR) │
        └──────────────────────────────────────────────────────────────────┘
                                           │ 1s cross-process poll bridge
                                           ▼  (replayFromStore, SSE_POLL_MS)
                                 SSE live tail (CursorAdvancing only)
```

---

## 1. Event registry

Canonical transport contract: `formatSseFrame` emits ONLY `id:` + `data:` lines (NEVER an `event:` line), so EVERY event arrives via `EventSource.onmessage` and type filtering is a JSON `type` string match, not an SSE event name. Verified: `src/lib/realtime-events.ts:164-171`.

| type | family | durable | cursorAdvancing | envelope | target (file:line) | phase |
|---|---|---|---|---|---|---|
| `chat.message` | chat.durable | true | true | `{id:number(realtime_events.id), type:'chat.message', data:{...messages row incl id, conversation_id, from_agent, to_agent, content, message_type, metadata, workspace_id, created_at}, timestamp:number(ms)}` | Originator broadcast: `src/app/api/chat/messages/route.ts:733` (MUST move INTO the message-insert tx per I-broadcast-reorder); emitted via `eventBus.broadcast` (`src/lib/event-bus.ts`) | Phase-1 |
| `chat.message.deleted` | chat.durable | true | true | `{id, type:'chat.message.deleted', data:{id, conversation_id, workspace_id}, timestamp}` | `src/app/api/chat/messages/[id]/route.ts` (DELETE handler) — broadcast after the tombstone/outbox row commits | Phase-1 |
| `chat.read` | chat.durable | true | true | Phase 2 read-state cursor; emitted ONLY when `last_read_seq` actually advances. `data:{conversation_id, participant_id, last_read_seq}` | `src/opzava/modules/chat/read-state.ts` (CREATE); table `chat_read_states` (migration `055_chat_conversations`) | Phase-2 |
| `connected` | control | false | false | Emitted at stream open; NO `id` (never advances cursor). `data:null` (`/api/events`) or `{stream:'runs'}` (`/api/v1/runs/stream`) | `src/app/api/events/route.ts:103`; `src/app/api/v1/runs/stream/route.ts:100-105` | Live |
| `resync.required` | control | false | false | `{type:'resync.required', data:{reason:'retention-gap'}, timestamp}`; NO `id`. Client forces full REST re-fetch | `src/app/api/events/route.ts` (on connect: `SELECT min(id) WHERE workspace_id=?`; if `lastSentId>0 && lastSentId<minId` emit + set `lastSentId=minId-1`) — CREATE wiring | Phase-1 |
| `replay.complete` | control | false | false | Synthetic terminal marker after Last-Event-ID replay ends + live tailing begins (Discord RESUMED equiv). NO `id`. `{type:'replay.complete', timestamp}` | `src/app/api/events/route.ts` (emit after `replayFromStore()` at :104 finishes) — CREATE wiring | Phase-1 |
| `chat.typing.started` | chat.ephemeral | false | false | Phase 2. NEVER persisted, never retried, never replayed, never carries `id`, never advances cursor. Volatile broadcast skips the `realtime_events` INSERT. Exclude originator | `src/lib/event-bus.ts` (ephemeral-type guard) + `src/opzava/modules/chat/presence.ts` (CREATE) | Phase-2 |
| `chat.typing.stopped` | chat.ephemeral | false | false | Phase 2. Ephemeral only; same guards as `chat.typing.started` | same as above | Phase-2 |
| `presence.updated` | chat.ephemeral | false | false | Phase 2. View-scoped (subscribe, not broadcast). Ephemeral only | same as above | Phase-2 |

**Cursor-purity invariant (load-bearing):** any event with `durable=false` MUST carry NO `id` and MUST NOT advance the SSE replay cursor. Enforced by the ephemeral-type guard in `src/lib/event-bus.ts` (I16/Phase-1 part) that routes ephemeral types to a volatile broadcast skipping `recordServerEvent`.

---

## 2. Data registry (schema)

Migration hook: `registerMigrations(newMigrations)` at `src/lib/migrations.ts:13-15`; `runMigrations(db)` at `:1481-1500`. Migration shape `{ id: string, up: (db)=>void }` — idempotent, transactional, tracked in `schema_migrations` (`:1483`). Existing `realtime_events` table is migration `053_realtime_events` at `src/lib/migrations.ts:1463-1478`.

| table | column / index | migrationId | purpose | target (file:line) | phase |
|---|---|---|---|---|---|
| `realtime_events` | `id INTEGER PRIMARY KEY AUTOINCREMENT` | `053_realtime_events` | Global monotonic id = SSE Last-Event-ID replay cursor. Workspace-scoped | `src/lib/migrations.ts:1463-1478` | Live (Phase-0) |
| `realtime_events` | `type TEXT NOT NULL, data TEXT NOT NULL, timestamp INTEGER NOT NULL, workspace_id INTEGER DEFAULT NULL` | `053_realtime_events` | Durable SSE outbox row | `src/lib/migrations.ts:1466-1471` | Live |
| `realtime_events` | `idx_realtime_events_workspace_id ON realtime_events(workspace_id, id)` | `053_realtime_events` | Replay range scan index (workspace + cursor) — fully serves the 1s poll | `src/lib/migrations.ts:1474` | Live |
| `realtime_events` | `idx_realtime_events_timestamp ON realtime_events(timestamp)` | `053_realtime_events` | Age-retention prune index | `src/lib/migrations.ts:1475` | Live |
| `realtime_events` | DROP `idx_realtime_events_id` (redundant — rowid already indexes id) | `054b_realtime_events_pragmas` | Dead-index cleanup (audited P3-9) | `src/lib/migrations.ts` (new migration `054b`) | Phase-1 |
| `realtime_events` (PRAGMA) | `cache_size=-65536`, `temp_store=MEMORY`; keep `wal_autocheckpoint=1000` (do NOT disable) | `054b_realtime_events_pragmas` | Raise cache ~4MB→~64MB resident; schema hardening, no logic change | `src/lib/db.ts` PRAGMA block (`:46-52` region) | Phase-1 |
| `messages` | ADD `client_message_id TEXT` | `054_chat_idempotency` | Write-path idempotency key (client UUID per logical send) | `src/lib/migrations.ts` (new migration `054`) | Phase-1 |
| `messages` | `idx_messages_client_message_id UNIQUE (workspace_id, conversation_id, from_agent, client_message_id) WHERE client_message_id IS NOT NULL` | `054_chat_idempotency` | Partial UNIQUE — `INSERT ... ON CONFLICT(...) DO NOTHING RETURNING id` (retry returns byte-identical id) | `src/lib/migrations.ts` (new migration `054`) | Phase-1 |
| `messages` | (no `conversation_seq`) | n/a | DROPPED (D-NO-CONVSEQ). Display ordering = `created_at ASC, id ASC` tie-breaker. Reconsidered ONLY at Postgres multi-writer (Phase 3) | `src/app/api/chat/messages/route.ts:284` (ORDER BY add `, id ASC`) | Phase-1 |
| `chat_conversations` | `id TEXT PK, workspace_id, kind DEFAULT 'dm', created_by, last_message_id, last_message_at, created_at, updated_at` + `idx_chat_conversations_workspace(workspace, last_message_at)` | `055_chat_conversations` | Explicit conversation metadata; replaces deriving conversations from messages | `src/lib/migrations.ts` (new) | Phase-2 |
| `chat_participants` | `id INTEGER PK, conversation_id, participant_id, role DEFAULT 'member', created_at, UNIQUE(conversation_id, participant_id)` + `idx_chat_participants_conversation` | `055_chat_conversations` | Conversation membership + notification role; authorization source for fanout (full ACL tier) | `src/lib/migrations.ts` (new) | Phase-2 |
| `chat_read_states` | `participant_id, conversation_id, last_read_seq DEFAULT 0, updated_at, PK(participant_id, conversation_id)` | `055_chat_conversations` | Derived-cursor read receipts; UPSERT MAX(current,new); unread derived by SQL. NOT a per-message ack table | `src/lib/migrations.ts` (new) | Phase-2 |
| `presence_heartbeats` | `user_id TEXT PK, scope DEFAULT 'workspace', last_seen_at` + `idx_presence_heartbeats_scope(scope, last_seen_at)` | `056_chat_presence` | Ephemeral online state, SQLite ZSET-equivalent. online = `last_seen_at > now - TTL`. Bounded DELETE on read | `src/lib/migrations.ts` (new) | Phase-2 |
| `realtime_event_consumers` | `consumer_id, partition_key, last_processed_event_number, updated_at, PK(consumer_id, partition_key)` | `057_realtime_consumers` | Broker consumer-offset table (event-driven.io outbox/inbox). Per-instance `WHERE id > offset` reads. NOT needed single-node | `src/lib/migrations.ts` (new) | Phase-3 |

**Retention:** `realtime_events` = 7d (`SSE_RETENTION_MS`) / 50k-row soft cap (`SSE_RETENTION_MAX_ROWS`). Prune at `src/lib/realtime-events.ts:110-130`; P3-4 moves it off the broadcast hot path to a boot-started 60s timer (mirrors `github-sync-poller`/`scheduler`).

---

## 3. Endpoint registry

All `/api/ops/*` routes use admin role via `requireRole(request,'admin')` and return JSON. Existing ops surfaces (verified in tree): `src/app/api/ops/{admin-settings,approvals,artifacts,costs,dead-letters,maintenance,runs}/`. New chat ops surfaces live here.

| method | path | role | purpose | request | response | target (file:line) | phase |
|---|---|---|---|---|---|---|---|
| POST | `/api/chat/messages` | operator | Durable chat write. Sender identity resolved server-side; coordinator override ONLY via agent-scoped API key (P0-1). Message+activity+notification+outbox in ONE `BEGIN IMMEDIATE` tx; broadcast AFTER commit; broadcast originator BEFORE coordinator replies | `{to?, content:required, message_type?:'text'\|'status'\|'tool_call'(default text), conversation_id?, client_message_id:UUID(required), metadata?, forward?, sessionKey?, attachments?}`; `body.from` MUST NOT be honored for human sessions | `201 {message:MessageRow, forward:ForwardInfo\|null}` byte-identical on retry. `400` missing content. `422` injection blocked. `500` failure | `src/app/api/chat/messages/route.ts` (write at `:370`, coordinator override at `:336-340`, broadcast at `:733`) | Phase-1 |
| GET | `/api/chat/messages` | viewer | List messages with filters. P3-1 fix: `ORDER BY created_at ASC, id ASC` (add `, id ASC` tie-breaker) | `?conversation_id&from_agent&to_agent&limit(max 200)&offset&since` | `{messages:MessageRow[], total, page, limit}` | `src/app/api/chat/messages/route.ts:284` (ORDER BY) | Phase-1 |
| GET | `/api/events` | viewer | Primary multiplexed SSE stream. Last-Event-ID replay cursor = `realtime_events.id`. Honors `?types=`. Adds `resync.required` + `replay.complete` + from/to membership predicate + jittered retry | Headers: `Last-Event-ID` (or `?lastEventId`). Query: `?types=csv`. SSE: `id:`/`data:` only (no `event:`) | `text/event-stream`. `retry:<base+jitter>`. Frames: `connected` (no id), data events, `resync.required` (no id), `replay.complete` (no id). Heartbeat `': heartbeat\n\n'` every `SSE_HEARTBEAT_MS`. Headers: `Cache-Control:no-cache,no-transform; Connection:keep-alive; X-Accel-Buffering:no` | `src/app/api/events/route.ts` (connected `:103`, replay `:92-104`, poll `:116`, heartbeat `:119-120`, headers `:148`) | Phase-1 |
| GET | `/api/v1/runs/stream` | viewer | SSE stream of Agent-Run-Protocol events. MUST honor `?types=` (currently IGNORED); MUST share the extracted SSE module with `/api/events` (D-DRY-SSE) | Headers: `Last-Event-ID`. Query: `?types=` (currently IGNORED — MUST be honored) | `text/event-stream`. Same frame/heartbeat/headers as `/api/events` plus `X-Agent-Run-Protocol:0.1.0` | `src/app/api/v1/runs/stream/route.ts` (`:18-23` hardcoded `RUN_EVENT_TYPES`, `:100-105` connected) | Phase-1 |
| GET | `/api/ops/chat-metrics` | admin | Realtime chat observability (analog of `GET /api/ops/costs`). In-process counters, no metrics backend | none (optional `?reset` to zero counters in dev) | EXACT shape: `{activeSseConnections:number, deliveryLagP95Ms:number, realtimeEventRows:number, retryBaseMs:number, retryJitterMs:number, ssePollMs:number}` | `src/app/api/ops/chat-metrics/route.ts` (CREATE) + `src/opzava/platform/observability/realtime-metrics.ts` (CREATE) | Phase-1 |
| GET | `/api/ops/chat-doctor` | admin | Chat health doctor following `/api/openclaw/doctor` template: single-flight + TTL cache, `OpenClawDoctorStatus[]` shape. Checks write-atomicity, idempotency-index, resync/replay wiring, ephemeral guard, drain handler | none | `OpenClawDoctorStatus[]` or aggregated `{level,category,healthy,summary,issues[],canFix}`. Headers `Cache-Control:no-store; X-Doctor-Cache:hit\|miss` | `src/app/api/ops/chat-doctor/route.ts` (CREATE) + `src/lib/chat-doctor.ts` (CREATE, mirror `src/lib/openclaw-doctor.ts:6-14` shape, `:29-66` single-flight+TTL) | Phase-1 |
| GET | `/api/status?action=health` | viewer | Full health; Realtime Chat check PUSHED in `performHealthCheck()` via `health.checks.push(...)` near `:597` | `?action=health` | `{status, version, uptime, checks:HealthCheckEntry[]}` where one entry `name:'Realtime Chat'` carries the chat health summary | `src/app/api/status/route.ts:597` (push site) + `src/lib/connectivity-health.ts` (evaluator `checkRealtimeChat()`, CREATE) | Phase-1 |
| GET | `/api/health` | anonymous | Anonymous liveness probe (orchestrator). No chat logic | none | `{status:'ok', db:'ok', ts:number}`; 503 on DB fail | `src/app/api/health/route.ts:17-28` | Live (Phase-0) |

**HealthCheckEntry shape** (verified `src/lib/connectivity-health.ts:16-22`): `{ name: string, status: 'healthy'|'warning'|'critical'|'error'|'unhealthy', message: string, detail?: unknown }`.

**OpenClawDoctorStatus shape** (verified `src/lib/openclaw-doctor.ts:6-14`): `{ level: 'healthy'|'warning'|'error', category: 'config'|'state'|'security'|'general', healthy: boolean, summary: string, issues: string[], canFix: boolean }`. Single-flight + TTL cache template at `src/app/api/openclaw/doctor/route.ts:28-66` (`DOCTOR_TTL_MS` default 30000, override `MC_DOCTOR_TTL_MS`).

---

## 4. Constants registry

All SSE transport constants live in `src/lib/realtime-events.ts` unless noted. Verified current values: `SSE_RETRY_MS=5_000` (`:4`), `SSE_HEARTBEAT_MS=15_000` (`:5`), `SSE_POLL_MS=1_000` (`:6`), `SSE_REPLAY_LIMIT=200` (`:7`), `SSE_RETENTION_MS=604800000` (`:8`), `SSE_RETENTION_MAX_ROWS=50_000` (`:9`), `SSE_PRUNE_INTERVAL_MS=60_000` (`:10`).

| name | value | unit | purpose | target (file:line) | phase |
|---|---|---|---|---|---|
| `SSE_RETRY_MS` | `5000` | ms | BASE value for the SSE retry frame. Phase-1 replaced by jittered retry; constant retained as base default | `src/lib/realtime-events.ts:4` | Live |
| `SSE_RETRY_BASE_MS` | `3000` | ms | Phase-1 NEW. Base of the jittered retry frame (AWS Full-Jitter). `formatSseRetryFrame(base=SSE_RETRY_BASE_MS, jitter=SSE_RETRY_JITTER_MS)` | `src/lib/realtime-events.ts` (new export; `formatSseRetryFrame` at `:173-174` currently uses `SSE_RETRY_MS`) | Phase-1 |
| `SSE_RETRY_JITTER_MS` | `4000` | ms | Phase-1 NEW. Jitter window: `retry = base + Math.floor(Math.random()*jitter)`. Re-emit on each (re)connect | `src/lib/realtime-events.ts` (new export) | Phase-1 |
| `SSE_HEARTBEAT_MS` | `15000` | ms | SSE comment heartbeat interval (`': heartbeat\n\n'`). MUST stay below every reverse-proxy idle timeout (nginx `proxy_read_timeout`, CF ~100-120s) | `src/lib/realtime-events.ts:5`; emitted `src/app/api/events/route.ts:119-120` | Live |
| `SSE_POLL_MS` | `1000` | ms | Per-connection cross-process outbox poll interval. CORRECTNESS parameter — floor guaranteeing a missed event recovers within ~1s. MUST stay at-least-once, monotonic (`id>cursor`), never coalesce/drop under load | `src/lib/realtime-events.ts:6`; consumer `src/app/api/events/route.ts:116` | Live |
| `SSE_REPLAY_LIMIT` | `200` | rows | Max rows per replay scan (`readServerEventsAfter` LIMIT). Paired with `resync.required` sentinel (no partial-replay across a gap) | `src/lib/realtime-events.ts:7,138-139` | Live |
| `SSE_RETENTION_MS` | `604800000` | ms | `realtime_events` age retention = 7 days. Prune `WHERE timestamp < now - SSE_RETENTION_MS` | `src/lib/realtime-events.ts:8,115` | Live |
| `SSE_RETENTION_MAX_ROWS` | `50000` | rows | `realtime_events` soft row cap (non-atomic SELECT-then-DELETE trim). P3-4 moves prune off the broadcast hot path to a boot-started 60s `setInterval` | `src/lib/realtime-events.ts:9,120-128` | Live |
| `SSE_PRUNE_INTERVAL_MS` | `60000` | ms | Global prune throttle. P3-4: move to a dedicated boot-started timer (mirrors `github-sync-poller`/`scheduler`/`rate-limit`) | `src/lib/realtime-events.ts:10,111` | Live |
| `SSE_STREAM_HIGH_WATER_MARK` | `256` | frames | ReadableStream highWaterMark; slow-client close threshold. When `controller.desiredSize<=0` the stream stops+closes and relies on replay-after-reconnect | `src/app/api/events/route.ts` (current) → `src/lib/sse-stream.ts` (shared module, CREATE) | Phase-1 (DRY) |
| `MAX_DEDUPED_EVENT_IDS` | `500` | entries | Client-side in-memory LRU Set of seen event ids. Phase-1 fix: dedupe ONLY when `payload.id` is a real number — id-less volatile events bypass the Set | `src/lib/use-server-events.ts:64-66` (dedup site) | Phase-1 (fix) |
| `COORDINATOR_AGENT` | `process.env.MC_COORDINATOR_AGENT \|\| process.env.NEXT_PUBLIC_COORDINATOR_AGENT \|\| 'coordinator'` | string | Coordinator agent identity. P0-1: `body.from==='coordinator'` override honored ONLY when `auth.user.agent_name===COORDINATOR_AGENT` (agent-scoped API key) | `src/app/api/chat/messages/route.ts:336-340` (`isCoordinatorOverride` string-match — MUST be gated) | Phase-1 |
| `DRAIN_GRACE_MS` | `2000` | ms | Phase-1 NEW. Bounded wait after `server.close()` on SIGTERM before `disposePtysOnly()`. Hard-coded ~2s; no draining-flag subsystem | `scripts/mc-server.cjs:43-49` (SIGTERM handler — currently only disposes PTYs) | Phase-1 |
| `SQLITE_BUSY_TIMEOUT_MS` | `5000` | ms | PRAGMA `busy_timeout`. Load-bearing with `BEGIN IMMEDIATE` (D-TX-OUTBOX): makes the timeout deterministic on reserved-lock acquisition | `src/lib/db.ts:46-52` (PRAGMA block) | Live |
| `SQLITE_CACHE_SIZE` | `-65536` | bytes(KiB) | P3-9 fix: raise `cache_size` from 1000 (~4MB) to -65536 (~64MB resident). Add to PRAGMA block | `src/lib/db.ts:46-52` | Phase-1 |
| `PRESENCE_TTL_AGENT_MS` | `20000` | ms | Phase 2. Agent presence heartbeat expiry. online = `last_seen_at > now - TTL` | `src/opzava/modules/chat/presence` (CREATE) | Phase-2 |
| `PRESENCE_TTL_WIDGET_MS` | `90000` | ms | Phase 2. Widget/browser presence heartbeat expiry | `src/opzava/modules/chat/presence` (CREATE) | Phase-2 |

---

## 5. METRICS registry → `GET /api/ops/chat-metrics`

Integration target: `src/app/api/ops/chat-metrics/route.ts` (CREATE, admin role via `requireRole(request,'admin')`) reading the in-process module `src/opzava/platform/observability/realtime-metrics.ts` (CREATE). No metrics backend in Phase 1 (D-OBSERVABILITY). A 60s structured log line emits the same fields. Broker-lag/load-tests are Phase 3 and NOT emitted here.

### 5.1 Metric definitions

| name | type | labels | source | description |
|---|---|---|---|---|
| `opzava_chat_active_sse_connections` | gauge | `route(/api/events\|/api/v1/runs/stream)` | in-process counter module; field `activeSseConnections` | Currently open SSE viewer connections across this process. Incremented on stream start, decremented on stop/cancel/abort |
| `opzava_chat_delivery_lag_p95_ms` | gauge | (none) | in-process rolling p95 over the delivery sample window; field `deliveryLagP95Ms` | Rolling p95 of `(Date.now() - event.timestamp)` measured at `sendEvent` delivery. Proxy for end-to-end latency floor |
| `opzava_realtime_event_rows` | gauge | (none) | `SELECT COUNT(*) FROM realtime_events`; field `realtimeEventRows` | Current row count of `realtime_events` (outbox depth). Watch for drift toward `SSE_RETENTION_MAX_ROWS=50000` soft cap |
| `opzava_chat_outbox_poll_iterations_total` | counter | (none) | (Phase 3 only) | Deferred to Phase 3. Total cross-process outbox poll iterations. NOT emitted in Phase 1 |
| `opzava_chat_broker_lag_ms` | histogram | (none) | broker adapter (Phase 2/3) | Deferred. Lag between outbox insert and broker consumer ack |
| `opzava_chat_write_path_p99_ms` | histogram | (none) | (Phase 3 only) | Deferred. Write-path DB transaction p99 (the real user SLA). NOT instrumented Phase 1 |

### 5.2 EXACT JSON response shape

`GET /api/ops/chat-metrics` MUST return exactly this shape (no extra keys, no omitted keys):

```json
{
  "activeSseConnections": 7,
  "deliveryLagP95Ms": 42,
  "realtimeEventRows": 12384,
  "retryBaseMs": 3000,
  "retryJitterMs": 4000,
  "ssePollMs": 1000
}
```

Field sources: `retryBaseMs` ← `SSE_RETRY_BASE_MS`; `retryJitterMs` ← `SSE_RETRY_JITTER_MS`; `ssePollMs` ← `SSE_POLL_MS`. The optional `?reset` query zeros the in-process counters (dev only).

### 5.3 Work item

**I12-phase1** — In-process realtime observability module + `GET /api/ops/chat-metrics`.
- target files: `src/opzava/platform/observability/realtime-metrics.ts` (CREATE); `src/app/api/ops/chat-metrics/route.ts` (CREATE, admin).
- acceptance: `GET /api/ops/chat-metrics` (admin) returns all six fields; a 60s structured log line emits the same. No metrics backend.
- verification: `curl -H "Authorization: Bearer <admin>" /api/ops/chat-metrics` (200 JSON with all fields); `node --test test/realtime-metrics.test.mjs`.

---

## 6. HEALTH-CHECK registry → `performHealthCheck()`

Integration target: push the entry in `performHealthCheck()` at `src/app/api/status/route.ts:511-659` via `health.checks.push(...)` near `:597` (verified push site for existing `checkDirectConnections()` / `checkProviderReadiness()` at `:597-598`). Evaluator: `checkRealtimeChat()` in `src/lib/connectivity-health.ts` (CREATE) — pure evaluator, no DB on the anonymous probe path; reads the in-process metrics module.

| check id | name (HealthCheckEntry.name) | healthy | warning | critical | where pushed |
|---|---|---|---|---|---|
| `realtime-chat` | `Realtime Chat` | `activeSseConnections>=0` (stream alive), `realtimeEventRows < SSE_RETENTION_MAX_ROWS` (50000), `deliveryLagP95Ms < 1000`, idempotency index `idx_messages_client_message_id` present, drain handler wired | `realtimeEventRows >= 40000` (80% cap) OR `deliveryLagP95Ms` between 1000-2500 OR `recordingFailureLogged` latched (transient `recordServerEvent` failure muted) | `realtimeEventRows >= 50000` (cap reached, prune failing) OR `deliveryLagP95Ms > 5000` (events severely delayed) OR `messages` table missing `client_message_id` column (idempotency not migrated) OR outbox poll throwing | `src/app/api/status/route.ts:597` (push `await checkRealtimeChat()` alongside `checkDirectConnections()`/`checkProviderReadiness()`) |

**Work item I-health.** target files: `src/app/api/status/route.ts` (push near `:597`); `src/lib/connectivity-health.ts` (add `checkRealtimeChat()` returning `HealthCheckEntry`). acceptance: `GET /api/status?action=health` includes a checks entry `name:'Realtime Chat'` with status per the criteria above. verification: `curl /api/status?action=health | jq '.checks[] | select(.name=="Realtime Chat")'`; `node --test test/realtime-chat-health.test.mjs`. depends on I12-phase1.

---

## 7. DOCTOR registry → `GET /api/ops/chat-doctor`

Integration target: `src/lib/chat-doctor.ts` (CREATE) aggregating `OpenClawDoctorStatus[]`, mirroring the single-flight + TTL cache at `src/app/api/openclaw/doctor/route.ts:28-66` (`DOCTOR_TTL_MS` default 30000, override `MC_DOCTOR_TTL_MS`). Endpoint `src/app/api/ops/chat-doctor/route.ts` (CREATE, admin role). Shape: `OpenClawDoctorStatus` from `src/lib/openclaw-doctor.ts:6-14`.

| check id | category | summary | issues (detection) | canFix |
|---|---|---|---|---|
| `chat-write-atomicity` | state | Verifies POST `/api/chat/messages` wraps message+activity+notification+outbox INSERT in one `BEGIN IMMEDIATE` tx and broadcasts AFTER commit. Fails (error) if the tx boundary is absent or broadcast precedes commit | Inspect route handler for `db.transaction(...)=>BEGIN IMMEDIATE` wrapping the durable writes and `eventBus.broadcast` positioned post-commit | false |
| `chat-idempotency-index` | state | Verifies `messages.client_message_id` column + partial UNIQUE index `idx_messages_client_message_id(workspace_id, conversation_id, from_agent, client_message_id) WHERE client_message_id IS NOT NULL` exist | `PRAGMA table_info(messages)` for `client_message_id`; `SELECT sql FROM sqlite_master WHERE name='idx_messages_client_message_id'` | true |
| `chat-sse-resync-wiring` | config | Verifies `/api/events` emits `resync.required` when `lastSentId < min(realtime_events.id)` and emits `replay.complete` after replay. Fails if sentinel absent | Grep events route for `resync.required`, `replay.complete`, `min(id)` query | false |
| `chat-ephemeral-guard` | security | Verifies `event-bus.ts` routes ephemeral types (`chat.typing.*`, `presence.updated`) to a volatile broadcast that skips the `realtime_events` INSERT and never advances the cursor | Inspect `event-bus.ts` broadcast path for an event-type guard excluding ephemeral types from `recordServerEvent` | false |
| `chat-drain-handler` | config | Verifies `mc-server.cjs` SIGTERM handler calls `server.close()` + bounded `DRAIN_GRACE_MS` wait before `disposePtysOnly()` | Inspect SIGTERM handler (`scripts/mc-server.cjs:43-49`) for `server.close()` and the 2s bounded timeout | false |
| `chat-coordinator-from-guard` | security | Verifies `body.from` is NOT honored for human sessions and the coordinator override requires `auth.user.agent_name===COORDINATOR_AGENT`. Fails (error) if `body.from==='coordinator'` is a pure string-match override | Inspect POST handler (`src/app/api/chat/messages/route.ts:336-340`) for `isCoordinatorOverride` logic and agent-scoped key check | false |
| `chat-sse-dry-module` | general | Verifies `/api/events` and `/api/v1/runs/stream` share an extracted SSE module and that `/api/v1/runs/stream` honors `?types=` | Grep for shared SSE helper import in both routes; check `?types=` handling in `runs/stream` (`:18-23`) | false |

**Endpoint contract:** `GET /api/ops/chat-doctor` returns `OpenClawDoctorStatus[]` (or aggregated `{level,category,healthy,summary,issues[],canFix}`). Headers `Cache-Control:no-store; X-Doctor-Cache:hit|miss`.

**Work item I-doctor.** target files: `src/lib/chat-doctor.ts` (CREATE); `src/app/api/ops/chat-doctor/route.ts` (CREATE, admin). acceptance: returns the seven checks above with `level/category/healthy/summary/issues/canFix`; single-flight prevents concurrent runs; TTL cache coalesces ambient polls. verification: `curl -H "Authorization: Bearer <admin>" /api/ops/chat-doctor` (200); `node --test test/chat-doctor.test.mjs`; Headers `X-Doctor-Cache:hit|miss` present. depends on I6, I2, I-resync.

---

## 8. LOGGING registry → pino child `realtime-chat`

Server integration target: `import { logger } from '@/lib/logger'` (verified `src/lib/logger.ts:45`), child via `logger.child({ module: 'realtime-chat' })`. Methods `trace/debug/info/warn/error/fatal`; structured fields as the first object arg; error convention `logger.error({ err }, 'msg')`. Client integration target: `createClientLogger('realtime-chat')` (verified `src/lib/client-logger.ts:49`).

### 8.1 Log-shipping (centralized logging)

Integration target: `src/opzava/platform/observability/log-shipping.ts` (verified `:54-67`). Dual-stream stdout + HTTP POST, fail-open (a misconfigured deploy fails closed to NO shipping, never crashes — verified `:57`). Structured JSON in prod, pino-pretty in dev (`src/lib/logger.ts:21-42`).

| env | purpose | default | target (file:line) |
|---|---|---|---|
| `LOG_SHIP_ENABLED` | Master switch; shipping stays OFF unless explicitly enabled AND a non-empty endpoint is set | off | `src/opzava/platform/observability/log-shipping.ts:57` |
| `LOG_SHIP_ENDPOINT` | HTTP POST target for centralized logging | (none; null) | `src/opzava/platform/observability/log-shipping.ts:55` |
| `LOG_SHIP_MIN_LEVEL` | Minimum level floor for shipping | `info` | `src/opzava/platform/observability/log-shipping.ts:61` |

The `realtime-chat` pino child ships through this at `>=info` (all `info/warn/error` rows below; `debug` rows ship only when `LOG_SHIP_MIN_LEVEL=debug`).

### 8.2 Structured fields per event (module: `realtime-chat`)

| event (log message id) | level | fields |
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

Idiom for every row: `const log = logger.child({ module: 'realtime-chat' }); log.info({ ...fields }, 'chat.message.write');`.

---

## 9. ENV / DEPLOY registry

| name | value | purpose | target / note |
|---|---|---|---|
| `MC_COORDINATOR_AGENT` | `coordinator` | Coordinator agent identity string (override via env). P0-1: `body.from` override to this value honored ONLY when `auth.user.agent_name === this` (agent-scoped API key). Existing | `src/app/api/chat/messages/route.ts` (`COORDINATOR_AGENT` resolution) |
| `NEXT_PUBLIC_GATEWAY_OPTIONAL` | `true` | Disables gateway-socket reconnect from the first failure for standalone deployments without gateway connectivity. Existing | `src/lib/websocket.ts` |
| `MISSION_CONTROL_DATA_DIR` | `.data/` | Data directory (gitignored). `realtime_events` DB lives here. Existing | `src/lib/db.ts` |
| `MISSION_CONTROL_DB_PATH` | `<data-dir>/mission-control.db` | SQLite DB path. The single-writer serialized chat store. Existing | `src/lib/db.ts` |
| `OPZAVA_SSE_RETRY_BASE_MS` | `3000` | Phase-1 OPTIONAL override for `SSE_RETRY_BASE_MS` (jittered retry frame base) | `src/lib/realtime-events.ts` (new) |
| `OPZAVA_SSE_RETRY_JITTER_MS` | `4000` | Phase-1 OPTIONAL override for `SSE_RETRY_JITTER_MS`. `retry = base + random(0, jitter)` | `src/lib/realtime-events.ts` (new) |
| `OPZAVA_DRAIN_GRACE_MS` | `2000` | Phase-1 OPTIONAL override for the SIGTERM graceful-drain bounded wait before `disposePtysOnly()` | `scripts/mc-server.cjs` |
| `MC_DOCTOR_TTL_MS` | `30000` | TTL cache for `GET /api/openclaw/doctor` (existing). The chat doctor at `/api/ops/chat-doctor` MIRRORS this pattern (single-flight + TTL) — reuse the same tuning convention | `src/app/api/openclaw/doctor/route.ts:63` |
| `LOG_SHIP_ENABLED` / `LOG_SHIP_ENDPOINT` / `LOG_SHIP_MIN_LEVEL` | `info` (min level default) | Centralized log shipping (`src/opzava/platform/observability/log-shipping.ts:54-63`). Dual-stream stdout + HTTP POST, fail-open. `realtime-chat` pino child ships at `>=info` | §8.1 |
| Reverse proxy: HTTP/2 | preferred | Enable HTTP/2 at the reverse proxy for production. SSE over HTTP/1.1 hits a ~6-connection-per-browser-per-domain cap; one multiplexed SSE stream + HTTP/2 avoids it. NEVER open per-conversation SSE streams | deployment matrix (I18) |
| nginx SSE config | `proxy_read_timeout 3600s; proxy_buffering off; proxy_ignore_headers X-Accel-Buffering;` | nginx `proxy_read_timeout` defaults to 60s (kills SSE). `proxy_buffering off` + ignore `X-Accel-Buffering` so the app's escape hatch is honored | `docs/architecture/realtime-chat-deployment.md` (CREATE, I18) |
| Traefik SSE config | buffering middleware OFF | Traefik v3 auto-detects `text/event-stream` and ignores `responseForwarding.flushInterval` — do NOT add `flushInterval` labels (dead config). `docker-compose.dokploy.yml`: add NO buffering middleware; verify no `respondingTimeouts` killing the stream | `docker-compose.dokploy.yml`; I18 |
| Cloudflare SSE caveat | heartbeat < 100s; expect 524 after ~100-120s | CF 524 after ~100-120s and observed buffering to ~100KB regardless of heartbeat. The 15s `SSE_HEARTBEAT_MS` keeps CF happy; long-lived CF-fronted deployments need the documented caveat | deployment matrix (I18) |
| SSE response headers (both routes) | `Cache-Control: no-cache, no-transform; Connection: keep-alive; X-Accel-Buffering: no` | Mandatory on `/api/events` and `/api/v1/runs/stream`. `X-Accel-Buffering:no` disables nginx buffering. `runs/stream` additionally sets `X-Agent-Run-Protocol: 0.1.0`. Preserved by the DRY SSE module | `src/app/api/events/route.ts:148`; `src/lib/sse-stream.ts` (CREATE) |
| Smoke test: `scripts/dokploy-parity-test.sh` | temporal liveness (POST + assert frame on open conn <3s) | P1-5 / I11. Defense against a future CF/enterprise proxy that buffers AFTER the initial flush. Also covers `/api/v1/runs/stream` (currently zero smoke coverage) | `scripts/dokploy-parity-test.sh:89-111` |

### 9.1 Deployment phases (for context, full ledger in `docs/architecture/realtime-chat-ledger.md`)

- **Phase-1 (gate for production user chat):** I13 (coordinator-from), I6 (tx-outbox BEGIN IMMEDIATE), I-broadcast-reorder, I2 (client_message_id), I-resync, I11 (temporal smoke), I3-predicate (from/to membership), I9-jitter, I10-minimal (drain), I16 (volatile dedup + latch reset), P3-1 (created_at,id ASC), I12-phase1 (metrics + chat-metrics), I18 (proxy matrix), I20 (DRY SSE + runs/stream ?types=), I-doctor, I-health. I4 `conversation_seq` DROPPED here.
- **Phase-2 (broker seam + collaboration tier):** I-conv-tables, I5 (read-state cursor), I14 (presence/typing ephemeral), I8 (partial), I19-conditional (Web Locks leader-tab). SSE browser contract UNCHANGED.
- **Phase-3 (horizontal scale):** I8 (Redis Streams), I15 (NATS JetStream + Postgres). I4 `conversation_seq` RECONSIDERED here ONLY (Postgres multi-writer).

---

## References

- Single source of truth (canonical architecture spec): `docs/architecture/realtime-chat-architecture.md`
- Canonical contract + ledger: `docs/architecture/realtime-chat-ledger.md`
- Production-readiness audit (audit of record — file:line evidence, primary-source research): `docs/architecture/realtime-chat-production-review.md`
- Topology diagram: `docs/architecture/realtime-chat-topology.mmd`
- Transport ARD: `docs/ard/0009-realtime-user-chat-transport-and-fanout.md`
- Slack persist-before-fanout (the load-bearing rule): https://slack.engineering/scaling-datastores-at-slack-with-vitess
- HTML SSE spec (reconnect, Last-Event-ID, retry, empty-id reset, comment heartbeat): https://html.specwhatwg.org/multipage/server-sent-events.html
- AWS Full-Jitter (retry frame): https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- SQLite DEFERRED→write upgrade + busy_timeout: https://sqlite.org/lang_transaction.html §2.1
- event-driven.io outbox/inbox + consumer-offset (Phase 2/3): https://event-driven.io/en/outbox_inbox_patterns_and_delivery_guarantees_explained/

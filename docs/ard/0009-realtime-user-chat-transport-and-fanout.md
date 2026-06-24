# ARD 0009: Realtime User Chat Transport And Fanout

Status: Accepted
Date: 2026-06-24

## Context

Opzava is adding realtime chat between human users inside the app. The inherited runtime already ships an event
spine that the audit (`docs/architecture/realtime-chat-production-review.md`) verified as sound at the intended
scale (self-hosted, single-node SQLite via `better-sqlite3`, synchronous, WAL + `busy_timeout=5000`, internal AI
team):

- `/api/events` — a Node SSE stream with auth, workspace filtering, replay-by-id, heartbeats, `?types=` filter, and
  slow-client closure (`src/app/api/events/route.ts:78,102-103,132,148`).
- `eventBus.broadcast()` — records into the `realtime_events` outbox (assigning the monotonic id), then emits
  in-process (`src/lib/event-bus.ts:47,65,71-77`).
- `useServerEvents()` — the browser EventSource consumer + Zustand reconciler (`src/lib/use-server-events.ts:23,64-71`).
- `/api/chat/messages` — persists the message, writes activity + notification, optionally forwards to gateway agents,
  and emits `chat.message` (`src/app/api/chat/messages/route.ts:337-338,374,389,401,733`).
- Gateway (`src/lib/websocket.ts`) and PTY (`src/lib/pty-websocket.ts`) WebSockets — external agent control and
  terminal streaming.

The audit found the **spine is correct but not production-ready as-shipped**. Three defect classes block flipping
chat on for real users, all small and localized:

1. **Write-path atomicity** — message/activity/notification/outbox are four independent auto-commits, and the
   outbox row is written after up to ~21s of gateway I/O. A hard kill leaves committed-but-SSE-invisible messages
   plus a cosmetic reply-before-original ordering bug (`src/app/api/chat/messages/route.ts:374,389,401,733`).
2. **Authorization boundary** — SSE/replay filters are workspace-only (no per-conversation ACL), and
   `body.from === 'coordinator'` is honored from any operator session (coordinator impersonation)
   (`src/app/api/chat/messages/route.ts:336-340`; `src/app/api/events/route.ts:78`).
3. **Idempotency** — no `client_message_id`; a lost 201 plus Retry creates a duplicate committed row and a duplicate
   gateway run, because the gateway key is `mc-${messageId}-${Date.now()}` (non-deterministic).

Everything scale-dependent (reconnect storms, the 1s-poll ceiling, broker adapter, presence/typing,
`conversation_seq`) is correctly deferred to the Phase 2/3 broker track. The original research ledger was
directionally correct but overstated severities (consumer-Slack framing on an internal tool), missed the
dual-cursor/RESUMED-sentinel/cursor-purity angles, and under-cited reusable patterns. The audit
(`docs/architecture/realtime-chat-production-review.md`) is the **analysis of record**; this ARD ratifies its
final decisions.

The primary-source consensus across Slack, Zulip, Discord, Matrix/Synapse, Mattermost, Rocket.Chat, and Chatwoot:
transport choice alone does not make chat production-ready. The durable event model and fanout topology matter
more. For Opzava that means HTTP writes + one multiplexed SSE stream + a transactional SQLite outbox, hardened in
place rather than replaced.

## Decision

**Durable user-chat transport = HTTP POST writes + ONE multiplexed SSE stream, with the SQLite outbox as the
reliability layer. The in-process eventBus is a best-effort fanout accelerator, not a reliability layer.**

1. **D-SPINE.** Durable user-chat transport = HTTP POST writes (`POST /api/chat/messages`) + ONE multiplexed SSE
   stream (`GET /api/events`) using `realtime_events.id` (global monotonic autoincrement) as the `Last-Event-ID`
   replay cursor. The in-process `eventBus.broadcast()` is a best-effort fanout ACCELERATOR, not a reliability
   layer; reliability lives in the SQLite outbox + write transaction
   (Slack persist-before-fanout: slack.engineering/scaling-datastores-at-slack-with-vitess). The 1s outbox poll
   (`SSE_POLL_MS`, `src/app/api/events/route.ts:114-116`) is a CORRECTNESS parameter — the floor guaranteeing a
   missed event recovers within ~1s — and MUST stay at-least-once, monotonic (`id > cursor`), never coalesced.

2. **D-WS-SEPARATE.** The gateway control WebSocket (`src/lib/websocket.ts`) and the PTY WebSocket
   (`src/lib/pty-websocket.ts`) are NOT canonical durable chat transport. WebSocket MAY be used later for ephemeral
   typing/presence only (Phase 2, I14); durable message recovery always comes from the DB/outbox cursor.

3. **D-NO-CONVSEQ.** DROP `conversation_seq` (ledger I4) as over-engineering for a single-writer synchronous
   `better-sqlite3`. Conversation display ordering = `messages.created_at ASC, id ASC` tie-breaker (P3-1; the seed
   migration already uses this idiom). The SSE replay/durability cursor is the GLOBAL `realtime_events.id` only.
   `conversation_seq` is reconsidered ONLY at Postgres multi-writer (Phase 3, I15).

4. **D-TX-OUTBOX.** Message INSERT + activity log + notification + `realtime_events` outbox INSERT happen in ONE
   `db.transaction()` begun with `BEGIN IMMEDIATE`. `eventBus.broadcast` fires AFTER commit (in-process fast path);
   the `realtime_events` row lives INSIDE the tx. `BEGIN IMMEDIATE` is load-bearing:
   `better-sqlite3`'s `db.transaction` defaults to `DEFERRED`, and per sqlite.org/lang_transaction.html §2.1
   `busy_timeout` is not reliably honored when a DEFERRED read upgrades to a write; acquiring the reserved lock at
   `BEGIN` makes `busy_timeout=5000` (`src/lib/db.ts:52`) deterministic against a concurrent MCP/CLI/cron writer.

5. **D-IDEMPOTENCY.** `client_message_id` (client UUID per logical send) + partial UNIQUE INDEX
   `(workspace_id, conversation_id, from_agent, client_message_id) WHERE client_message_id IS NOT NULL`. POST does
   `INSERT ... ON CONFLICT(...) DO NOTHING RETURNING id`; if RETURNING yields nothing, SELECT the existing id so a
   retry returns byte-identical `message_id 42`. The gateway idempotency key is derived from `client_message_id`,
   NOT `messageId+Date.now()` (`src/app/api/chat/messages/route.ts:498`). This realizes the Mattermost
   `deduplicateCreatePost` pattern but keyed on the shared SQLite outbox, not in-process memory (Mattermost's
   documented limitation behind a non-sticky LB — github.com/mattermost/mattermost/blob/master/server/channels/app/post.go).

6. **D-COORDINATOR-FROM.** Stop honoring `body.from` for human sessions (P0-1). `from` is ALWAYS resolved
   server-side: `auth.user.display_name || auth.user.username || 'system'`. The coordinator override is allowed
   ONLY when authenticated with the coordinator agent's scoped API key
   (`auth.user.agent_name === COORDINATOR_AGENT` via `agent_api_keys`). The pure string-match override at
   `src/app/api/chat/messages/route.ts:337-338` MUST be removed for human sessions.

7. **D-MEMBERSHIP-PREDICATE.** `workspace_id` remains the trust boundary for Phase 1. Minimal chat privacy = a
   from/to predicate at the `sendEvent` boundary: for `chat.*` events drop unless viewer identity matches
   `message.from_agent` or `message.to_agent`, OR viewer role is operator/admin. The same predicate is applied in
   replay. Full `chat_participants` tier is Phase 2 (P2-1; `src/app/api/events/route.ts:78`).

8. **D-RESYNC-SENTINEL.** At SSE connect, fetch `min(id)` for the workspace; if `parseLastEventId > 0` AND
   `lastSentId < min(id)`, emit control event `{type:'resync.required', data:{reason:'retention-gap'}}` and set
   `lastSentId = min(id)-1` — NO partial replay across a known gap. The client forces a full REST re-fetch of
   affected collections. (Maps to Zulip `newest_pruned_id` + Discord op-9 `d=false`,
   docs.discord.com/developers/events/gateway.)

9. **D-REPLAY-COMPLETE.** After `Last-Event-ID` replay finishes and live tailing begins, emit a synthetic
   `replay.complete` control event (the Discord RESUMED equivalent, docs.discord.com/developers/events/gateway-events)
   so the client can distinguish "still catching up" from "now live".

10. **D-EPHEMERAL.** Typing/presence events are EPHEMERAL-ONLY: never persisted to `realtime_events`, never
    retried, never replayed, and MUST NOT advance or break the durable SSE cursor. Enforced by an event-type guard
    in `event-bus.ts` that routes ephemeral types to a volatile broadcast that skips the DB row
    (Slack: transient events are not persisted — slack.engineering/real-time-messaging; Matrix EDU/PDU split).

11. **D-JITTER-RETRY.** Replace the fixed `SSE_RETRY_MS=5000` (`src/lib/realtime-events.ts:4,173-175`) with a
    per-connection jittered retry frame: `retry = SSE_RETRY_BASE_MS + random(0, SSE_RETRY_JITTER_MS)` (AWS
    Full-Jitter: aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter). Zero new client code;
    keeps native EventSource reconnect semantics.

12. **D-GRACEFUL-DRAIN.** On SIGTERM, retain the HTTP server reference (existing `patchCreateServer` wrapper at
    `scripts/mc-server.cjs:31,40-41`) and call `server.close()` + a bounded `setTimeout(DRAIN_GRACE_MS)` before
    `disposePtysOnly()` (`scripts/mc-server.cjs:43,47-49`). NO draining-flag/resync.broadcast/grace-period-coordination
    subsystem — durable replay is the complete safety net.

13. **D-DRY-SSE.** Extract a shared SSE module (`highWaterMark`, `safeEnqueue`, `stop`, `sendEvent`, `replay`,
    `abort`, `cancel`, `heartbeat`, retry frame) from `/api/events` and `/api/v1/runs/stream`
    (~100 duplicated lines; `src/app/api/events/route.ts:132,148` vs `src/app/api/v1/runs/stream/route.ts:129,143`).
    `/api/v1/runs/stream` MUST honor `?types=` instead of ignoring it against the hardcoded `RUN_EVENT_TYPES`
    (`src/app/api/v1/runs/stream/route.ts:18,76`).

14. **D-SMOKE-TEMPORAL.** Make `dokploy-parity-test.sh` temporal: open the SSE connection, POST a workspace-scoped
    event from a second authenticated curl, assert the matching data frame arrives on the SAME open connection
    within ~3s. Do NOT add Traefik `responseForwarding.flushInterval` labels — Traefik v3 auto-detects
    `text/event-stream`; the labels would be dead config.

15. **D-VOLATILE-DEDUP-FIX.** (1) In `event-bus.ts` reset `recordingFailureLogged=false` after a successful
    `recordServerEvent` (or rate-limit the warn to 1/60s) (`src/lib/event-bus.ts:47,72-73`). (2) In
    `use-server-events.ts` `onmessage`, only dedupe when `payload.id` is a real number — id-less volatile events
    bypass the Set entirely (`src/lib/use-server-events.ts:64-68`).

16. **D-BROADCAST-REORDER.** Broadcast the originating user message BEFORE generating coordinator replies (fixes
    reply-before-original ordering). Move the `chat.message` outbox insert INTO the message-insert transaction
    (P1-2) so it commits before any gateway I/O.

17. **D-PROXY-MATRIX.** Document an SSE-safe proxy config matrix per deployment target: nginx
    `proxy_read_timeout 3600s` + `proxy_buffering off` + `proxy_ignore_headers X-Accel-Buffering`; Traefik buffering
    middleware OFF (auto-detects SSE); Cloudflare heartbeat <100s caveat + 524 after ~100-120s. HTTP/2 preferred at
    the reverse proxy (SSE/HTTP/1.1 ~6-conn/browser cap, MDN). The response headers
    `Cache-Control: no-cache, no-transform; Connection: keep-alive; X-Accel-Buffering: no` are mandatory on both
    routes (`src/app/api/events/route.ts:148`; `src/app/api/v1/runs/stream/route.ts:143`).

18. **D-OBSERVABILITY.** Phase 1: a lightweight in-process counter module (no metrics backend). Gauge
    `activeSseConnections`, rolling p95 of `(now - event.timestamp)` at `sendEvent` delivery, `realtime_events` row
    count. Expose via `GET /api/ops/chat-metrics` (admin) + a 60s log line. Broker-lag/load-tests are Phase 3
    (dropped from P1).

19. **D-CHAT-DOCTOR.** Add a chat doctor following the `OpenClawDoctorStatus` shape at `GET /api/ops/chat-doctor`
    (admin role): single-flight + TTL cache like `src/app/api/openclaw/doctor/route.ts` and
    `src/lib/openclaw-doctor.ts:6-14,29-66`. Checks write-path atomicity, idempotency constraint presence, SSE
    replay/resync wiring, ephemeral-guard, drain handler.

20. **D-BROKER (Deferred to Phase 2/3).** Broker adapter (Redis Streams + a
    `realtime_event_consumers(consumer_id, partition_key, last_processed_event_number)` consumer-offset table,
    event-driven.io/en/outbox_inbox_patterns_and_delivery_guarantees_explained/), full `chat_participants`
    membership tier, presence/typing ephemeral channel, NATS JetStream, Postgres migration. None of these block
    single-node production user chat.

### Phasing

- **Phase 1 (before production user chat):** I13 (coordinator-from fix), I6 (tx-outbox `BEGIN IMMEDIATE`),
  I-broadcast-reorder, I2 (`client_message_id` idempotency), I-resync (sentinel + `replay.complete`),
  I11 (temporal smoke test), I3-predicate (from/to membership), I9-jitter, I10-minimal (graceful drain), I16
  (volatile dedup + latch reset), I20 (DRY SSE + `?types=`), I12-phase1 (in-process observability + chat-metrics),
  I18 (proxy matrix), I-doctor, I-health. I4 `conversation_seq` DROPPED here.
- **Phase 2 (before multi-instance):** I-conv-tables (chat_conversations + chat_participants full ACL), I5
  (`chat_read_states` derived cursor), I14 (typing/presence ephemeral channel), I8-partial (Redis Streams adapter
  + consumer-offset table), I19-conditional (Web Locks leader-tab ONLY if multi-tab users hit the HTTP/1.1 6-connection cap in non-HTTP/2 environments).
- **Phase 3 (true horizontal scale):** I8, I15 (NATS JetStream + Postgres migration), I4-DROPPED (revisit
  `conversation_seq` ONLY at Postgres multi-writer).

## Rationale

- **The SSE + HTTP-write spine already matches the dominant Opzava event shape** (server-to-browser durable state
  changes). `formatSseFrame` emits only `id:` and `data:`, never `event:` (`src/lib/realtime-events.ts:164-171`),
  so every event arrives via `onmessage`; hardening this spine has lower structural entropy than adding a second
  canonical chat transport.
- **HTTP writes make validation, auth, idempotency, and durable acknowledgement simple and auditable.** The write
  path is the real user SLA (Slack: users feel the DB write, not the push); targeting write-path p99, not SSE
  push p99, is the correct framing.
- **`BEGIN IMMEDIATE` + outbox-in-tx realizes Zulip's `send_event_on_commit` pattern** (Apache-2.0, pattern only)
  and Matrix's "reserve the ordering token inside the persistence transaction" discipline. A crash between commit
  and SSE still delivers via the 1s poller.
- **The global `realtime_events.id` cursor is sufficient at single-node SQLite.** Discord and Zulip validate the
  dual-cursor split; for Opzava the SSE replay cursor (global event_id) and conversation display ordering
  (`created_at ASC, id ASC`) are two cursors with two lifetimes, and neither needs a per-conversation seq counter
  under a single serialized writer.
- **Workspace-only filtering with a minimal from/to predicate is the right Phase 1 privacy gate.** For a single
  trusted-workspace internal deployment, per-conversation ACLs sized for consumer cross-tenant privacy are
  over-engineering (REJECT). The P0-1 `from`-override fix is the load-bearing integrity fix.
- **Ephemeral typing/presence must never touch the durable cursor** (Slack transient events, Matrix EDU/PDU split,
  WhatsApp typing design). An event-type guard in `event-bus.ts` enforces cursor purity.
- **WebSocket would still require the same durable store, outbox, replay, and idempotency logic**, while adding
  sticky connection state and explicit backpressure management. The gateway/PTY sockets stay operationally
  separate; PTY still needs sticky/local affinity unless brokered later.
- **Redis Pub/Sub is at-most-once** (redis.io/docs/latest/develop/pubsub/) and CANNOT be the durable chat bus.
  Postgres `NOTIFY` is a wakeup signal with small payload and no durable replay — useful after a Postgres
  migration, not the source of truth.

## Consequences

- **Write path:** `POST /api/chat/messages` wraps message+activity+notification+outbox INSERT in one
  `BEGIN IMMEDIATE` transaction and broadcasts AFTER commit; the originator is broadcast BEFORE coordinator reply
  generation. Failure injection between the writes leaves NO orphan message and NO orphan outbox row.
- **Idempotency:** a duplicate POST with the same `client_message_id` returns byte-identical `message_id` (not a
  new autoincrement) and does NOT trigger a second gateway run. The store reconciles the optimistic temp bubble to
  the real row by `client_message_id`.
- **Authorization:** an operator POSTing `{from:'coordinator'}` is treated as their OWN identity. The misleading
  `// Sender identity is always resolved server-side` comment at `src/app/api/chat/messages/route.ts` becomes true.
- **SSE replay:** a reconnect whose `Last-Event-ID` predates retention emits `resync.required` and does NOT
  partial-replay across the gap; after any successful replay the client receives `replay.complete`. Ephemeral and
  control frames never advance the cursor.
- **Operations:** SIGTERM no longer hard-kills SSE mid-stream; in-flight requests get a ~2s grace window. The
  per-connection jittered retry de-herds reconnect storms. `GET /api/ops/chat-metrics` and
  `GET /api/ops/chat-doctor` (admin) and a `Realtime Chat` entry in `GET /api/status?action=health` give Phase 1
  observability with no metrics backend.
- **Deployment:** the SSE-safe proxy matrix MUST be applied (nginx/Traefik/Cloudflare/HTTP/2) or SSE stalls in
  production. The temporal smoke test defends against a future proxy that buffers after the initial flush.
- **Schema (Phase 1):** `messages` gains `client_message_id` + partial UNIQUE index (migration `054_chat_idempotency`);
  the `realtime_events` outbox is hardened with PRAGMA additions (migration `054b_realtime_events_pragmas`).
  `chat_conversations`/`chat_participants`/`chat_read_states`/`presence_heartbeats` are Phase 2 (migration `055`/`056`).
- **Multi-instance production is blocked** until the publisher adapter has a shared broker (Redis Streams +
  `realtime_event_consumers`, Phase 2/3) and the primary datastore strategy is clear (Postgres or a single-writer
  chat service). SQLite remains acceptable for single-node self-hosted deployment.

## Alternatives considered

### Move durable chat to WebSocket

Rejected for the first production chat path. WebSocket is good for bidirectional control and terminal streams, but
it does not remove the need for DB-backed replay, idempotency, authorization, and ordering, and it introduces
sticky-connection and backpressure concerns. WebSocket MAY be added later for ephemeral typing/presence only
(Phase 2, I14); durable recovery always comes from the DB/outbox cursor.

### Use Redis Pub/Sub for chat fanout

Rejected as a durable chat bus. Redis documents Pub/Sub as at-most-once. It can support typing/presence hints, but
not reliable message history. Redis Streams (with a consumer-offset table) is the Phase 2/3 broker track.

### Use Postgres `LISTEN/NOTIFY` as the broker

Rejected as the primary broker. It is useful as a low-friction wakeup signal once Opzava is on Postgres, but
payloads are small and durable replay must live in tables. Phase 3.

### Introduce `conversation_seq` now

Dropped. A gapless per-conversation sequence counter is over-engineering for a single serialized `better-sqlite3`
writer; `created_at ASC, id ASC` is sufficient for display ordering and the global `realtime_events.id` is
sufficient for replay/durability. Reconsidered ONLY at Postgres multi-writer (Phase 3, I15). Primary sources:
dba.stackexchange.com/questions/119784 , sqlite.org/lang_transaction.html.

### Copy Slack-style gateway/channel servers now

Rejected. Slack's architecture (slack.engineering/flannel, slack.engineering/real-time-messaging) solves massive
global fanout (4M connections, 600K QPS). Opzava takes its principles — persist before fanout, scoped
subscriptions, view-scoped presence, drop-ephemeral-first under backpressure, monotonic message IDs — and rejects
the multi-region edge/geo-DNS/Elixir Gateway-Server topology as over-engineering for an internal tool.

### Build the full `chat_participants` membership tier now

Deferred to Phase 2. For Opzava's realistic single-trusted-workspace deployment, the minimal from/to predicate
(P2-1) is the cheap, sufficient privacy gate. The per-eventName subscription index
(`Map<topic, Set<connection>>`, Rocket.Chat `subscriptionsByEventName`) replaces broadcast-all at Phase 2.

### Add a draining-flag / configurable-grace subsystem for SIGTERM

Rejected. Durable replay (1s poll + `Last-Event-ID`) is already a complete safety net. A bounded `server.close()` +
~2s wait is the minimal correct drain; anything more is over-engineering.

### Web Locks leader-tab collapse

Deferred (conditional, Phase 2). Collapsing N tabs into one EventSource per browser is ~10 lines
(greenvitriol.com/posts/browser-leader, MDN Web Locks API) but is added ONLY if multi-tab users hit the HTTP/1.1
6-connection cap in non-HTTP/2 environments. HTTP/2 at the reverse proxy avoids it entirely.

## References

- Analysis of record: `docs/architecture/realtime-chat-production-review.md` (audit date 2026-06-24).
- Architecture doc (single source of truth): `docs/architecture/realtime-chat-architecture.md`; research ledger:
  `docs/architecture/realtime-chat-ledger.md`; ops/logging/doctor/health registry:
  `docs/architecture/realtime-chat-inventory.md`; topology rendering:
  `docs/architecture/realtime-chat-topology.mmd`.
- Code: `src/app/api/events/route.ts`, `src/app/api/v1/runs/stream/route.ts`, `src/app/api/chat/messages/route.ts`,
  `src/lib/realtime-events.ts`, `src/lib/event-bus.ts`, `src/lib/use-server-events.ts`, `src/lib/db.ts`,
  `src/lib/migrations.ts`, `src/lib/auth.ts`, `src/lib/websocket.ts`, `src/lib/pty-websocket.ts`,
  `src/lib/openclaw-doctor.ts`, `scripts/mc-server.cjs`, `scripts/dokploy-parity-test.sh`.
- Slack persist-before-fanout + transient events: https://slack.engineering/real-time-messaging/ ,
  https://slack.engineering/scaling-datastores-at-slack-with-vitess/ .
- Zulip events system (after-commit dispatch, `newest_pruned_id`):
  https://github.com/zulip/zulip/blob/main/docs/subsystems/events-system.md .
- Discord gateway (RESUMED, op-9, monotonic seq guard): https://docs.discord.com/developers/events/gateway ,
  https://github.com/discordjs/discord.js/blob/main/packages/ws/src/ws/WebSocketShard.ts .
- Matrix EDU/PDU split + in-tx ordering: https://spec.matrix.org/v1.13/client-server-api/ .
- Mattermost idempotency: https://github.com/mattermost/mattermost/blob/master/server/channels/app/post.go .
- Rocket.Chat per-eventName subscription index:
  https://github.com/RocketChat/Rocket.Chat/blob/develop/apps/meteor/server/modules/streamer/streamer.module.ts .
- Chatwoot read-state cursor + Redis ZSET presence:
  https://github.com/chatwoot/chatwoot/blob/develop/app/models/conversation.rb ,
  https://github.com/chatwoot/chatwoot/blob/develop/lib/online_status_tracker.rb .
- Outbox/inbox + consumer-offset: https://event-driven.io/en/outbox_inbox_patterns_and_delivery_guarantees_explained/ .
- SQLite transaction pragmas: https://sqlite.org/lang_transaction.html , https://sqlite.org/wal.html ,
  https://sqlite.org/pragma.html .
- HTML SSE spec + AWS Full-Jitter:
  https://html.specwhatwg.org/multipage/server-sent_events.html ,
  https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/ .
- nginx/Cloudflare/Traefik SSE:
  https://nginx.org/en/docs/http/ngx_http_proxy_module.html ,
  https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/ .
- Web Locks leader-tab: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API ,
  https://greenvitriol.com/posts/browser-leader .
- Postgres compatibility: `docs/ard/0006-postgres-compatibility.md`.

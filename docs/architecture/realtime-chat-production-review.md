# Opzava Realtime-Chat — Production-Readiness Final Verdict

> Synthesis of code verification (file:line evidence), primary-source research (Slack engineering + API, Discord, Matrix/Synapse, Mattermost, Zulip, Rocket.Chat, Chatwoot, SSE/HTML spec, AWS jitter, sqlite.org, better-sqlite3), and adversarial confirmed/disputed triage. Audit date: 2026-06-24.
>
> Scale baseline throughout: **self-hosted, single-node SQLite (better-sqlite3, synchronous), WAL + `busy_timeout=5000`, internal AI team**. Findings are graded against THAT scale first, with multi-instance/horizontal concerns called out as a separate, phase-gated track.

---

## 1. Verdict

**Confidence: high. Verdict: the architecture's *spine* (HTTP-write POST + single multiplexed SSE `lastEventId`-replay cursor + `realtime_events` SQLite outbox + 1s cross-process poll bridge) is sound, primary-source-validated, and production-curable for the intended scale — BUT it is NOT production-ready as-shipped for user chat today.**

Three classes of defect must be closed before flipping chat on for real users, and all three are small, localized, and well-precedented:

1. **Write-path atomicity** — message/activity/notification/outbox are 4 independent auto-commits, and the outbox row is written *after* up to ~21s of gateway I/O. A hard kill or even normal restart leaves committed-but-SSE-invisible messages (and a cosmetic reply-before-original ordering bug). Fix: wrap the durable writes in one `db.transaction()`, emit after commit, and broadcast the originator before generating replies. (`src/app/api/chat/messages/route.ts:374,389,401,733`)
2. **Authorization boundary** — SSE/replay filter is workspace-only; there is no per-conversation membership ACL, and `body.from === 'coordinator'` is honored from any operator session (coordinator impersonation). For a single trusted workspace this is an accepted operational property, but the `from`-override is a real integrity bug. (`src/app/api/chat/messages/route.ts:336-340`; `src/app/api/events/route.ts:78`)
3. **Idempotency** — no `client_message_id` anywhere; a lost-201 + Retry creates a duplicate committed row + a duplicate gateway run (`mc-${messageId}-${Date.now()}` is non-deterministic). Fix is one column + one partial UNIQUE index + a client UUID.

Everything else — reconnect storms, the 1s-poll scaling ceiling, broker adapter, presence/typing, conversation_seq — is **scale-dependent and correctly deferred** to the Phase 2/3 broker track already named in ARD 0009. The original research was *directionally correct* but overstated severities (consumer-Slack framing applied to an internal tool), missed the dual-ordering/RESUMED-sentinel/cursor-purity angles entirely, and under-cited reusable patterns. This audit corrects all three.

---

## 2. Code-vs-Doc Accuracy

### 2.1 Doc claims that were inaccurate or partial

| Doc claim | Reality | Evidence |
|---|---|---|
| "Cross-process gap: events from other processes are not delivered (no pub/sub broker)" | **Partial.** The gap is CLOSED for SSE clients via the 1s `realtime_events` poll (`events/route.ts:114-116` comment + `setInterval(replayFromStore, SSE_POLL_MS)`). The gap is REAL only for non-polling in-process listeners — notably webhooks (`webhooks.ts:89`), which have no DB fallback. | `src/app/api/events/route.ts:114-116`; `src/lib/webhooks.ts:88-89` |
| "EventSource has native reconnect and Last-Event-ID; server replays the gap" | **Partial.** Server honors `Last-Event-ID` replay, but the client `useServerEvents` hook never reads `event.lastEventId` for gap detection; its only gap protection is an in-memory 500-entry LRU Set (`MAX_DEDUPED_EVENT_IDS=500`) wiped on tab reload. Replay correctness on reload depends 100% on the server honoring the browser's sticky `Last-Event-ID`. | `src/lib/use-server-events.ts:23,27,64-71,79-83` |
| "websocket.ts has heartbeat" | **Partial.** It is an APPLICATION-LEVEL RPC `{type:'req',method:'ping'}`, not a WebSocket protocol ping. Worse, it silently degrades to "passive heartbeat mode" when the gateway replies `unknown method: ping` (`gatewaySupportsPingRef=false`), after which `missedPongs` is never incremented and a stuck-but-open TCP connection will NEVER trigger timeout-reconnect. A real liveness hole. | `src/lib/websocket.ts:31-32,168-210,418-428` |
| "Keep PTY/gateway WebSockets sticky; sticky/local affinity required" | **Partial.** This is an unimplemented operational expectation, NOT a code guarantee. `pty-manager.ts:201 ptyPool` is a plain in-process `Map`; no affinity header exists anywhere. PTY state silently loses on horizontal scale/restart (tmux is the real durable state; the 200-line scrollback buffer is not). | `src/lib/pty-manager.ts:38-43,201`; `src/lib/pty-websocket.ts:244-274` |
| "websocket.ts has event seq gap detection for missed events" | **Partial.** It tracks `frame.seq` and `warn`s on a gap, but the handler ONLY logs — there is no repair/replay/reconnect action, no SSE-style `Last-Event-ID` resync. "Gap resync" framing overstates it. | `src/lib/websocket.ts:493-499`; `src/lib/websocket-utils.ts:111-120` |

### 2.2 Important code facts the docs missed

1. **`SSE_RETRY_MS = 5_000` is exported and sent as a `retry:` frame on every connect** (`realtime-events.ts:4,173-175`; `events/route.ts:102`) but the docs' constant inventory omits it. It is the dominant reconnect-storm amplifier (fixed value, all clients share one clock).
2. **`formatSseFrame` emits only `id:` and `data:`, never `event:`** (`realtime-events.ts:164-171`). Every event arrives via `onmessage`; clients CANNOT use `es.addEventListener('chat.message', ...)`. Type "filters" are server-side JSON `type` string matches, not SSE event names. Real client-contract constraint the docs fail to state.
3. **The `connected` ack frame carries no `id`** (`events/route.ts:103`), so it never advances the replay cursor; a disconnect mid-handshake gets no indication on replay. Same in `/api/v1/runs/stream` (`stream/route.ts:100-105`).
4. **`/api/v1/runs/stream` ignores `?types=`** entirely (`stream/route.ts:18-23`, hardcoded `RUN_EVENT_TYPES`) and shares **zero** common code with `/api/events` despite ~100 duplicated lines of `highWaterMark`/`safeEnqueue`/`stop`/`sendEvent`/`replay`/`abort`/`cancel` logic — a DRY violation and a maintenance hazard flagged by CLAUDE.md.
5. **`workspaceIdFromData` has no `chat.*` branch** in the table-lookup map (`realtime-events.ts:48-56`). Chat delivery only works because both broadcasters spread the full `messages` row (which carries `workspace_id`). If a future broadcaster omits it, the event is persisted with `workspace_id=NULL` and silently dropped for ALL SSE viewers (`events/route.ts:78`). Latent reliability gap.
6. **`recordingFailureLogged` is a latching flag, never reset** (`event-bus.ts:47,73`). One transient SQLite error permanently mutes the durability warning for process life. (Severity is bounded — see §3 — but the observability defect is real.)
7. **Pruning runs synchronously on the broadcast hot path** before the INSERT (`realtime-events.ts:96,110-130`): age-delete + `COUNT(*)` + `OFFSET 49999` row-cap trim, the read-then-delete non-atomic. Globally throttled to once/60s, but it blocks the event loop for whichever single broadcast hits it.
8. **`forwardInfo.delivered = true` is set unconditionally on the invoke path** (`route.ts:539-545`) before parsing success — a failed coordinator invocation whose gateway returns a non-throwing error payload is marked `delivered`.
9. **`deliver: false` is always passed to the gateway** (`route.ts:507,523`). Opzava intentionally suppresses gateway-side delivery and relies on the 9s `agent.wait` polling loop. If `agent.wait` times out, the coordinator's real reply is NEVER written back to the messages table — only a "still processing" status. No webhook/async completion handler back-fills it.
10. **`deliver: false` + 12s send + 9s wait = up to ~21s POST latency** before the user's own message is broadcast at `:733`. The docs' "~8-9s agent.wait" understates it.
11. **`messages.created_at` is `DEFAULT (unixepoch())` — second granularity, no ms/seq column** (`migrations.ts:73`). GET orders `ORDER BY created_at ASC` with NO `, id ASC` tie-breaker (`route.ts:284`); the SEED migration at `:734` correctly uses `created_at ASC, id ASC`, proving the idiom is known and simply not applied to chat reads.
12. **`pruneRealtimeEvents` row-cap is a SOFT target, not a hard cap** — non-atomic SELECT-then-DELETE with no transaction (`realtime-events.ts:122-128`).
13. **No `client_message_id` anywhere in the write path** (grep-confirmed zero hits) and no UNIQUE constraint on `messages` (`migrations.ts:64-74`).
14. **Store `addChatMessage` dedups on positive server id only** (`store/index.ts:1120` `message.id > 0 && ...`), explicitly excluding all negative-id messages — including gateway `tool.stream` frames that synthesize `id: -(Date.now() + Math.random())` (`websocket.ts:577-578`).
15. **Gateway socket reconnect gives up permanently after 10 attempts** (`maxReconnectAttempts=10`, `websocket.ts:815-824`); `NEXT_PUBLIC_GATEWAY_OPTIONAL=true` disables reconnect from the first failure.
16. **No graceful instance drain**: `mc-server.cjs:47-49` SIGTERM handler calls only `disposeAllPtySessions()`; the Next HTTP server is never `.close()`'d, so every SSE viewer is hard-dropped on every redeploy.

---

## 3. Confirmed Production Gaps

Sorted P0 → P3. Each carries sad path, root cause, file:line evidence, minimal fix. **Scale-dependent** items are marked ⟐.

### P0 — must fix before production user chat

#### P0-1. Coordinator identity spoofing via `body.from` override (integrity/auth)
- **Sad path**: Any operator POSTs `{ from: 'coordinator', to: <victim>, conversation_id: <victim thread>, content: '…', forward: false }`. The route treats `from === 'coordinator'` as a privileged override (`isCoordinatorOverride`, pure string match), inserts the message as `from_agent='coordinator'` with NO gateway round-trip and NO verification the caller is the coordinator runtime. The spoofed message is broadcast to the victim's SSE stream and persisted as a legitimate-looking coordinator utterance.
- **Root cause**: `requestedFrom` is read from the client-controllable `body.from`; the override is granted by literal string match, with no role/ownership check. The misleading comment `// Sender identity is always resolved server-side` is false for the coordinator case.
- **Evidence**: `src/app/api/chat/messages/route.ts:325,336-340,375-382,400-409,733`; `src/lib/auth.ts:632-644` (requireRole only checks viewer<operator<admin; coordinator is an agent identity, not a user role).
- **Minimal fix**: Stop honoring `body.from` for human sessions — always `from = auth.user.display_name || auth.user.username || 'system'`. Allow the coordinator override ONLY when authenticated with the coordinator agent's scoped API key (`auth.user.agent_name === COORDINATOR_AGENT`, via `agent_api_keys`). ~4 lines, reuses existing primitives, conforms to the route's own docstring contract.

### P1 — must fix before production user chat (correctness/durability)

#### P1-1. Write path lacks transactional integrity — 4 independent auto-commits
- **Sad path**: Operator sends a chat message. INSERT messages (`:374`) commits; `logActivity` (`:389`) commits independently; `createNotification` (`:401`) commits independently; `eventBus.broadcast → recordServerEvent` (`:733`) commits the outbox row independently. A SIGKILL/OOM/container restart between any two leaves an orphaned half-state — e.g. a message row with NO outbox row, permanently invisible to every SSE viewer across reconnects while still visible via GET.
- **Root cause**: No `db.transaction(() => {...})` wraps the durable writes. Each `db.prepare(...).run()` auto-commits; WAL + `synchronous=NORMAL` makes each durable on return, so the gaps are real on-disk states.
- **Evidence**: `src/app/api/chat/messages/route.ts:374,389,401,733`; `src/lib/realtime-events.ts:98-101`; `src/lib/db.ts:367-440,46-47`. Grep confirms ZERO `db.transaction` occurrences in `src/app/api/chat/`.
- **Minimal fix**: Wrap the messages INSERT + activity + notification + the chat.message outbox INSERT in ONE `db.transaction(() => {...})` begun with **`BEGIN IMMEDIATE`**. Emit `eventBus.broadcast` AFTER commit (the in-process fast path), but put the `realtime_events` row INSIDE the tx so the SSE poller can always replay it. **`BEGIN IMMEDIATE` is load-bearing**: better-sqlite3's `db.transaction` is `DEFERRED` by default, and per sqlite.org/lang_transaction.html §2.1 the `busy_timeout` handler is NOT reliably honored when a DEFERRED read transaction upgrades to a write — a concurrent second writer (MCP/CLI/cron) can surface `SQLITE_BUSY` mid-transaction despite the 5s budget. Acquiring the reserved lock at `BEGIN` makes the timeout deterministic. Do NOT build a generalized `recordServerEventInTx`/`send_event_on_commit` abstraction — `db.transaction` is already used 31× across this codebase (runner, admin-config, scheduler), so this is idiomatic, not new machinery.

#### P1-2. Outbox row written AFTER up to ~21s of gateway I/O — restart-mid-publish orphan + reply-before-original ordering
- **Sad path**: Message committed at `:374`; then awaits gateway send (12s, `:510`) or invoke (12s, `:537`), then `agent.wait` (9s, `:617`); the user's own message is broadcast only at `:733`. Coworker B's SSE sees nothing for up to ~21s. If the process dies in that window: row is durable but no outbox row exists → B's reconnect replay finds nothing → "phantom" message only a manual REST GET surfaces. Separately, `createChatReply` broadcasts coordinator status replies (`:108`) BEFORE the originator (`:733`), so B sees "Received. I am coordinating…" before A's question.
- **Root cause**: Outbox write positioned after network I/O instead of inside the message-insert transaction; broadcast treated as a post-I/O side-effect rather than the durability boundary.
- **Evidence**: `src/app/api/chat/messages/route.ts:374,501-511,526-538,605-617,733`; `createChatReply` at `:79-112`.
- **Minimal fix**: Move the chat.message outbox insert INTO the message-insert transaction (folds into P1-1) so it commits at `:374` before any network I/O. Keep the in-process emit at `:733` for live SSE. Broadcast the originating user message BEFORE generating coordinator replies (also fixes the ordering bug). Do NOT decouple the gateway round-trip from the HTTP response with a background job — no job-queue infrastructure exists and the synchronous forward-and-wait contract is acceptable for an internal tool.

#### P1-3. No `client_message_id` — Retry after lost 201 creates duplicate committed message + duplicate gateway run
- **Sad path**: POST commits row id=42; network drops the 201; user clicks Retry (`message-list.tsx:98-125`), which re-POSTs identical content with no idempotency key; server INSERTs row id=43; `idempotencyKey = mc-${messageId}-${Date.now()}` regenerates fresh (messageId is a new autoincrement, Date.now() is new); gateway runs the downstream agent a SECOND time. Store dedup keys on positive server id only (`store/index.ts:1120`) so 42 ≠ 43 → both kept.
- **Root cause**: No client-supplied stable key; gateway key derived from server-generated messageId + Date.now() (non-deterministic).
- **Evidence**: `src/app/api/chat/messages/route.ts:369-382,498`; `src/lib/migrations.ts:64-74`; `src/components/chat/message-list.tsx:105-114`; `src/store/index.ts:1119-1122`.
- **Minimal fix**: Add `client_message_id TEXT` + partial UNIQUE INDEX `(workspace_id, conversation_id, from_agent, client_message_id) WHERE client_message_id IS NOT NULL`. In POST, `INSERT ... ON CONFLICT(...) DO NOTHING RETURNING id`; if RETURNING yields nothing, SELECT the existing id so the retry returns the SAME id 42. Derive the gateway key from `client_message_id`, not `messageId+Date.now()`. Client generates one UUID per logical send, replays on Retry. **Do NOT** adopt the no-op-`UPDATE...RETURNING` idiom — `DO NOTHING` + optional SELECT is simpler and sufficient (REJECT over-engineering). Also fix the identical `mc-{id}-{Date.now()}` anti-pattern in `src/lib/task-dispatch.ts:984,1291,1351`.

#### P1-4. SSE replay silently drops events past the 200-row/7-day cap — no resync sentinel
- **Sad path**: Tab is backgrounded >7 days (or >200 workspace events missed between two SSE deliveries). Browser keeps sticky `Last-Event-ID=N`. On reconnect, `readServerEventsAfter` runs `WHERE id>N AND workspace_id=? ORDER BY id ASC LIMIT 200` with no overflow check and no comparison against `min(id)`; N predates retention → only the newest ≤200 retained rows return, every event between N and the oldest retained row is a permanent silent gap. No client indication; unread counts/last-message previews go wrong.
- **Root cause**: Flat forward-scan capped at `SSE_REPLAY_LIMIT=200`; no gap/overflow/age detection, no resync signal.
- **Evidence**: `src/lib/realtime-events.ts:7,132-156`; `src/app/api/events/route.ts:92-100`; grep confirms NO `resync|gap_expired|overflow|sentinel|min(id)` logic anywhere in src/.
- **Minimal fix**: At connect, fetch `SELECT min(id) FROM realtime_events WHERE workspace_id=?`. If `parseLastEventId > 0 AND lastSentId < min(id)`, emit a control event `{type:'resync.required', data:{reason:'retention-gap'}}` and set `lastSentId = min(id)-1` — do NOT partial-replay across a known gap. Client handles `resync.required` by forcing a full REST re-fetch of affected collections. Optionally page through multiple 200-row pages during initial reconnect.

#### P1-5. Deployment SSE smoke test asserts only opening frames — buffering proxies pass green
- **Sad path**: Operator runs `dokploy-parity-test.sh`; it curls `/api/events` for 5s and greps for `retry: 5000` + `"type":"connected"` — both emitted synchronously at stream open (`events/route.ts:102-103`). A proxy that buffers AFTER the initial flush passes green. Production chat then stalls 30-60s because the live stream is buffered.
- **Root cause**: Static-content assertion, no temporal/liveness probe. `docker-compose.dokploy.yml` Traefik has no `respondingTimeouts`/`responseForwarding` config. `/api/v1/runs/stream` has zero smoke coverage (explicitly in `api-contract-parity.ignore:7`).
- **Evidence**: `scripts/dokploy-parity-test.sh:89-111`; `src/app/api/events/route.ts:102-103`; `docker-compose.dokploy.yml:13-33` (grep: no streaming/timeout config anywhere).
- **Minimal fix**: Make the test temporal — open the SSE connection, POST a workspace-scoped event from a second authenticated curl, assert the matching data frame arrives on the same open connection within ~3s; fail if not. **Do NOT** add `traefik responseForwarding.flushInterval` labels — Traefik v3 auto-detects `text/event-stream` and ignores `flushInterval` for streaming responses; the labels would be dead config giving false confidence. Note: Traefik auto-detection already makes the most-cited failure mode not apply to this deployment; the test upgrade is defense against a future CF/enterprise proxy.

### P2 — fix soon, scale-aware

#### P2-1. Workspace-only SSE filter has no conversation-membership ACL (privacy, scale-bounded)
- **Sad path**: User A DMs the coordinator in `coord:secret-merger`; every coworker B in the same workspace with an open SSE stream receives the private message verbatim (live AND on reconnect replay). The UI treats `coord:`/`agent_` ids as private DM threads, but the only enforced boundary is workspace_id.
- **Root cause**: No `conversation_members` table; `conversation_id` is free text (`migrations.ts:66`); the only access dimension is workspace_id.
- **Evidence**: `src/app/api/events/route.ts:78`; `src/lib/realtime-events.ts:140-147`; `src/app/api/chat/messages/route.ts:733`.
- **Calibration**: For Opzava's realistic single-workspace-trusted-team deployment this is an accepted operational property, NOT a cross-tenant breach. It is already documented in `realtime-chat-architecture.md` as a known gap / Target Topology item.
- **Minimal fix (now)**: At the `sendEvent` boundary, for `chat.*` events, drop unless viewer identity matches `message.from_agent` or `message.to_agent`, OR viewer role is operator/admin. Zero schema change — `from_agent`/`to_agent` are already on the row. Apply the same predicate in the replay caller path. **Do NOT** build the full `chat_participants`/`conversation_seq`/read-state tier as part of this fix — it is the documented Target Topology and folding it into a hotfix violates REJECT over-engineering.

#### P2-2. ⟐ Synchronous better-sqlite3 SSE outbox poll: N clients = N blocking SELECTs/sec
- **Sad path**: Each SSE client runs `setInterval(replayFromStore, 1000)` → synchronous `db.prepare(...).all()` on the main thread. 50 viewers = 50 blocking SELECTs/sec; reconnect burst doubles it.
- **Calibration/refutation of the doomsday framing**: WAL means readers do NOT block writers (the "read lock contends with INSERT" claim is false). The replay query is a fully index-served bounded 200-row range scan (`idx_realtime_events_workspace_id`), microseconds-to-low-ms. Prune is globally throttled to once/60s and runs on the WRITE path only — it does NOT multiply by N. At internal-team scale (~5-50 viewers) this is rounding-error load, not an event-loop wedge.
- **Evidence**: `src/app/api/events/route.ts:104,116`; `src/lib/realtime-events.ts:6,140-147`; `src/lib/db.ts:46-52`.
- **Minimal fix (now)**: Optional drive-by — add per-connection jitter to the `retry:` frame (see P1-6 below). **Do NOT** build the single-reader-per-process refactor — it adds a singleton coordinator to eliminate a non-problem (over-engineering).
- **Phase 2/3**: Replace the per-connection poll with a single coalesced timer per workspace OR a broker adapter (Redis Streams wake-up) carrying only the event_id.

#### P2-3. ⟐ Reconnect storm — fixed `retry:5000` + browser-native lockstep reconnect
- **Sad path**: Deploy/restart drops all SSE sockets simultaneously; every browser fires native EventSource reconnect at the same fixed 5s mark; each triggers a workspace-scoped replay SELECT against the table also being polled 1×/sec per active handler.
- **Calibration**: At internal-team scale (handful of operators) the herd is bounded and the 1s poll + 15s heartbeat + WAL indexed reads absorb it. Real but not a wedge.
- **Evidence**: `src/lib/realtime-events.ts:4,173-175`; `src/lib/use-server-events.ts:79-83` (onerror just logs; relies entirely on browser-native reconnect); grep confirms no jitter/backoff/attempt-tracking.
- **Minimal fix**: Make the `retry:` frame jittered per-connection — replace `formatSseRetryFrame()` with `formatSseRetryFrame(base=3000, jitter=4000)` → `retry: ${base + Math.floor(Math.random()*jitter)}`. Re-emit on each (re)connect (already done). Zero new client code, keeps native EventSource semantics, ~5 lines. (AWS Full-Jitter: `random(0, min(cap, base*2^attempt))` is the proven formula.)

#### P2-4. ⟐ No graceful instance drain — SIGTERM hard-kills SSE mid-stream
- **Sad path**: `docker compose up -d --build` sends SIGTERM; `mc-server.cjs` disposes PTYs and exits without `.close()`-ing the HTTP server; every SSE viewer hard-drops at TCP; a chat POST in-flight (up to ~21s) may commit the row but never reach `broadcast`.
- **Calibration**: Bounded — events are persisted to `realtime_events` before emit, the 1s poll + `Last-Event-ID` replay recover the gap on reconnect within ~5s, no permanent data loss. The "lockstep storm" is a few internal clients.
- **Evidence**: `scripts/mc-server.cjs:43-49,54-56`; `src/app/api/events/route.ts:49-55`; `src/lib/db.ts:626-628`; `scripts/deploy-standalone.sh:68-86`.
- **Minimal fix**: Retain the server reference in the existing `patchCreateServer` wrapper; on SIGTERM call `server.close()` + a short bounded `setTimeout(~2s, hard-coded)` before `disposePtysOnly()`. **Do NOT** build the draining-flag/resync.required-broadcast/configurable-drain/grace-period-coordination subsystem — the durable replay is already a complete safety net.

#### P2-5. ⟐ Recording-failure volatile fallback — latching flag + client dedup mis-key
- **Sad path**: One transient `recordServerEvent` throw sets `recordingFailureLogged=true` (never reset), mutes the warning for process life, and emits a volatile `{type,data,timestamp}` with no id. Client dedup at `use-server-events.ts:64` falls back to sticky `event.lastEventId` (the PRIOR event's id, already in the Set) → the volatile event is mis-deduped and skipped.
- **Calibration**: Server-side SSE drop is REFUTED for chat — `serverEventWorkspaceId` falls back to `data.workspace_id`, and chat broadcasts spread the full row (which carries workspace_id). The genuine bug is the client-side mis-dedupe (drops volatile events) + the latching flag (mutes the warning). Trigger is near-never (requires `busy_timeout=5000` to be exceeded or a disk fault).
- **Evidence**: `src/lib/event-bus.ts:47,65,71-77`; `src/lib/use-server-events.ts:64-66`; `src/lib/realtime-events.ts:68-76`.
- **Minimal fix**: (1) In `event-bus.ts`, reset `recordingFailureLogged=false` after a successful `recordServerEvent` (or rate-limit the warn to 1/60s). (2) In `use-server-events.ts:64`, only dedupe when `payload.id` is a real number — id-less volatile events bypass the Set entirely. **Do NOT** add broadcast retry/request-failing semantics to a throwaway realtime log table (over-engineering).

### P3 — defer / opportunistic

- **P3-1. `created_at` second-granularity + no tie-breaker** (`route.ts:284`, `conversations/route.ts:65`). Add `, id ASC` / `, id DESC`. The real, frequently-triggered defect (replies broadcast before originator) is fixed by P1-2's broadcast reorder, NOT by ORDER BY. **Do NOT** add `conversation_seq` counter table (over-engineering for single serialized writer).
- **P3-2. ⟐ Optimistic send + late SSE echo double-renders for seconds** (orphaned temp bubble). Fixed as a side-effect of P1-3 (`client_message_id` lets `addChatMessage` upsert-by-key instead of appending alongside the temp).
- **P3-3. IDOR via client-supplied `conversation_id`** — REFUTED as P0 (no coworker-to-coworker private messaging exists; workspace IS the trust boundary). Real kernel: derive `coord:<caller_username>:coordinator` server-side so one operator can't write into another's coordinator thread. P3 hardening.
- **P3-4. ⟐ Pruning on broadcast hot path** — move to a boot-started `setInterval(process, 60s)` (mirrors existing `github-sync-poller`/`scheduler`/`rate-limit` pattern). Keep throttle as guard. Do NOT wrap the trim in a transaction or rewrite the OFFSET query (rowid b-tree walk is already efficient; single-writer serialization provides effective atomicity).
- **P3-5. ⟐ Zero realtime observability** — add a lightweight in-process counter module: `activeSseConnections` gauge, rolling P95 of `Date.now() - event.timestamp` at `sendEvent` delivery, `realtime_events` row count. Expose via `GET /api/ops/metrics` text endpoint or 60s log line. No metrics backend. Explicitly DROP broker-lag/load-test/capacity/drain items as Phase 2/3.
- **P3-6. ⟐ PTY session affinity is purely in-process** — silently loses scrollback buffer on horizontal scale/restart (tmux is the real durable state). Documented as an unsatisfied prerequisite, not a code bug. Address only when multi-instance lands.
- **P3-7. Gateway socket passive-heartbeat hole** — degraded liveness detection when gateway replies `unknown method: ping`. Internal to the gateway control socket, not chat delivery. Opportunistic.
- **P3-8. Reconnect race / 200-cap on full page reload** — REFUTED as P1 double-delivery (`broadcast()` records-then-emits with id; replay guard excludes; every store reducer is id-idempotent). Real residual: on full reload the client sends no `Last-Event-ID`, server replays `id ASC LIMIT 200` (oldest, not newest). Optional fix: persist last-seen id in `sessionStorage`. Covered by P1-4's resync sentinel anyway.

- **P3-9. SQLite production config incomplete + redundant index** (primary-source: sqlite.org, better-sqlite3). `db.ts` correctly sets WAL + `synchronous=NORMAL` + `busy_timeout=5000`, but: `cache_size=1000` is ~4 MB (near the floor — raise to `-65536` ≈ 64 MB); omits `temp_store=MEMORY` and leaves `wal_autocheckpoint` unset (keep the default 1000 — **do not disable**, or the WAL grows and read latency degrades, sqlite.org/wal.html §2.3); and carries a redundant dead index `idx_realtime_events_id` on `realtime_events(id)` (the `INTEGER PRIMARY KEY AUTOINCREMENT` already IS the rowid index — minor). Pair every outbox-touching write transaction with `BEGIN IMMEDIATE` (see P1-1). No schema/logic change; add the missing pragmas to the existing `PRAGMA` block and drop the dead index. **Do NOT** add `mmap_size`/`journal_size_limit` until the events table nears the 50k-row cap (premature). Note: all write-transaction discipline is verified non-blocking on the reader axis — sqlite.org/wal.html §1 confirms "readers do not block writers and a writer does not block readers"; the per-connection 1s poll SELECT is fully served by `idx_realtime_events_workspace_id(workspace_id, id)` at microsecond grade.

> **36 additional low-severity deduped findings** beyond the top 30 above were triaged and set aside as non-blocking (cosmetic, defense-in-depth, or duplicate-of-above). Available on request.

---

## 4. Refuted / Out-of-Scope

Findings the skeptics rejected, with reasoning — recorded so we know they were considered:

1. **"`conv_${Date.now()}` default races / splits threads on retry"** — REFUTED. The default branch is dead code: every first-party caller pins a deterministic `conversation_id` (`chat-workspace.tsx:183,614` `activeConversation`/`agent_${name}`; `agent-comms-panel.tsx:320` `agent_${to}`/`coord:${from}:${COORD}`; retry path `message-list.tsx:114` reuses `msg.conversation_id`). The send button is disabled without `activeConversation`. No client exercises the `Date.now()` branch. (The retry-mints-new-row issue is real and lives at P1-3, but it does NOT split conversations.)

2. **"Coordinator reply chain broadcasts out of order"** — REAL but mis-scoped as a separate top finding; it is the same root cause as P1-2 (outbox write positioned after I/O) and is fixed by the same broadcast-reorder change. Listed under P1-2, not standalone.

3. **"Cross-process race: in-process emit() and 1s poll deliver the same event twice"** — REFUTED. `broadcast()` calls `recordServerEvent` FIRST (which assigns the numeric id and returns the id-bearing event), THEN emits — so the live handler advances `lastSentId` and replay's `WHERE id > lastSentId` excludes it. Every store reducer (`addTask`/`addAgent`/`addActivity`/`addNotification`/`addChatMessage`) deduplicates by stable DB id. No double-render is possible for any event type.

4. **"null-workspace chat events persisted but permanently invisible"** — REFUTED for chat. Both broadcasters spread the full `messages` row (`SELECT * FROM messages`), which carries `workspace_id` (NOT NULL DEFAULT 1, `migrations.ts:628`). `workspaceIdFromData`'s direct lookup succeeds without ever reaching the table-lookup fallback that lacks a `chat.*` branch. Latent code-smell, not an active bug.

5. **"Last-Event-ID replay reads ANY member's events — auth leak"** — REFUTED as a leak. The authorization boundary in THIS codebase is uniformly `workspace_id`, not conversation membership: GET `/api/chat/conversations` and GET `/api/chat/messages` already return all workspace messages to any viewer via the same `WHERE workspace_id=?`. The SSE replay path is CONSISTENT with the REST access model, not weaker. (The underlying membership-ACL gap is real and tracked at P2-1.)

6. **"Volatile fallback drops chat.message from SSE entirely"** — REFUTED for the server-side drop. `serverEventWorkspaceId` falls back to `data.workspace_id`; chat data carries it. The genuine residual (client dedup mis-key + latching flag) is tracked at P2-5.

7. **Out-of-scope (correctly deferred, not defects)**: Redis/NATS broker adapter, consumer-Slack concurrency (thousands of viewers), `conversation_seq` counter table, full `chat_participants` membership tier, presence/typing channel, multi-instance horizontal fanout, per-host stable jitter for periodic timers, token-bucket admission control, single-layer-retry discipline — all Phase 2/3 per ARD 0009 and the project's own `realtime-chat-architecture.md`.

---

## 5. Missed Angles (now filled in)

The original research did NOT cover these; this audit supplies them:

1. **Dual-cursor ordering / RESUMED sentinel / cursor purity** (Discord primary source). Opzava conflates the SSE replay cursor (global event_id) with conversation display ordering. Discord proves these are TWO cursors with TWO lifetimes (session-scoped `s` vs durable Snowflake). There must be an explicit signal that gap-replay has finished (RESUMED equivalent) — Opzava's `Last-Event-ID` replay has no end-of-replay event, so a client cannot distinguish "still catching up" from "now live." Ephemeral frames (future typing/presence) must NOT advance or break the durable cursor.

2. **The strict-monotonic `if (payload.s > cursor) cursor = payload.s` guard** as the idempotent cursor-advancement primitive (discord.js). Opzava lists idempotency for SENDS but never specifies the analogous idempotency for CURSOR/DELIVERY state — exactly where the 1s poller races the in-process emit. Single `>` check, zero locking.

3. **Initial-state reconcile: queue-then-fetch-then-drain-then-apply** (Zulip). Closes the cold-start/reconnect race (REST snapshot read vs SSE attach) WITHOUT a distributed lock. Reserve the cursor BEFORE the REST snapshot, then on first SSE tick deliver from that cursor forward and merge. `apply_event` must be written so applying an event whose effect is already in the snapshot is a no-op (testable invariant).

4. **Stale-cursor REJECTION** (Zulip `newest_pruned_id`). A client that acks out-of-order or reconnects with an old cursor should get a hard error forcing re-register, not a silent partial replay. Opzava has no such guard — directly maps to the P1-4 resync sentinel.

5. **Single-writer-monotonic stream_id assigned INSIDE the persistence transaction** (Matrix/Synapse). Reserve the ordering token inside the BEGIN IMMEDIATE tx that persists the row, not before/after. SQLite INTEGER PRIMARY KEY autoincrement already provides this; the discipline is (a) message+outbox in one tx, (b) emit only AFTER commit, (c) carry that id as the SSE cursor. Protects `WHERE id > cursor` queries from returning events whose predecessor is still in flight.

6. **Two-layer idempotency with byte-identical response on retry** (Matrix + event-driven.io). Not just a UNIQUE constraint — the response BODY must be cached and replayed verbatim so optimistic-UI reconciliation gets the SAME message_id back. Opzava's `mc-{id}-{Date.now()}` is the documented anti-pattern.

7. **EDU/PDU split: durable vs ephemeral on one multiplexed stream** (Matrix). Ephemeral frames are deltas (REPLACE state, not append), at-most-once, never in the cursor. Keeps the durable cursor clean.

8. **Per-eventName subscription index (Rocket.Chat `subscriptionsByEventName`)** — the concrete O(1) data structure to fix the "broadcast all workspace events to every viewer" problem: `Map<topic, Set<connection>>` where topic = `chat.conv:{conversationId}`. The exact inverse of the current broadcast-all design.

9. **Read-receipts as a single moving `last_seen_at`/`last_read_seq` cursor from which unread_count is DERIVED** (Chatwoot + Rocket.Chat `lr`). NOT a per-message ack table. UPSERT with `MAX(current, new)`; emit `chat.read` only when the cursor actually advances. Rejects a whole class of over-engineering.

10. **Redis sorted-set presence with self-healing TTL** (Chatwoot + Svix). `ZADD presence:<scope> <now> <userId>`; `ZRANGEBYSCORE` for online; periodic `ZREMRANGEBYSCORE` prunes. Idempotent (ZADD overwrites), self-cleaning (absence ⇒ offline), no disconnect-callback storm. Implementable on SQLite today (`presence_heartbeats(user_id, last_seen_at)` + TTL), swap to Redis ZSET behind the same interface at the broker phase.

11. **Typing debounce + server-side per-pair rate gate + drop-don't-buffer priority + EXCLUDE the originator** (WhatsApp design + Chatwoot). Emit once per 3s, "stopped" 5s after last keystroke; server drops typing faster than once per 2s per `(sender,conversation)`; under queue pressure drop typing first, presence next, durable messages last; never echo typing/presence back to the sender.

12. **Reconnect storm mitigation is unaddressed** (AWS Full-Jitter). The docs mention reconnect-storm load tests as Phase 3 but never name the mechanism (Full-Jitter, token-bucket retry budget, single-layer retry). Native EventSource has ZERO jitter.

13. **No half-open detection** (Discord `heartbeat_timeout`). The client trusts that if `onerror` hasn't fired, the connection is alive. Discord's pattern (no-frame-within-timeout → force close + reconnect) handles half-open TCP and zombie proxies.

14. **Multi-tab within one browser is unaddressed** (Web Locks + BroadcastChannel leader pattern). Every Opzava tab opens its OWN EventSource → 3 tabs = 3 server connections = 3× poll load + 3× reconnect storms. On HTTP/1.1 (a standalone deploy or a proxy not doing h2 to browser), 3-6 tabs can exhaust the per-browser 6-connection budget. The leader-tab pattern is the only way to keep the single-stream invariant true per-browser.

15. **Proxy specifics are hand-waved** — nginx `proxy_read_timeout` defaults to 60s (kills SSE at 60s); `proxy_ignore_headers X-Accel-Buffering` silently disables the app's escape hatch; Traefik needs buffering middleware OFF + known transfer-encoding SSE bug history (#8623); Cloudflare 524 after ~100-120s + observed buffering to ~100KB regardless of heartbeat. None of the docker-compose files encode SSE-safe proxy config.

16. **`Last-Event-ID` spec edge cases unhandled**: sticky cursor (ephemeral events must carry id or be deliberately excluded); empty-value `id:` RESETS the cursor (suppresses header on next reconnect); HTTP chunking by a different layer can break timing.

17. **No single-layer-retry discipline** (AWS). Opzava now has SSE client retry, EventSource native retry, outbox poller, and (future) broker retry — all potentially compounding (3^5 = 243x). No layer is designated as owning chat-delivery retry.

*(Slack primary-source additions — slack.engineering real-time-messaging / scaling-datastores-at-slack-with-vitess)*
18. **(Slack) Write-path DB latency is the real user SLA, not the fanout push.** Slack persists before fanout, so users feel the DB write, not the WebSocket push. The `realtime_events` INSERT must be fast and in-transaction; the audit should target the *write path's* p99, not the SSE push path's.
19. **(Slack) The 1s outbox poll is a CORRECTNESS parameter, not just a perf one.** It is the floor guaranteeing a missed SSE event recovers within ~1s. It must stay at-least-once, monotonic (`id > cursor`), and never coalesce/drop rows under load — if it ever backoffs or drops, durability silently degrades.
20. **(Slack) The in-process event bus is a fanout ACCELERATOR, not a reliability layer.** It is best-effort push to currently-connected clients, analogous to Slack's Gateway-Server tier. Reliability lives in the SQLite outbox. This framing decides what may be optimized freely (the bus) vs. what must be hardened (the outbox + write transaction).
21. **(Slack) Distinguish a durable EVENT from a durable SIDE EFFECT.** An SSE event is a *notification* of a domain change already persisted in domain tables; the outbox row is the source of truth for DELIVERY, not for domain state — it must reference the domain entity, not *be* it.
22. **(Slack) `event_id`-style dedup must cover Opzava's OWN internal retries.** Slack tags every outbound event with an `event_id` so receivers dedupe. The outbox `id` gives read-side dedup for free — but ONLY if the client drops `id <= lastSeen` on every receive, including the post-reconnect burst where the 1s poller and live SSE push can both deliver the same event. (Maps to P2-5's client dedup fix.)

---

## 6. Proven Reusable Patterns

Each with source URL, mapping to the SSE+HTTP-write spine, and license note. **Patterns over vendoring.**

### 6.1 After-commit event dispatch + in-tx outbox row (Zulip `send_event_on_commit`)
- **Source**: https://github.com/zulip/zulip/blob/main/zerver/tornado/django_api.py ; https://github.com/zulip/zulip/blob/main/docs/subsystems/events-system.md (Apache-2.0, pattern only)
- **Mapping**: Realizes P1-1/P1-2. The durable outbox row goes INSIDE the `db.transaction(() => { insertMessage; insertOutbox; })`; the in-process `eventBus.broadcast` fires AFTER commit. Enforced by confining `broadcast`-with-outbox calls to the chat-write service (`@/opzava/modules/...`), not bare emits. A crash between commit and SSE still delivers via the 1s poller.
- **License**: pattern only.

### 6.2 Client-supplied idempotency key with claim-then-finalize (Mattermost `deduplicateCreatePost`)
- **Source**: https://github.com/mattermost/mattermost/blob/master/server/channels/app/post.go (AGPL v3.0, pattern only)
- **Mapping**: Realizes P1-3. Client sends `client_message_id` (UUID) on every POST. Server: claim with sentinel; if present-with-real-id return it; defer-finalize on success/failure. **Critical caveat Mattermost exposes**: their cache is node-local and fails behind a non-sticky LB — Opzava MUST key on the shared SQLite outbox, not in-process memory (Mattermost's documented limitation).
- **License**: AGPL v3.0 — pattern only, do not vendor.

### 6.3 Heartbeat piggybacks the resume cursor (Discord `discord.js`)
- **Source**: https://github.com/discordjs/discord.js/blob/main/packages/ws/src/ws/WebSocketShard.ts#L601 (Apache-2.0, pattern only)
- **Mapping**: Make the SSE 15s heartbeat comment line carry the server's current high-water event_id (`: heartbeat cursor=18422`); client echoes its last applied id back as `Last-Event-ID` on reconnect. Unifies liveness + replay-cursor sync into the existing tick — zero new frames. Zombie detection (one missed ACK ⇒ reconnect+resume) maps to: if SSE client misses N heartbeats, EventSource auto-reconnects and route replays.
- **License**: pattern only.

### 6.4 Monotonic-seq guard: only advance the high-water mark forward (Discord)
- **Source**: https://github.com/discordjs/discord.js/blob/main/packages/ws/src/ws/WebSocketShard.ts#L776 (Apache-2.0)
- **Mapping**: Apply to BOTH cursors: (1) SSE replay cursor per-client — only write new event_id if strictly greater; (2) outbox poller's last-fetched id — only advance on strict-greater. Cheapest possible thread-safe idempotency for cursor state, zero locking. Critical for the 1s poller racing in-process emit.
- **License**: pattern only.

### 6.5 Resume = control op + replay-from-cursor + terminal marker (Discord op-6 + RESUMED)
- **Source**: https://docs.discord.com/developers/events/gateway ; https://docs.discord.com/developers/events/gateway-events
- **Mapping**: Realizes P1-4. EventSource auto-reconnects with `Last-Event-ID`; route replays rows `id > Last-Event-ID` in order, then switches to live tailing, then emits a synthetic `replay.complete` event (mirrors RESUMED) so the client knows the gap is closed. Resumable-vs-cold-start decision: if `Last-Event-ID` is still in the retention window, resume; else emit `resync.required` (mirrors op-9 d=false) and client does full REST re-fetch.
- **License**: pattern only.

### 6.6 Initial-state reconcile without a lock (Zulip `queue-then-fetch-then-drain-then-apply`)
- **Source**: https://github.com/zulip/zulip/blob/main/zerver/lib/events.py ; https://github.com/zulip/zulip/blob/main/docs/subsystems/events-system.md (Apache-2.0)
- **Mapping**: Closes the cold-start/reconnect race. Reserve cursor BEFORE REST snapshot, then on first SSE tick deliver from cursor forward, client merges. `apply_event` must be idempotent against the stale snapshot — Zulip enforces this with an automated `verify_action` test discipline worth copying.
- **License**: pattern only.

### 6.7 Per-eventName subscription index (Rocket.Chat `subscriptionsByEventName`)
- **Source**: https://github.com/RocketChat/Rocket.Chat/blob/develop/apps/meteor/server/modules/streamer/streamer.module.ts (source-available/enterprise, pattern only)
- **Mapping**: Fixes P2-1's "broadcast all workspace events to every viewer." Replace the single broadcast set with `Map<topic, Set<res>>` where topic = `chat.conv:{conversationId}` (keep `ws:{workspaceId}` as coarse topic). On `chat.message.created`, look up `chat.conv:{convId}` and push only to those SSE responses. Topic already encoded in event payload — no schema change. Honors D7 (membership filter) for free.
- **License**: pattern only — do not vendor Meteor/ee streamer code.

### 6.8 Read-receipts from a durable cursor (Chatwoot conversation model)
- **Source**: https://github.com/chatwoot/chatwoot/blob/develop/app/models/conversation.rb (MIT, pattern only)
- **Mapping**: Add `chat_read_states(participant_id, conversation_id, last_read_seq, updated_at)`; read = UPSERT with `MAX(current, new)`; unread = `messages.conversation_seq > last_read_seq`; emit `chat.read` only when cursor actually advanced. Deriving unread from a cursor eliminates a whole class of drift. Monotonically increasing, idempotent under retry.
- **License**: MIT — pattern only (translate Ruby→TS).

### 6.9 Redis sorted-set presence with self-healing TTL (Chatwoot + Svix)
- **Source**: https://github.com/chatwoot/chatwoot/blob/develop/lib/online_status_tracker.rb (MIT) ; https://www.svix.com/resources/redis/presence-detection/
- **Mapping**: Realizes I14 on SQLite today (`presence_heartbeats(user_id, last_seen_at)`; online = `last_seen_at > now - TTL`; bounded DELETE on read). Swap to Redis ZSET behind the same interface at broker phase. Idempotent (UPSERT/ZADD), no disconnect-callback storm. Two-tier TTL (agents 20s, widget 90s) is a good default.
- **License**: MIT — pattern only.

### 6.10 Web Locks + BroadcastChannel single-leader-tab SSE dedup
- **Source**: https://greenvitriol.com/posts/browser-leader ; https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- **Mapping**: Collapse N tabs into ONE EventSource. Tab that wins `navigator.locks.request('opzava-sse-leader', ...)` alone opens `/api/events`; on each event `postMessage` via BroadcastChannel; followers only subscribe. ~10 lines of public API usage. HTTP/1.1-safe (one connection per browser even without h2). **Gate behind "only if multi-tab users hit limits in non-HTTP/2 environments"** (no-over-engineering).
- **License**: pattern only (~10 lines, reimplement).

### 6.11 Server-side per-connection jittered `retry:` (HTML spec + AWS Full-Jitter)
- **Source**: https://html.spec.whatwg.org/multipage/server-sent-events.html ; https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- **Mapping**: Realizes P2-3. Replace fixed `SSE_RETRY_MS=5000` with `base + random(jitter)` per connection. Zero new client code, keeps native EventSource. Optional escalation on observed rapid reconnects.
- **License**: pattern only.

### 6.12 Outbox consumer-offset table for horizontal scale (event-driven.io) — DEFERRED
- **Source**: https://event-driven.io/en/outbox_inbox_patterns_and_delivery_guarantees_explained/
- **Mapping**: When multi-instance lands, add `realtime_event_consumers(consumer_id, partition_key, last_processed_event_number)` + `partition_key` on the outbox row. Each SSE instance reads `WHERE id > offset` instead of polling all rows. Kafka-style per-consumer cursor. **Explicitly Phase 2/3.**
- **License**: pattern only.

---

## 7. Slack Parity — what to take and NOT take

Slack is cited in the docs but the right lessons are narrow. For an **internal-team self-hosted app**, take these and reject the rest. Each TAKE is anchored to a fetched slack.engineering / Slack API primary source.

### Take
- **Persist-before-fanout (the single most load-bearing rule).** Slack durably writes a message to its datastore *before* pushing it across the realtime/WebSocket tier — storage access is on the critical path of send. *Source: slack.engineering/scaling-datastores-at-slack-with-vitess — "every message sent in Slack is persisted before it's sent across the real-time websocket stack… storage access needs to be very fast and very reliable."* This is exactly what P1-1/P1-2 enforce: the `realtime_events` outbox row commits inside the message transaction, *before* any network I/O or SSE push.
- **Transient events are NOT persisted, never retried, never replayed.** *Source: slack.engineering/real-time-messaging — "Transient events… are not persisted in the database and are sent through a slightly different flow. User typing… is one such event."* `user_typing`/presence have no `conversations.history` representation. Validates Opzava's "ephemeral events only" stance; enforce with an event-type guard in `event-bus.ts` so ephemeral types skip the outbox (and never advance the SSE replay cursor).
- **View-scoped presence (subscribe, don't broadcast).** *Source: docs.slack.dev/reference/events/presence_sub — the client sends an `ids` array; presence emits only for subscribed users.* *slack.engineering/flannel — "a Slack client receives presence notifications only for a subset of users that are visible in the app screen"; moving presence to pub/sub "reduced presence events received by clients by a factor of 5."* Don't broadcast workspace-wide presence.
- **"Durability implies priority" under fanout pressure.** Slack separates durable (persisted → recoverable) from transient (no DB fallback) traffic. The correct framing for Opzava is **not** a formal 3-tier priority queue, but: *drop what is replayable-from-DB last, drop what is never-replayable first* — under SSE backpressure shed `typing`, then `presence`, never durable `message`/`run`/`task` events (they recover on the next 1s poll).
- **Monotonic per-channel message ID; `ts` is NOT a global timestamp.** *Source: docs.slack.dev/messaging/retrieving-messages — "The `ts` value is essentially the ID of the message, guaranteed unique within the context of a channel… They look like UNIX/epoch timestamps… but they're actually message IDs."* *docs.slack.dev/apis/events-api — uniqueness is the combination of `ts` + `channel`, NOT `ts` alone.* Same-second collisions are real (hence Slack's sequence suffix) — validates using SQLite's monotonic autoincrement `id` as the ordering/dedup key, not `Date.now()`. **Prefer integer seq; use timestamps for display only.**

### Do NOT take
- **Multi-tenant consumer-DM privacy model + Events-API "one event, many authorizations" fan-in.** *Source: docs.slack.dev/apis/events-api — one delivery with an `authorizations` array for N visible users.* That is multi-tenant consumer machinery. Opzava's boundary is the workspace; building per-conversation ACLs sized for cross-tenant privacy is over-engineering (P2-1's minimal `from`/`to` predicate suffices).
- **Flannel edge-cache, multi-region edge PoPs / geo-DNS, "degraded mode," 5M-concurrent Elixir Gateway-Server fanout.** *Sources: slack.engineering/flannel (4M connections, 600K QPS), traffic-101 (NS1 filter chains, primary/backup wss DNS), migrating-websockets-to-envoy (millions of sockets, Envoy hot-restart).* All solve global consumer scale Opzava does not have. An in-process bus + 1s outbox poll is the right-shaped solution for an internal tool.
- **Heavy synchronous webhook fan-out on the event-bus emit path.** Slack's Events API is one-request-one-event HTTP POST with a 3s ACK + 3 exponential retries, designed to push *out of* Slack *to* the public internet. Opzava's writes are in-process and reads are SSE from the same process — there is no external HTTP hop on the hot path. Do NOT put a per-event outbound HTTP POST inside `eventBus.emit`; the `webhooks.ts:89` listener already does HTTP dispatch on `'server-event'` and head-of-line blocks `broadcast()`. If webhooks are ever needed, drain them off the outbox asynchronously.
- **Slack's fractional `ts` string encoding** (`"1700000000.000123"`). Use an integer sequence (Snowflake-style or SQLite rowid) — sorts natively, indexes cheaply, avoids float/string comparison pitfalls. The encoding is a public-API accident of history (slackhq/slack-api-docs#7), not a design to emulate.

---

## 8. Remediation Map (ledger I-items)

Re-anchoring the I1..I15 ledger items against this audit. **ADD / SPLIT / REORDER / DROP**, plus new items with phase gating.

| Item | Action | Rationale / Phase |
|---|---|---|
| **I1** (SSE `lastEventId` cursor + replay) | **KEEP, extend** | Already implemented; add P1-4 resync sentinel + RESUMED-equivalent `replay.complete` marker. Phase 1. |
| **I2** (`client_message_id` write idempotency) | **REORDER to Phase 1, top priority** | Confirmed P1-3. Cross-process store (SQLite UNIQUE), not in-process. Folds in P3-2 (optimistic echo). |
| **I3** (workspace SSE filter) | **KEEP** | Implemented; extend with P2-1 `from`/`to` predicate as minimal membership gate. Phase 1 (predicate) → Phase 2 (full `chat_participants`). |
| **I4** (`conversation_seq`) | **DROP** | Over-engineering for single serialized SQLite writer. Use `created_at ASC, id ASC` tie-breaker (P3-1). Revisit only at Postgres multi-writer. |
| **I5** (read states `chat_read_states`) | **KEEP, scope to cursor model** | Realize via Chatwoot `last_read_seq` cursor (§6.8), NOT per-message acks. Phase 2. |
| **I6** (transactional outbox — message+outbox in one tx) | **REORDER to Phase 1, P1-1** | Top durability fix. Single `db.transaction()`, emit after commit. No generalized `recordServerEventInTx` abstraction. |
| **I7** (`deliver:false` + agent.wait reliance) | **SPLIT** | Keep the gateway-suppression design (intentional); ADD a background completion handler or document the 9s-timeout "still processing" behavior as accepted (P1-2 adjacent). Phase 2. |
| **I8** (broker adapter Redis Streams) | **KEEP, Phase 2/3** | Confirmed deferred. Use consumer-offset table (§6.12). Not needed single-node. |
| **I9** (reconnect-storm mitigation) | **REORDER to Phase 1 (jitter only)** | P2-3: jittered `retry:` frame is ~5 lines, do now. Drop load-tests/capacity to Phase 3. |
| **I10** (graceful drain) | **ADD to Phase 1 (minimal)** | P2-4: `server.close()` + 2s bounded wait. No draining-flag subsystem. |
| **I11** (smoke test temporal liveness) | **ADD to Phase 1** | P1-5: POST + assert arrival on open connection. Do NOT add Traefik flushInterval labels (dead config). |
| **I12** (realtime observability) | **SPLIT** | Phase 1: in-process counter module (P3-5). Phase 3: broker-lag/load-tests. |
| **I13** (P0-1 coordinator `from` override) | **ADD to Phase 1, P0** | Stop honoring `body.from` for human sessions; coordinator override only via agent-scoped key. ~4 lines. |
| **I14** (typing/presence) | **KEEP, scope to SQLite ZSET-equivalent** | §6.9: `presence_heartbeats` table now, Redis ZSET at broker phase. Typing debounce + exclude-originator (§5). Phase 2. |
| **I15** (per-eventName subscription index) | **ADD, Phase 2** | §6.7: `Map<topic, Set<res>>`. Replaces broadcast-all. |
| **NEW I16** | **ADD, Phase 1** | `recordingFailureLogged` reset + volatile-event client dedup fix (P2-5). |
| **NEW I17** | **ADD, Phase 1** | Half-open detection: client watchdog on `lastRecv` (Discord `heartbeat_timeout` pattern). Client-only. |
| **NEW I18** | **ADD, Phase 1 (config/docs)** | SSE-safe proxy config matrix per deployment target (nginx `proxy_read_timeout 3600s`/`proxy_buffering off`; Traefik buffering middleware OFF; CF heartbeat <100s caveat). |
| **NEW I19** | **ADD, Phase 2 (conditional)** | Web Locks leader-tab collapse — ONLY if multi-tab users hit HTTP/1.1 connection limits. |
| **NEW I20** | **ADD, Phase 1** | DRY: extract shared SSE module from `/api/events` + `/api/v1/runs/stream` (~100 duplicated lines). Honor `?types=` in both. |

**Phase 1 (before production user chat) = I2, I6, I9-jitter, I10-minimal, I11, I13, I16, I18, I20, + I1-resync, + I3-predicate, + P1-2 broadcast reorder.** Everything else Phase 2/3.

---

## 9. Open Questions Resolved

Resolving the 5 ledger open questions where evidence allows:

1. **"Is the SSE `lastEventId` cursor sufficient, or do we need a separate per-conversation seq?"** — RESOLVED: The global event_id cursor is sufficient FOR REPLAY/DURABILITY (Zulip validates: order globally by autoincrement id inside one tx; Discord validates the dual-cursor split). Per-conversation seq is NOT needed for ordering at single-node SQLite scale (`created_at ASC, id ASC` tie-breaker suffices — P3-1). Revisit only at Postgres multi-writer. **Drop I4.**

2. **"Cross-process fanout: broker now or defer?"** — RESOLVED: DEFER. The 1s SQLite poll IS a working cross-process bridge for SSE clients (the "no broker = no delivery" framing was too strong — §2.1). At internal-team scale the synchronous indexed reads are rounding-error load (WAL means no read/write contention; P2-2 doomsday framing refuted). Real broker (Redis Streams + consumer-offset table) is Phase 2/3, gated on actual multi-instance need. Webhooks remain a real gap (no DB fallback) but are out of chat scope.

3. **"Should typing/presence be ephemeral-only or durable?"** — RESOLVED: EPHEMERAL-ONLY, with an enforcement guard. Slack/WhatsApp/Matrix all agree: never persist, never retry, never replay, drop-if-late. Add an event-type guard in `event-bus.ts` so ephemeral types use a volatile broadcast that skips the DB row. Cursor purity invariant: ephemeral frames must NOT advance or break the SSE replay cursor.

4. **"Read state: per-message ack or derived cursor?"** — RESOLVED: DERIVED CURSOR (Chatwoot/Rocket.Chat `lr`/`last_seen_at`). `chat_read_states(participant_id, conversation_id, last_read_seq)`; UPSERT with `MAX`; unread derived by SQL. Eliminates per-message ack drift and dead rows. Emit `chat.read` only when cursor advances.

5. **"Is the workspace the trust boundary, or do we need per-conversation membership?"** — RESOLVED (for now): WORKSPACE IS THE BOUNDARY; minimal `from`/`to` predicate now, full `chat_participants` tier deferred. For Opzava's realistic single-trusted-workspace deployment, per-conversation ACLs sized for consumer cross-tenant privacy are over-engineering. The P0-1 coordinator-impersonation fix (stop honoring `body.from`) is the load-bearing integrity fix; the P2-1 `from`/`to` SSE predicate is the cheap privacy gate. Full membership tier (I3 Phase 2) only if multi-party DMs become a product requirement.

---

## 10. Sources

### Primary-source research (reusable patterns + architectural facts)
- Discord gateway + opcodes: https://docs.discord.com/developers/events/gateway , https://docs.discord.com/developers/topics/opcodes-and-status-codes , https://docs.discord.com/developers/events/gateway-events
- discord.js WebSocketShard (resume L580, heartbeat L601, monotonic seq guard L776): https://github.com/discordjs/discord.js/blob/main/packages/ws/src/ws/WebSocketShard.ts
- discord.py gateway.py (MIT): https://raw.githubusercontent.com/Rapptz/discord.py/master/discord/gateway.py
- Snowflake ID: https://en.wikipedia.org/wiki/Snowflake_ID
- Matrix spec (server-server v1.11, client-server v1.13): https://spec.matrix.org/v1.11/server-server-api/ , https://spec.matrix.org/v1.13/client-server-api/
- Synapse room DAG + streams + events.py + transactions.py + federation_server.py: https://matrix-org.github.io/synapse/latest/development/room-dag-concepts.html , https://github.com/element-hq/synapse/blob/develop/docs/development/synapse_architecture/streams.md , https://github.com/element-hq/synapse/blob/develop/synapse/storage/databases/main/events.py , https://github.com/element-hq/synapse/blob/develop/synapse/storage/databases/main/transactions.py , https://github.com/element-hq/synapse/blob/develop/synapse/federation/federation_server.py
- Matrix ordering analysis: https://artificialworlds.net/blog/2024/12/04/message-order-in-matrix/
- Mattermost post.go / web_hub.go / cluster.go / post_store.go / websocket_message.go (AGPL v3.0, pattern only): https://github.com/mattermost/mattermost/blob/master/server/channels/app/post.go , https://github.com/mattermost/mattermost/blob/master/server/channels/app/platform/web_hub.go , https://github.com/mattermost/mattermost/blob/master/server/channels/app/platform/cluster.go , https://github.com/mattermost/mattermost/blob/master/server/channels/store/sqlstore/post_store.go , https://github.com/mattermost/mattermost/blob/master/server/public/model/websocket_message.go
- Mattermost ordering bug: https://forum.mattermost.com/t/messages-sometimes-be-inserted-in-wrong-order/6123
- Zulip events-system + django_api + event_queue + sharding + events.py + message_send.py + models (Apache-2.0): https://github.com/zulip/zulip/blob/main/docs/subsystems/events-system.md , https://github.com/zulip/zulip/blob/main/zerver/tornado/django_api.py , https://github.com/zulip/zulip/blob/main/zerver/tornado/event_queue.py , https://github.com/zulip/zulip/blob/main/zerver/tornado/sharding.py , https://github.com/zulip/zulip/blob/main/zerver/lib/events.py , https://github.com/zulip/zulip/blob/main/zerver/actions/message_send.py , https://github.com/zulip/zulip/blob/main/zerver/models/messages.py
- Rocket.Chat streamer + streams + DDPStreamer + PresenceReaper (source-available, pattern only): https://github.com/RocketChat/Rocket.Chat/blob/develop/apps/meteor/server/modules/streamer/streamer.module.ts , https://github.com/RocketChat/Rocket.Chat/blob/develop/packages/ddp-client/src/types/streams.ts , https://github.com/RocketChat/Rocket.Chat/blob/develop/ee/apps/ddp-streamer/src/DDPStreamer.ts , https://github.com/RocketChat/Rocket.Chat/blob/develop/ee/packages/presence/src/lib/PresenceReaper.ts
- Rocket.Chat DDP deprecation: https://developer.rocket.chat/apidocs/realtimeapi
- Chatwoot room_channel + action_cable_listener + online_status_tracker + conversation (MIT): https://github.com/chatwoot/chatwoot/blob/develop/app/channels/room_channel.rb , https://github.com/chatwoot/chatwoot/blob/develop/app/listeners/action_cable_listener.rb , https://github.com/chatwoot/chatwoot/blob/develop/lib/online_status_tracker.rb , https://github.com/chatwoot/chatwoot/blob/develop/app/models/conversation.rb
- Chatwoot idempotency issue: https://github.com/chatwoot/chatwoot/issues/6446
- Slack RTM engineering: https://slack.engineering/real-time-messaging/ , https://slack.engineering/flannel-an-application-level-edge-cache-to-make-slack-scale/
- Slack conversations.history / ts ordering: https://docs.slack.dev/reference/methods/conversations.history , https://github.com/slackhq/slack-api-docs/issues/31
- WhatsApp typing indicator design: https://dev.to/gabrielanhaia/designing-whatsapps-typing-indicator-the-question-that-tests-your-real-time-skills-34k1
- Ably idempotency: https://ably.com/docs/platform/architecture/idempotency
- Svix Redis presence: https://www.svix.com/resources/redis/presence-detection/
- event-driven.io outbox/inbox: https://event-driven.io/en/outbox_inbox_patterns_and_delivery_guarantees_explained/
- SQLite UPSERT: https://sqlite.org/lang_upsert.html ; conflict clause: https://sqlite.org/lang_conflict.html
- Gapless sequence analysis: https://dba.stackexchange.com/questions/119784/how-can-i-create-a-gapless-sequence , https://www.cybertec-postgresql.com/en/gaps-in-sequences-postgresql/
- Slack API primary sources (fetched): https://docs.slack.dev/messaging/retrieving-messages/ , https://docs.slack.dev/apis/events-api/ , https://docs.slack.dev/reference/events/presence_sub/ , https://docs.slack.dev/reference/methods/chat.postMessage (no native idempotency)
- SQLite primary sources (fetched): https://sqlite.org/wal.html (§1 readers/writers concurrency, §2.3 WAL-growth latency, §9 SQLITE_BUSY), https://sqlite.org/lang_transaction.html (§2.1 DEFERRED/IMMEDIATE + busy_timeout-on-upgrade), https://sqlite.org/pragma.html (synchronous, busy_timeout, cache_size, temp_store, wal_autocheckpoint), https://sqlite.org/lockingv3.html §6 (NFS/locking corruption), https://sqlite.org/howtocorrupt.html (§2.1 NFS, §2.2 POSIX close() lock cancellation)
- better-sqlite3 performance: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md (WAL recommendation, `SQLITE_DEFAULT_WAL_SYNCHRONOUS=1`, checkpoint starvation)
- DEFERRED upgrade busy_timeout behavior: https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/ ; concurrent-write busy_timeout: https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/
- PostgreSQL NOTIFY (transactional delivery + payload coalescing + trigger pattern): https://www.postgresql.org/docs/current/sql-notify.html

### SSE / transport / proxy / browser
- HTML spec SSE (reconnect, Last-Event-ID, retry, empty-id reset, comment heartbeat): https://html.specwhatwg.org/multipage/server-sent-events.html
- MDN SSE + HTTP/1.1 6-conn cap: https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events
- Mark Nottingham on SSE/HTTP: https://mnot.net/blog/2022/websockets
- SSE + HTTP/2 + Envoy: https://medium.com/@kaitmore/server-sent-events-http-2-and-envoy-6927c70368bb
- nginx proxy module (proxy_buffering, X-Accel-Buffering, proxy_read_timeout): https://nginx.org/en/docs/http/ngx_http_proxy_module.html
- nginx SSE config: https://serverfault.com/questions/801628/for-server-sent-events-sse-what-nginx-proxy-configuration-is-appropriate , https://oneuptime.com/blog/post/2025-12-16-server-sent-events-nginx/view
- Cloudflare 524: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/ , https://community.cloudflare.com/t/are-server-sent-events-sse-supported-or-will-they-trigger-http-524-timeouts/499621
- Traefik SSE: https://community.traefik.io/t/problem-with-streaming-sse-server-behind-traefik/23007 , https://community.traefik.io/t/help-with-proxying-a-server-sent-event/25812 , https://github.com/traefik/traefik/issues/8623
- Web Locks API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API
- Leader-tab pattern: https://greenvitriol.com/posts/browser-leader
- AWS jitter: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/ , https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- fetch-event-source: https://github.com/Azure/fetch-event-source

### Opzava internal (code verified)
- `/home/anthony/devtony/anito-opzava/src/app/api/chat/messages/route.ts`
- `/home/anthony/devtony/anito-opzava/src/app/api/chat/messages/[id]/route.ts`
- `/home/anthony/devtony/anito-opzava/src/app/api/chat/conversations/route.ts`
- `/home/anthony/devtony/anito-opzava/src/app/api/events/route.ts`
- `/home/anthony/devtony/anito-opzava/src/app/api/v1/runs/stream/route.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/event-bus.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/realtime-events.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/db.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/migrations.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/auth.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/webhooks.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/websocket.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/websocket-utils.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/pty-websocket.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/pty-manager.ts`
- `/home/anthony/devtony/anito-opzava/src/lib/use-server-events.ts`
- `/home/anthony/devtony/anito-opzava/src/store/index.ts`
- `/home/anthony/devtony/anito-opzava/src/components/chat/chat-workspace.tsx`
- `/home/anthony/devtony/anito-opzava/src/components/chat/message-list.tsx`
- `/home/anthony/devtony/anito-opzava/src/components/panels/agent-comms-panel.tsx`
- `/home/anthony/devtony/anito-opzava/scripts/mc-server.cjs`
- `/home/anthony/devtony/anito-opzava/scripts/deploy-standalone.sh`
- `/home/anthony/devtony/anito-opzava/scripts/dokploy-parity-test.sh`
- `/home/anthony/devtony/anito-opzava/docker-compose.dokploy.yml`
- `/home/anthony/devtony/anito-opzava/docs/architecture/realtime-chat-architecture.md`
- `/home/anthony/devtony/anito-opzava/docs/ard/0009-realtime-user-chat-transport-and-fanout.md`

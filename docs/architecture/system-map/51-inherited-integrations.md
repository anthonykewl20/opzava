# 51 — Inherited Integrations · Gateway · Realtime (deep)

> Zone: `src/lib/` — the upstream OpenClaw external-integration surface: the gateway, agent-CLI session
> bridges, GitHub sync, realtime transport, webhooks. Much of it is OpenClaw-specific and dormant in a
> standalone Opzava deployment. Marks: ✅ verified (second pass, re-checked vs source) · ⚠️ correction
> applied this pass. See [`99-verification-register.md`](./99-verification-register.md).

## Gateway (OpenClaw) ✅

The "gateway" is an **external OpenClaw process** (default `127.0.0.1:18789`) that owns live agent sessions.
Opzava is a *client* via two paths:
- **Server→gateway RPC** (`openclaw-gateway.ts` `callOpenClawGateway`): one-shot `ws` per call, **protocol
  v3-only** server-side (`openclaw-gateway.ts:7,143-144`, `min=max=3`; the 3/4 range is the *browser* path only,
  in `websocket-utils.ts`). Callers (verified by import): `api/{sessions,sessions/transcript/gateway,
  sessions/[id]/control,spawn,channels,nodes,chat}` + `task-dispatch`.
  ⚠️ pass-1 also listed `status`, `gateways`, `agent-runtimes`, `super-admin` — those do **not** import `callOpenClawGateway`.
- **Browser→gateway WS** (`websocket.ts`, a singleton React hook): Ed25519 device-identity challenge-response
  (`device-identity.ts`), heartbeat, backoff, client-side send backpressure close at 1 MiB; ingests gateway
  events into the Zustand store. The reverse-proxy fallback check now uses the handshake state captured before
  close; it only probes `/gateway-ws`/`/gw` when the initial handshake never completed.

Config from the gateway's own `openclaw.json` (`gateway-runtime.ts`) + URL builder (`gateway-url.ts`).
⚠️ **`NEXT_PUBLIC_GATEWAY_OPTIONAL=true`** (✅ referenced in `websocket.ts`) stops reconnection — standalone
Opzava runs with no gateway and the gateway-dependent UI (live sessions, spawn, exec approvals) stays empty.
`provisioner-client.ts` is a separate Unix-socket client to a privileged host daemon.

Docker/Dokploy local parity now models both gateway shapes ✅:
- `docker-compose.yml` defaults to standalone-safe gateway optional mode and can point server-side gateway RPC
  at `host.docker.internal` or another configured host.
- `docker-compose-openclaw.yml` adds an optional local OpenClaw sidecar for operator-mode Compose.
- `docker-compose.dokploy.yml` adds an optional `mc-openclaw-gateway` profile on the same Traefik network as
  `mission-control`; the app uses `OPENCLAW_GATEWAY_HOST=mc-openclaw-gateway` for server-side calls, while
  browser gateway traffic can be routed through the local Dokploy-style Traefik host
  `opzava-gateway.localhost`.

## Agent-CLI session bridges ✅

Read-only disk/SQLite scanners that surface "what's running on this host" — none control or spawn agents:
`claude-sessions.ts` (scans `~/.claude/projects/**/*.jsonl` → upserts `claude_sessions` table),
`claude-tasks.ts`, `codex-sessions.ts`, `opencode-sessions.ts` (opens OpenCode's SQLite **read-only**),
`hermes-sessions.ts`/`hermes-tasks.ts`/`hermes-memory.ts` (Hermes state, read-only). `local-agent-sync.ts`
is the one bidirectional bridge (scans agent dirs → upserts `agents` with `source='local'`).

**`src/lib/adapters/`** ✅ (6 framework adapters + base + index): `adapter.ts` (the `FrameworkAdapter`
interface + `queryPendingAssignments`), `index.ts`, and near-identical stubs `openclaw.ts`, `generic.ts`,
`crewai.ts`, `langgraph.ts`, `autogen.ts`, `claude-sdk.ts` — each just maps lifecycle methods onto
`eventBus.broadcast(...)` with its `framework` label. Duplication is upstream boilerplate; only the label
differs. ⚠️ Driven by **`/api/adapters`** (`getAdapter`/`listAdapters`, `route.ts:53,67`), **not**
`/api/agents/register` (which uses no adapter — raw DB writes + inline `eventBus`).

## GitHub sync ✅

Bidirectional task↔issue sync using **dedicated columns** on `tasks`/`projects`. `github.ts` (REST client;
token via `runtime-env` preferring the gateway `.env`; `User-Agent: MissionControl/1.0` — branding residue),
`github-label-map.ts` (status/priority ↔ `mc:*`/`priority:*` labels), `github-sync-engine.ts` (push/pull
with a 10s anti-ping-pong window), `github-sync-poller.ts`.

⚠️ **The background GitHub poller is NOT auto-started** ✅ (verified: `startSyncPoller` has no non-test
caller — only its definition + a doc comment). GitHub sync runs **on demand** via `POST /api/github/sync`
and **outbound** via `syncTaskOutbound` fired from task mutations (`/api/tasks*`, `task-dispatch`), not via
the poller.

## Realtime transport ✅

Three independent channels to the browser:
1. **SSE — local DB mutations**: `event-bus.ts` records every broadcast into `realtime_events`
   (`id`, `type`, JSON `data`, `timestamp`, nullable `workspace_id`) and emits the same event through the
   process-local `EventEmitter`. `/api/events` streams `retry: 5000`, `id:` frames, a `connected` event, and a
   15s comment heartbeat; it honors `Last-Event-ID` (or `lastEventId` query), `types=...`, strict workspace
   filters, drops unresolved-workspace events from scoped replay/streams, advances filtered cursors only while
   replaying durable rows (not for dropped live events), prunes the durable log by age/count, closes slow streams
   on backpressure, and DB-polls for events written by another same-host app process sharing the SQLite DB.
   `use-server-events.ts`
   relies on native browser EventSource reconnect, dedupes event ids, and dispatches into the store. SSE owns
   local-DB entities.
2. **WebSocket — gateway live data**: `websocket.ts` (the only WS to OpenClaw). WS owns
   sessions/logs/spawn/cron, closes sends above 1 MiB browser buffering, rejects text frames above 1 MiB, and
   logs only a truncated preview for malformed frames. SSE + WS are independent (`connection.isConnected` vs
   `.sseConnected`).
3. **PTY WebSocket — terminal attach**: `pty-manager.ts` (node-pty pool → `tmux attach`) + `pty-websocket.ts`
   (`/ws/pty` upgrade, operator-gated, 30s server heartbeat, 64 KiB inbound message cap, 1 MiB outbound
   backpressure close, resize clamping, close-before-attach cleanup). `scripts/mc-server.cjs` is the production standalone wrapper: it
   patches the HTTP(S) server that Next standalone creates and intercepts `/ws/pty` before delegating all
   other upgrade paths back to Next. Docker entrypoint and `scripts/start-standalone.sh` now run that wrapper.
   Bare `node .next/standalone/server.js` still will not serve `/ws/pty`. PTY is local-affinity by design:
   a scaled Traefik deployment must use sticky routing (the Dokploy parity stack does) or an external PTY broker,
   because `tmux`/`node-pty` state is process/container-local.

`use-smart-poll.ts` is the visibility-aware REST fallback (pauses while WS/SSE connected). `/api/events` and
`/api/v1/runs/stream` both replay from `realtime_events` with workspace filtering, EventSource `id:`
reconnects, heartbeats, retention pruning, and slow-client close. Horizontal SSE scaling is
**SQLite/WAL single-host**: multiple Node processes can replay from the same DB file; multi-host or
multi-primary replicas still need a shared event bus such as Redis/NATS before claiming full fanout parity.

## Webhooks & external auth

⚠️ **Outbound webhooks ARE live** ✅ (corrects pass-1 claim C1): `webhooks.ts` `initWebhookListener()` IS
booted at startup — `db.ts:76-77` lazily imports and calls it inside `initializeSchema()`. It subscribes to
the event bus and re-emits a subset as HMAC-signed HTTP POSTs to `webhooks` rows, with backoff retry, a
circuit breaker (disable after exhausting retries), and delivery logging (`webhook_deliveries`).
`processWebhookRetries` runs via the `webhook_retry` scheduler job.

Other ✅: `gnap-sync.ts` (push-only mirror to a local git repo, off by default), `google-auth.ts` (verify
Google ID token), `receipt-signing.ts` + `mcp-audit.ts` (Ed25519 tamper-evident MCP-call receipts →
`mcp_call_log`), `tailscale-serve.ts` (detect Tailscale Serve fronting the gateway),
`provider-subscriptions.ts` (detect Anthropic/OpenAI subscriptions), `openclaw-doctor*.ts`,
`command.ts` (spawn wrapper for the openclaw/clawdbot CLIs), `transcript-parser.ts`, `plugins.ts`.

## What's dormant in a standalone Opzava deployment ✅

- The **entire gateway path** (gateway RPC/WS, device-identity, tailscale, provisioner) — gated off by
  `NEXT_PUBLIC_GATEWAY_OPTIONAL=true`.
- **Hermes/Codex/OpenCode/Clawdbot bridges** — depend on those specific CLIs being installed.
- The 6 **framework adapter stubs** (CrewAI/LangGraph/AutoGen) — speculative.
- **PTY** — live in Docker/standalone when launched through `mc-server.cjs`; it needs `tmux`, `node-pty`,
  `ws`, and an existing `tmux` session for the requested agent session id.

⚠️ **Branding residue** ✅: `User-Agent: MissionControl/1.0`, `mc:` GitHub labels,
`MC_*`/`MISSION_CONTROL_*`/`OPENCLAW_*` env keys, `container_name: mission-control` — upstream names retained
(intentional per the `config.ts` legacy-alias contract, but not covered by the branding gate which scans
only `src/` + `messages/`).

## Subtleties for parity comparison

1. This whole zone is **inherited and OpenClaw-shaped**; in a standalone Opzava install the gateway/CLI/PTY
   surface is largely dormant — match capability to what's actually reachable.
2. Realtime is **two systems** (SSE for local DB, gateway WS for live agents) — don't conflate them.
3. Pass-1 made one false "not booted" claim (webhooks — corrected here); the GitHub poller "not booted"
   claim is *true* (verified). Both are reasons every such claim was re-checked.

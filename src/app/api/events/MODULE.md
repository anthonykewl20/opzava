<!-- agent-context: read this before editing the module -->

# realtime-sse-transport

## Purpose

The two Server-Sent Events fanout endpoints that carry every realtime DB mutation to the
browser: `GET /api/events` (the main multiplexed workspace feed — tasks, agents, runs,
chat, notifications, activity) and `GET /api/v1/runs/stream` (the narrow Agent-Run-Protocol
feed). Each opens a `text/event-stream` response, replays the durable `realtime_events`
outbox from the client's `Last-Event-ID` cursor, then tails live `eventBus` emissions
bridged with a 1s outbox poll. They are the read side of the realtime spine; the write side
lives in `src/lib/event-bus.ts` + `realtime-events.ts`.

## Public surface

Two Next.js App-Router route handlers. There are no exported functions/types consumed by
other code — the surface is the HTTP endpoint itself.

- `src/app/api/events/route.ts` — `export async function GET(request)` plus
  `export const dynamic = 'force-dynamic'` / `export const runtime = 'nodejs'`.
  Accepts `?types=a,b,c` (server-side type filter, comma-split) and
  `?lastEventId=` / `Last-Event-ID` header for resume. Role gate: `requireRole(request, 'viewer')`.
- `src/app/api/v1/runs/stream/route.ts` — `export async function GET(request)` plus the same
  `dynamic`/`runtime` exports. Ignores `?types=` entirely (hardcoded `RUN_EVENT_TYPES`:
  `run.created`, `run.updated`, `run.completed`, `run.eval_attached`). Adds response header
  `X-Agent-Run-Protocol: 0.1.0`.

Inbound callers: the browser client via `src/lib/use-server-events.ts` (`useServerEvents()`,
mounted once in `src/app/[[...panel]]/page.tsx:136`) for `/api/events`. `/api/v1/runs/stream`
is a public protocol surface (docs-parity tracked, no first-party UI consumer in `src/`).
Tests: `src/lib/__tests__/events-route.test.ts`, `src/lib/__tests__/runs-stream-route.test.ts`.

## Dependencies

**Outbound** (what these import) — all Engine A (`src/lib`), no `src/opzava` edge:

- `@/lib/auth` — `requireRole` (auth + workspace/role resolution).
- `@/lib/event-bus` — `eventBus`, `ServerEvent` type (in-process fanout accelerator).
- `@/lib/realtime-events` — `formatSseFrame`, `formatSseRetryFrame`, `parseLastEventId`,
  `readServerEventsAfter`, `serverEventWorkspaceId`, `minRealtimeEventId` (events only),
  `SSE_HEARTBEAT_MS`, `SSE_POLL_MS`.

No import of `@/opzava/**`. This is correct: the SSE transport is inherited infrastructure
below the engine bridge.

## Invariants

1. **Workspace is the authorization boundary.** Every event is dropped unless
   `serverEventWorkspaceId(event) === userWorkspaceId` (`auth.user.workspace_id ?? 1`)
   BEFORE any type match or cursor check. `workspace_id` is resolved from
   `event.workspace_id`, then `data.workspace_id`/`data.workspaceId`, then a table lookup
   in `realtime-events.ts`. A null-resolved workspace persists with `workspace_id=NULL` and
   is silently undeliverable to every SSE viewer — broadcasters MUST spread `workspace_id`
   on the payload.
2. **Chat DM ACL (events route only).** A `chat.*` event carrying `from_agent`/`to_agent`
   (string) is delivered only to its two participants, or to any `operator`/`admin`;
   every other same-workspace viewer is dropped (`events/route.ts:87-94`). This predicate is
   the load-bearing privacy gate closing the P2-1 workspace-wide DM leak — preserve it on
   any refactor.
3. **Strict-monotonic cursor advance.** `lastSentId` only moves forward. A numeric
   `event.id <= lastSentId` is skipped. During replay, a type-filtered event with a numeric
   id still advances the cursor (`advanceFilteredReplay`) so the filtered type is never
   re-replayed; a non-numeric-id event (e.g. `connected`, `resync.required`) never advances
   the durable cursor. This is the idempotency primitive that lets the live `eventBus`
   handler and the 1s outbox poll race without double-delivery.
4. **Resync sentinel on retention gap (events route only).** If the client's
   `requestedLastEventId` predates `minRealtimeEventId(workspace)`, exactly ONE
   `{type:'resync.required', data:{reason:'retention-gap'}}` control frame is emitted (no
   numeric id, so it never advances the cursor) and the cursor jumps to `minId-1` to avoid
   partial-replaying across the gap. `resyncSentinelEmitted` latches once per connection.
5. **Backpressure = drop the connection.** `safeEnqueue` watches
   `controller.desiredSize <= 0` (HWM 256); on negative pressure it calls `stop()`,
   closes the controller, and tears down the listener + timers. Client reconnect + replay
   is the recovery path, not buffering. A second defense-in-depth path: `request.signal`
   `abort` calls the same `cleanup` even if `cancel()` does not fire.

## Harmony rules

- **Which engine: Engine A (inherited `src/lib` / `src/app`).** This is upstream operator
  console infrastructure, not Opzava product code. The boundary gate to Engine B
  (`src/opzava`) is the `agents` table — see ARD 0007
  (`docs/ard/0007-engine-separation-and-surface-unification.md`) and
  `test/engine-boundary.test.mjs`. The one-way bridge is: Engine B may read/write the
  inherited `agents` table; Engine A may NOT import `@/opzava/**`.
- **Do NOT add new product behavior here.** New product features belong in
  `src/opzava/modules/<feature>/`; these endpoints accept only **hardening and
  customization** (backpressure, ACL, proxy headers, replay correctness). If a new event
  type must be transported, the broadcaster in `src/opzava/**` emits it; this surface only
  forwards it subject to the workspace + chat ACL above.
- **`/api/v1/runs/stream` duplicates ~100 lines** of `/api/events`
  (`highWaterMark`/`safeEnqueue`/`stop`/`sendEvent`/`replay`/`abort`/`cancel`) with zero
  shared code and ignores `?types=`. Tracked as I20 (extract a shared SSE module). When
  refactoring, do NOT regress the events-only invariants (chat DM ACL, resync sentinel,
  `?types=`) by accidentally sharing the narrow runs behavior — share the safe transport
  primitives, keep the per-route filter/ACL branches distinct.

## Editor guardrails

Verified findings copied verbatim from
`docs/architecture/realtime-chat-production-review.md` that apply to THIS surface. Each
carries its severity; do not "fix" without a deliberate decision.

- **P2-1. Workspace-only SSE filter has no conversation-membership ACL (privacy,
  scale-bounded)** — partially CLOSED in code: `/api/events` now applies a `from_agent`/
  `to_agent` participant predicate for `chat.*` events (`events/route.ts:87-94`). The
  underlying membership-ACL gap (no `conversation_members` table; `conversation_id` is free
  text) remains; do NOT build the full `chat_participants`/`conversation_seq` tier as part
  of an SSE edit — that is the documented Target Topology (over-engineering for a single
  trusted workspace). Preserve the existing predicate verbatim.

- **P1-4. SSE replay silently drops events past the 200-row/7-day cap — no resync sentinel**
  — CLOSED in `/api/events` (`events/route.ts:108-128` + `minRealtimeEventId`). The
  `resync.required` frame + `lastSentId = minId-1` jump are load-bearing; do not remove
  them. NOTE: `/api/v1/runs/stream` does NOT emit the resync sentinel — its replay can still
  silently gap past retention. Do not assume both routes share this protection.

- **P2-3. ⟐ Reconnect storm — fixed `retry:5000` + browser-native lockstep reconnect** —
  PARTIALLY CLOSED: `formatSseRetryFrame(base=5000, jitter=2000)` now adds per-connection
  jitter (`realtime-events.ts:184-186`). The jitter range is narrow and reconnect is still
  browser-native EventSource with no backoff/attempt tracking; acceptable at internal-team
  scale. Do not widen into a Full-Jitter subsystem here without the Phase 2/3 broker track.

- **(review §2.2 #3) The `connected` ack frame carries no `id`**, so it never advances the
  replay cursor; a disconnect mid-handshake gets no indication on replay. Same in
  `/api/v1/runs/stream`. Intentional — control frames must stay cursor-pure. Do not add an
  id to `connected` or `resync.required`.

- **(review §2.2 #4) `/api/v1/runs/stream` ignores `?types=` entirely** (hardcoded
  `RUN_EVENT_TYPES`) and shares zero common code with `/api/events` despite ~100 duplicated
  lines — a DRY violation and maintenance hazard (I20). When touching one route, audit the
  other for the same defect.

- **(review §3, P2-2 refutation) The 1s outbox poll is a CORRECTNESS parameter, not just
  perf.** `setInterval(replayFromStore, SSE_POLL_MS)` is the cross-process bridge: events
  committed by another process (MCP/CLI/cron) sharing the DB are delivered even if this
  process never saw `eventBus.emit`. Do NOT raise `SSE_POLL_MS`, coalesce, or drop poll
  ticks under load — durability silently degrades. WAL means these indexed range reads do
  not block writers; the per-connection poll is fine at internal-team scale (do NOT build a
  single-reader-per-process refactor).

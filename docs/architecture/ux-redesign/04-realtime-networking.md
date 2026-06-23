# 04 — Realtime & Networking Architecture

> Redesign section for Opzava UX overhaul. All recommendations are evidence-grounded; law citations are authoritative, not decorative.

---

## Current State

### Push infrastructure (exists, underused)

| Mechanism | File | Purpose |
|---|---|---|
| SSE stream | `src/app/api/events/route.ts` + `src/lib/use-server-events.ts` | Server → client: task, agent, notification, session events |
| WebSocket (gateway) | `src/lib/websocket.ts` | Bidirectional: agent command/control, session management |
| WebSocket (PTY) | `src/lib/pty-websocket.ts` | Terminal I/O — correctly uses WS |
| Event bus | `src/lib/event-bus.ts` (inferred) | Internal server-side pub/sub |

**Zero panels call `useServerEvents` directly.** The push infrastructure exists and fires events; nothing consumes it at the component layer.

### Polling inventory — raw `setInterval` calls bypassing `useSmartPoll`

| Panel | File | Interval | Notes |
|---|---|---|---|
| `agent-squad-panel` | line 82 | 10 s | No SSE-pause, no visibility-pause |
| `office-panel` | lines 613, 618, 887, 1181, 1211 | 10 s + 60 s (×5) | Five independent intervals mount simultaneously |
| `super-admin-panel` | line 286 | 10 s | Fires **4 parallel `fetch()`** per tick (tenants, jobs, gateways, scheduler) |
| `task-board-panel` | lines 1917–1921 | 5 s | Full 100-message transcript re-fetch while WS + SSE already deliver `chat.message` |
| `nodes-panel` | line 139 | 30 s | — |
| `channels-panel` | line 675 | 30 s | — |
| `cost-tracker-panel` | line 163 | 30 s | — |
| `skills-panel` | lines 149–153 | 10 s | Static file content; no SSE-pause, no backoff |
| `system-monitor-panel` | line 161 | 2 s | `useSmartPoll` present but no `pauseWhenConnected`; SQLite contention at 2 s |

**Combined worst-case at full mount (office + agent-squad + super-admin + task-board + system-monitor):** up to 4 + 1 + 1 + 1 + 1 = 8 concurrent fetches every 2–5 s. On a SQLite-backed server this reliably breaches the 400 ms Doherty Threshold for all other panels.

### Known P0 failure modes

1. **SSE silent death** — `use-server-events.ts` lines 78–80: after 20 retry attempts (~10 min exponential backoff) the hook logs to console and exits. `sseConnected` stays `false` indefinitely. The live-feed header (`live-feed.tsx` line 82) renders `bg-green-500 pulse-dot` with no tie to `connection.sseConnected`. The operator sees a green pulsing dot while all push events are permanently halted.
2. **WebSocket exhaustion** — `websocket.ts` lines 788–797: after 10 retries (~116 s) only `addLog()` is called; `reconnectAttempts` stays at 10; `header-bar.tsx` line 481 renders amber `"reconnecting (10)"` indefinitely because `isReconnecting = !isConnected && reconnectAttempts > 0` never clears.
3. **SSE no event IDs** — `api/events/route.ts` emits no `id:` SSE field; `Last-Event-ID` is not handled on reconnect. Every connection drop silently loses the events that fired during the gap.
4. **Status hidden below xl** — `header-bar.tsx` line 348: the entire SSE badge + WS chip block is `hidden xl:flex`. On 13" MacBook Pro (1280 px CSS) and all narrower viewports, connection health is invisible; the always-green live-feed dot is the only signal.

---

## SSE vs WebSocket vs Polling — Decision Matrix

| Criterion | SSE | WebSocket | Polling |
|---|---|---|---|
| Direction | Server → client only | Bidirectional | Client-initiated |
| Latency | < 100 ms | < 50 ms | Up to interval (2–30 s) |
| Auto-reconnect | Yes (EventSource built-in + `Last-Event-ID` replay) | Manual heartbeat | N/A |
| Proxy/LB compatibility | High (plain HTTP; needs `X-Accel-Buffering: no`) | Needs `Upgrade` support | Highest |
| HTTP/1.1 constraint | 6 streams/domain cap — **mitigated by multiplexing all events on one stream** | N/A | N/A |
| Infra complexity | Low | Medium | Lowest |
| Right for Opzava | **Primary server→client transport** | **PTY + gateway session only** | **Fallback ≥ 60 s only** |

**Ruling** (Tesler's Law — absorb irreducible complexity into the system, not the user):

### Rule 1 — Single multiplexed SSE stream

All server-to-client events — task updates, agent status, notifications, metrics, connection acks — route through **one** SSE endpoint (`/api/events`). Type-discriminated events (`{ type: "task.updated", data: {...} }`) let each panel subscribe to the subset it needs via `useServerEvents`. This eliminates the HTTP/1.1 6-connection cap risk and ensures a single reconnect/backoff cycle governs all push delivery.

Do not open additional SSE connections per panel or per data type.

### Rule 2 — WebSocket for PTY and gateway sessions only

WebSocket is already correctly used for PTY (`pty-websocket.ts`). Retain it for bidirectional gateway agent sessions (`websocket.ts`). Do not extend WS to cover data that is inherently server-pushed (agent status, task events, metrics).

### Rule 3 — Eliminate all sub-60 s polling that duplicates SSE

Concretely:

| Panel | Current | Target |
|---|---|---|
| `agent-squad-panel` | `setInterval` 10 s | `useServerEvents(['agent.status_changed'])` |
| `office-panel` | 5 × `setInterval` | `useServerEvents(['task.*', 'agent.*'])` |
| `task-board-panel` | `setInterval` 5 s transcript | Disable when `sseConnected || wsConnected`; pass `?since=<lastId>` as fallback |
| `super-admin-panel` | `setInterval` 10 s (4 parallel) | `useSmartPoll` 30 s + `pauseWhenSseConnected: true` |
| `system-monitor-panel` | `useSmartPoll` 2 s | Emit `metrics` SSE event server-side every 5 s; raise client interval to 5 s + `pauseWhenConnected: true` |
| `skills-panel` | `setInterval` 10 s | `useSmartPoll` 60 s + `pauseWhenSseConnected: true`; file-watcher SSE event preferred |
| `nodes-panel` | `setInterval` 30 s | `useSmartPoll` 60 s + `pauseWhenSseConnected: true` |
| `channels-panel` | `setInterval` 30 s | `useSmartPoll` 60 s + `pauseWhenSseConnected: true` |
| `cost-tracker-panel` | `setInterval` 30 s | `useSmartPoll` 60 s + shallow-diff guard before `setState` |

### Rule 4 — Stale-while-revalidate as degraded fallback

When SSE is in `reconnecting` state, panels that previously loaded data continue to display it with a "last updated HH:MM" timestamp (see Connection-State UX below). Poll at the panel's configured fallback interval only when SSE has been down > 30 s. This gives Doherty-threshold responsiveness under normal operation and safe degradation when the push channel fails.

### SSE event ID + replay (fix for finding `realtime-net` P2)

Every event emitted by `api/events/route.ts` must include an `id:` field carrying a monotonic server-side sequence number:

```
id: 1042
event: task.updated
data: {"id":"task_abc","status":"running"}
```

The event bus maintains a ring buffer of the last 200 events. On reconnect, if the `Last-Event-ID` request header is present and falls within the buffer window, the server replays the gap. Outside the window, send a `resync` event instructing the client to trigger a full panel refresh. This satisfies Postel's Law — accept the messy reality of connection drops, store and replay canonical event sequences.

Server headers required: `Cache-Control: no-cache`, `X-Accel-Buffering: no`, `Connection: keep-alive`. Ensure upstream proxy `proxy_read_timeout >= 35s` to outlast the 30 s heartbeat.

---

## Connection-State UX

### Three-state model

Every connection in Opzava is in exactly one of three states. The UI must reflect all three distinctly — using color **and** text (WCAG 1.4.1 — never color-only meaning):

| State | Color token | Text label | Dot shape |
|---|---|---|---|
| `live` | `text-green-500` | Live | Filled circle `●` with slow pulse |
| `reconnecting` | `text-amber-400` | Reconnecting… | Animated ring `◎` |
| `failed` | `text-red-500` | Disconnected | Hollow circle `○` (no animation — respects `prefers-reduced-motion`) |

`reconnecting` covers both `sseConnected === false && sseReconnectAttempts < MAX` and `wsConnected === false && wsReconnectAttempts < MAX`. `failed` is a new distinct store flag (`sseFailed`, `wsFailed`) set only on retry exhaustion.

### Minimum always-visible indicator (fix for finding P2 hidden status)

The complete badge block in `header-bar.tsx` is correctly `hidden xl:flex`. In addition, place a **single 10 px connection dot** outside the `xl` guard, in the always-visible right section of the header:

```tsx
<span
  aria-label={connectionLabel}   // "Live", "Reconnecting", or "Disconnected"
  title={connectionLabel}
  className={cn(
    "w-2.5 h-2.5 rounded-full flex-shrink-0",
    sseState === 'live'          && "bg-green-500 motion-reduce:animate-none animate-pulse",
    sseState === 'reconnecting'  && "bg-amber-400",
    sseState === 'failed'        && "bg-red-500",
  )}
/>
```

The `xl:flex` block retains the full text badge and WS chip for wide viewports. The dot is the minimum signal for every viewport. Tie `live-feed.tsx` line 82's pulse-dot to `connection.sseConnected` rather than hardcoding `bg-green-500`.

### On max-retry exhaustion (fix for P0 SSE + P0 WS findings)

When SSE exhausts 20 attempts, call `setConnection({ sseFailed: true })`. Render a **persistent dismissible banner** (not a toast — Doherty Threshold: the operator must not miss this):

```
[!] Live feed disconnected.  [Reconnect]  [Dismiss]
```

- Clicking **Reconnect** resets `sseReconnectAttemptsRef.current = 0`, clears `sseFailed`, and calls `connect()`.
- The banner persists until manually dismissed or reconnection succeeds.
- For WebSocket: `setConnection({ reconnectAttempts: 0, wsFailed: true })` on exhaustion. Header renders `"Disconnected — Reconnect"` chip (not `"reconnecting (10)"`).

### Last-updated timestamps

Every panel that displays data must render a `"Updated HH:MM:SS"` line below its title bar when SSE is not `live`. When SSE is `live`, the timestamp is hidden (data is continuously fresh). Format: `text-xs text-muted-foreground` — minimum 12 px, acceptable for metadata at this intent level (below the 15 px body-text floor, but metadata; verify contrast >= 4.5:1 with the active theme).

### Optimistic UI (Doherty < 400 ms)

For all toggle and status-mutation actions (enable/disable alert rule, mark-as-read, agent pause):

1. Apply the UI state change immediately on user interaction (< 16 ms).
2. Fire the API call asynchronously.
3. On success: no additional action needed.
4. On failure: mark the element with a `border-red-500` ring and inline `"Failed — retry?"` text (`role="alert"`). Do **not** silently revert — Tesler's Law requires the system to absorb the error complexity, not lose the user's intent.

React 19's `useOptimistic` is available in this stack. Use it for list-level mutations. For concurrent mutations on the same resource ID, enforce FIFO: queue behind the in-flight request, do not issue two concurrent PATCHes to the same entity.

### Snapshot / freeze

The live feed and task-board panels should expose a **Pause** toggle (keyboard: `Space` when panel has focus). While paused, incoming SSE events are buffered in memory (capped at 500 events), the data display is frozen, and a `"Paused — N events queued"` badge is shown. On resume, the buffer flushes and the display updates. This lets operators inspect a moment-in-time state without disabling the push channel. (Smashing Magazine 2025 real-time dashboard guidance.)

---

## Health Checks

### Aggregated health pill

A global **Health** indicator in the header aggregates the four existing health endpoints:

| Endpoint | What it covers |
|---|---|
| `/api/health` | App server + DB |
| `/api/gateways/health` | Gateway connectivity |
| `/api/memory/health` | Memory module |
| `/api/status` | Overall platform status |

**Aggregation rule** (Hick's Law — fewer choices, faster decisions):

```
Operational  = all four return 2xx with status "ok"/"healthy"
Degraded     = ≥1 returns non-ok but app server is up
Down         = app server or DB unreachable
```

The pill renders in the header's always-visible section (not behind the `xl` guard) as a single 3-state chip: green `Operational`, amber `Degraded`, red `Down`. Color is never the sole differentiator — the text label is always present (WCAG 1.4.1).

**Poll strategy**: the health aggregator polls all four endpoints every 30 s via `useSmartPoll` with `pauseWhenSseConnected: false` (health checks must run even when SSE is live, because they cover the SSE server itself). On `sseFailed`, raise poll frequency to every 10 s.

### Drill-down

Clicking the health pill opens a compact overlay (not a full panel navigation) listing each service with its individual status, last-checked time, and error message if degraded. This is progressive disclosure (Hick's Law) — the summary is always visible, detail is one click away.

The overlay must be keyboard-accessible: `role="dialog"`, `aria-modal="true"`, focus trap, close on `Escape`.

### Health check implementation notes

- Each health endpoint should return `{ status: "ok"|"degraded"|"down", latency_ms: number, detail?: string }`.
- The aggregator component lives at `src/components/layout/health-pill.tsx` (new file), consumed by `header-bar.tsx`.
- Expose the aggregated state in the Zustand store (`connection.healthStatus`) so other components (e.g., the reconnect banner) can conditionally suppress reconnect attempts when the server is known-down.

---

## Notifications & Alerts UX

### Toast severity model

Four severity levels, each with a distinct visual treatment using **both color and icon/shape** (WCAG 1.4.1):

| Severity | Trigger | Icon | Color token | Auto-dismiss | aria role |
|---|---|---|---|---|---|
| `info` | Background task complete, routine status | `ℹ` | `text-blue-400` | 5 s | `role="status"` |
| `warning` | Non-critical threshold, degraded state | `⚠` | `text-amber-400` | 8 s | `role="status"` |
| `error` | Failed mutation, API error | `✕` | `text-red-400` | Never | `role="alert"` |
| `critical` | Agent offline, exec-approval fired, system down | `‼` | `text-red-500` | Never | `role="alert"` aria-live="assertive" |

Rules:

- `error` and `critical` toasts are **never auto-dismissed**. (Jakob's Law — errors require user acknowledgment; auto-dismissing an error violates the convention that errors require attention.)
- `info` and `warning` auto-dismiss is **paused on hover** (pointer) and on focus (keyboard). The dismiss timer resumes on pointer-leave or blur.
- At most **3 toasts** are visible simultaneously. Additional toasts queue; a count badge `"+ N more"` on the bottom toast is the affordance to open the Notification Center. This bounds cognitive load (Miller's Law — 7 ± 2 chunks; 3 toasts keeps the stack within peripheral vision).
- The toast stack is positioned `bottom-right` with `16 px` margin from edge, stacked upward. Bottom-right is the Jakob's Law convention and avoids covering critical panel content in the upper-left Z/F scan zone.

### Notification Center (bell icon)

The bell button in the header is the canonical entry to persistent notifications. Required fixes:

**Accessible label** (fix for P1 finding — WCAG 1.1.1 + 4.1.2):

```tsx
<Button
  aria-label={`Notifications, ${unreadCount} unread`}
  onClick={openNotificationCenter}
>
  <span aria-hidden="true">🔔</span>
</Button>
```

Update `aria-label` reactively. The badge `<span>` carrying the count number adds `aria-hidden="true"` — the count is already in the button's accessible name.

**Bind to SSE store** (fix for P0 finding — notifications-panel ignores Zustand):

```tsx
const notifications = useMissionControl(s => s.notifications);
```

SSE-delivered notifications appear instantly (< 100 ms). The REST poll (`useSmartPoll` 30 s) becomes a background reconciliation only, not the primary delivery path. Remove the free-text `recipient` input; derive it from the authenticated session. Expose an admin-only filter dropdown for recipient scoping.

**Severity column** (fix for P1 finding — schema + UI):

Add `severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warning','error','critical'))` to the `notifications` table via migration. Map alert-rule triggers to `error` or `critical` by default. The notification list renders a severity badge (icon + color + text label) at the left edge of each row. A severity filter row (`All | Info | Warning | Error | Critical`) sits at the top of the list — this is progressive disclosure via Hick's Law.

### aria-live region (fix for P0 WCAG 4.1.3 finding)

At the app shell level (`src/app/[[...panel]]/page.tsx` or `src/components/layout/`), add:

```tsx
{/* Screen-reader announcement region — visually hidden */}
<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {liveAnnouncement}
</div>
<div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
  {criticalAnnouncement}
</div>
```

Update `liveAnnouncement` whenever `unreadNotificationCount` increases (e.g., `"3 unread notifications"`). Update `criticalAnnouncement` when a `critical`-severity SSE notification arrives (e.g., `"Critical: Agent worker-1 went offline"`). Never update both in the same render cycle — assertive interrupts polite.

### Deduplication and snooze (alert fatigue)

Alert fatigue — the primary reason operators disable notifications — is caused by repeated toasts for the same event class. (Reuters Institute research, cited by eleken.co.)

**Deduplication rule**: within a 60 s window, if two or more notifications share the same `(type, entity_id)` tuple, collapse them into a single toast with a count: `"Agent worker-1 errored (×3)"`. Each subsequent match increments the counter and resets the dismiss timer rather than pushing a new toast.

**Snooze rule**: every non-critical notification row in the Notification Center has a `"Snooze 1h"` action. Snoozing suppresses new toasts for that `(type, entity_id)` pair for the specified duration. Snoozed rules are listed in a collapsible `"Snoozed"` section at the bottom of the center. This is Tesler's Law applied to alert volume — the system absorbs the muting complexity.

**Alert rule clarity** (fix for P1 severity differentiation finding):

Each alert rule row in `alert-rules-panel` must display:
- Rule name (text-base, ≥ 15 px)
- Entity type badge (icon + text, not color-only)
- Severity selector (`info / warning / error / critical`) — new field
- Last triggered timestamp (text-sm, no opacity modifier)
- Toggle with `role="switch"` `aria-checked` `h-6` minimum (fix for P1 WCAG 2.5.5 finding)

**Destructive delete** (fix for P1 immediate-delete finding): replace single-click delete with a two-step confirmation — first click changes the trash button to a red `"Confirm delete"` button with a 4 s auto-reset. This is Tesler's Law (error prevention absorbed into the interaction, not the user's memory). Add a client-side role check: hide the delete button entirely for non-admin sessions.

### Mutation failure feedback (fix for P2 silent-swallow finding)

All notification and alert-rule mutations (`markRead`, `markAllRead`, `toggleRule`, `deleteRule`) must:

1. Apply optimistic state immediately.
2. On failure: display an inline `role="alert"` error message adjacent to the affected element (not a console log, not a silent re-fetch).
3. Provide a `"Retry"` link/button in the error message.
4. Cap retry attempts at 3; on final failure, restore original state and explain why (`"Could not save — check your connection"`).

The existing `error` state pattern in `notifications-panel.tsx` lines 109–113 is the correct model; extend it to all mutation catch blocks.

### Timestamps (fix for P2 text-[10px] finding)

Timestamps in the notification list and alert-rules rows: minimum `text-sm` (14 px). Use `text-muted-foreground` with no opacity modifier. The `text-[10px] text-muted-foreground/40` pattern at `notifications-panel.tsx` line 153 and `text-2xs` at `alert-rules-panel.tsx` lines 155, 159, 163 must be replaced. The `text-2xs` (10 px) token is decorative-only — it must not carry data users need to act on.

---

## Implementation Priority Order

| Priority | Item | Files affected | Effort |
|---|---|---|---|
| P0 | SSE `sseFailed` state + persistent reconnect banner | `use-server-events.ts`, `live-feed.tsx`, store | S |
| P0 | WS `wsFailed` state + header chip fix | `websocket.ts`, `header-bar.tsx`, store | S |
| P0 | `aria-live` announcement region | `page.tsx` or shell layout | XS |
| P0 | Notification panel binds to SSE store; derive recipient from auth | `notifications-panel.tsx` | M |
| P1 | SSE event IDs + ring-buffer replay | `api/events/route.ts`, event-bus | M |
| P1 | Migrate polling panels to `useServerEvents` (agent-squad, office, task-board) | 3 panel files | M |
| P1 | Connection health dot outside `xl` guard | `header-bar.tsx` | XS |
| P1 | `useSmartPoll` + raised intervals for remaining polling panels | 5 panel files | S |
| P1 | Bell button accessible label; notification severity model + DB migration | `header-bar.tsx`, `notifications-panel.tsx`, schema | M |
| P1 | Alert rule toggle WCAG fixes (role=switch, h-6, delete confirm) | `alert-rules-panel.tsx` | S |
| P2 | Global health pill component | `health-pill.tsx` (new), `header-bar.tsx` | M |
| P2 | Toast deduplication + snooze | toast store / notification infrastructure | M |
| P2 | Mutation optimistic UI + failure feedback | `notifications-panel.tsx`, `alert-rules-panel.tsx` | S |
| P2 | Timestamp size fix (text-sm, no /40 opacity) | `notifications-panel.tsx`, `alert-rules-panel.tsx` | XS |

Effort key: XS < 1 h, S = 1–3 h, M = 3–8 h.

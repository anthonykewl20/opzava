<!-- agent-context: read this before editing the module -->

# status-actions

## Purpose

The dispatch registry behind `GET /api/status`. It replaces a ~800-line god handler with one small
interface: a table of named `?action=` surfaces (`STATUS_ACTIONS`) plus a lookup (`getStatusAction`).
Each entry is an adapter that declares whether it requires auth and carries a `run(ctx)` returning its
full response body. The route stays a thin HTTP adapter (parse action → enforce auth per the action's
declaration → dispatch → uniform 500 handling).

> **Note on the surface name.** Despite the name, this module is **not** a tasks/agents status-transition
> state machine. "Status" = system/operational status (health, dashboard, gateway, models, capabilities).
> The tasks/agents counts in `getDbStats` are read-only `COUNT(*) GROUP BY status` aggregations served to
> the dashboard — they never mutate task/agent state. The only write here is a best-effort `UPDATE agents
> SET status, last_seen` inside `getSystemStatus` that reconciles the DB from live session data (and any
> failure is swallowed, not a transition guard).

## Public surface

Exported from `src/lib/status-actions.ts`:

- `interface StatusActionContext` — `{ workspaceId: number; request: NextRequest }` (workspaceId is `1` for the anonymous `health` action).
- `interface StatusAction` — `{ requiresAuth: boolean; run: (ctx) => Promise<unknown> | unknown }`.
- `const STATUS_ACTIONS: Record<string, StatusAction>` — the registry. Exactly six keys, locked by `status-actions.test.ts`:
  - `overview` (auth) → `getSystemStatus`
  - `dashboard` (auth) → `getDashboardData` (system + db stats)
  - `gateway` (auth) → `getGatewayStatus`
  - `models` (auth) → `{ models: getAvailableModels() }` (envelope contract, asserted by test)
  - `health` (**anonymous**) → `performHealthCheck` — the only `requiresAuth: false` entry
  - `capabilities` (auth) → `getCapabilities(request)`
- `function getStatusAction(action: string): StatusAction | undefined` — the dispatcher's lookup; returns `undefined` for unknown/empty actions.
- `function getMemorySnapshot()` — cross-platform memory + swap probe, re-exported here so `system-monitor` reuses the single implementation (Gap C dedup, enforced by `system-monitor/route.test.ts`).

The individual handler functions (`getSystemStatus`, `getDbStats`, `getGatewayStatus`, `getAvailableModels`,
`performHealthCheck`, `getCapabilities`, `checkProviderReadiness`, `checkDirectConnections`, `isPortOpen`)
are **module-private** — not exported. Adding or changing a surface means editing the registry, not calling them directly.

## Dependencies

**Outbound** (what this imports):
- `@/lib/*` Engine-A siblings: `command`, `config`, `db`, `sessions`, `models`, `logger`,
  `provider-subscriptions`, `version`, `hermes-sessions`, `gateway-runtime`, `connectivity-health`.
- Node built-ins: `net`, `os`, `fs`, `path`.
- **Engine-B edges (boundary touches) — confined to the `health` action's `checkProviderReadiness`:**
  - `@/opzava/modules/content` → `resolveResendCampaignConnection`, `resolveWordpressDraftConnection`
  - `@/opzava/platform/providers/env-secret-resolver` → `createEnvSecretResolver`
  These are **read-only readiness checks** (configured + secret resolvable), deliberately not live network
  probes, because the `health` action is anonymous and frequently polled (see Invariants).

**Inbound** (callers an editor must not silently break):
- `src/app/api/status/route.ts` — the thin route; imports only `getStatusAction`.
- `src/app/api/system-monitor/route.ts` — imports `getMemorySnapshot` (the dedup guard test fails if this is re-derived locally).
- `src/lib/__tests__/status-actions.test.ts` — locks the six-key contract, the `health`-is-the-only-anonymous-action rule, and the `{ models }` envelope.

## Invariants

1. **The registry is the only routed `?action=` surface.** Adding/removing an action is an intentional,
   reviewed change — `status-actions.test.ts` asserts the exact sorted key list
   `['capabilities','dashboard','gateway','health','models','overview']`. Do not bypass the table with an
   ad-hoc switch in the route.
2. **`health` is the sole anonymous action** (`requiresAuth: false`); the route runs it *before* auth so
   Docker/Kubernetes probes work without cookies (`route.ts:22-29`). Every other action requires `viewer`
   auth. The test pins this — do not mark a second action anonymous without intending to expose it unauthenticated.
3. **Provider checks are readiness, not live calls.** `checkProviderReadiness` resolves config + secrets only
   and never makes a billable external request, because `health` is anonymous and frequently polled. Live
   reachability stays at `POST /api/connections/test`. Do not add a network probe to this path.
4. **Handlers fail soft to keep the endpoint alive.** Every external/DB step is wrapped in try/catch that
   logs and degrades (e.g. `getDbStats` returns `null` on error; each health `checks.push` swallows its own
   failure into a single error entry). The overall `health.status` rolls up from the checks array
   (`error|critical → unhealthy`, DB-warning → `degraded`, else `warning`). Preserve this per-check isolation.
5. **Idempotency is "pure read" — except one best-effort write.** All `run(ctx)` handlers are read-only
   aggregations and safe to call repeatedly. The single write is `getSystemStatus` reconciling
   `UPDATE agents SET status, last_seen, updated_at` from live session data; it is best-effort inside a
   swallowed catch and is NOT a guarded state transition. Nothing here enforces a tasks/agents state machine.

## Harmony rules

- **Engine:** This is **Engine A** (inherited `src/lib` / `src/app`). The status-action registry is an
  inherited operational surface (system/dashboard/gateway/health/capabilities).
- **Boundary gate to Engine B (`src/opzava`):** the `agents` table (ARD 0007, enforced by
  `test/engine-boundary.test.mjs`). The two `@/opzava/...` imports here are a deliberate, read-only
  boundary touch — Engine A's `health` action reuses Engine B's provider-readiness resolvers rather than
  duplicating them. They must stay confined to `checkProviderReadiness` and must not bleed Engine-B domain
  logic (campaign workflows, durable jobs, approvals) into this inherited surface.
- **No new product behavior here.** New product status surfaces (e.g. Engine-B workflow status, realtime-chat
  metrics — the doc comment names these explicitly) belong as a new **registry entry that calls into
  `@/opzava/...`**, not as fresh product logic written inside this `src/lib` file. Only hardening,
  dedup, and customization of the inherited operational surfaces belongs in this module.
- **Dead-surface / dead-wired:** none. Unlike `core/workflows` run/step-run machinery, every entry in
  `STATUS_ACTIONS` has a live consumer (`GET /api/status`), and `getMemorySnapshot` has a second live
  consumer (`GET /api/system-monitor`).

## Editor guardrails

Copied from `docs/architecture/system-map/92-stale-findings.md` — none of the Engine-B workflow/provider
dead-surface traps apply to this `src/lib` operational registry. The one trap that transfers is the
**two-unreconciled-agent-models** finding, because this module reads/writes the inherited `agents` table:

- **✅ CONFIRMED — two unreconciled agent models** (`docs/architecture/system-map/92-stale-findings.md`):
  the inherited `agents` table (driven by `src/lib/migrations.ts`, surfaced at `src/app/api/agents/`) and
  the opzava `opzava_agent_roles` table (`src/opzava/modules/team/agent-role-repository.ts`) are separate,
  with no bridge or reconciliation code.
  - **Applies here (team MODULE.md, engine-boundary):** inherited "agents" ≠ opzava "roles". The `agents`
    table this module reads (`getDbStats` count-by-status) and best-effort-writes (`getSystemStatus`
    status sync) is the **inherited** model. Do not assume it shares an id or lifecycle with
    `opzava_agent_roles`. See ARD 0007 (engine separation) and `test/engine-boundary.test.mjs`.

No trap from `docs/architecture/realtime-chat-production-review.md` applies to this surface. That review's
traps are scoped to the realtime-chat write path (coordinator `body.from` spoofing, outbox transactional
integrity, `client_message_id` idempotency, SSE replay gaps). This module is a synchronous read-only status
registry with no chat/event/outbox write path, no `from` override, and no SSE delivery — the chat traps do
not transfer.

# ARD 0021 — Linked-Tool Health (Connected tools, surface 24)

- **Status:** Accepted
- **Date:** 2026-06-25
- **Relates-to:** [ARD 0012](0012-device-authorization.md) (`DeviceAuthorization` — the spine the wizard reuses), [ARD 0013](0013-ux-redesign-product-entity-model-and-wiring.md) (parity; D7.6 / 90 §H1), [ARD 0007](0007-engine-separation-and-surface-unification.md) (engine separation), [ARD 0020](0020-user-profile-overlay.md) (the profile doorway → this surface), [CONTEXT.md](../../CONTEXT.md) `LinkedTool`/`ToolHealth`, [wiring/24-tools-connections.md](../architecture/ux-redesign/wiring/24-tools-connections.md), [100-theme-resolutions.md](../architecture/ux-redesign/wiring/100-theme-resolutions.md) T4.

## Context

The "Your tools" surface (`essential-tools.html` + `-empty` + `essential-connect-wizard.html`; surface 24) shows the operator's linked agent tools (Claude Code, OpenCode, Codex CLI, Codex Desktop, Claude Desktop, OpenClaw, Hermes — "5 of 7 connected") with a 5-state health glyph (`active|connected|degraded|disconnected|not_linked`, glyph+label, never colour) + a 4-step connect wizard. ARD 0020's profile doorway points here.

Grounding tested the hypothesis "LinkedTool = a view over `DeviceAuthorization`" → **partial**:

- **`DeviceAuthorization` (ARD 0012) is fully implemented** — migration 058: `device_tokens` (`device_label` = tool identity, `last_seen_at`, `revoked_at`, expiry, rotation chain) + `oauth_device_sessions` (approval handshake) + the RFC 8628 routes. The connect wizard reuses this flow.
- **`LinkedTool`/`ToolHealth` are genuinely net-new** — no `opzava_linked_tool`/`opzava_tool_health` tables, no `src/opzava/modules/tools/`, no catalog, no routes, no composition reader. `LinkedTool` is a **registry + health projection** on top of device-auth + gateway-health, not a mere view.
- Health is **F-INTEGRATION**: no probe contract for CLI/desktop tools; only gateways expose live health; `gateway_health_logs` even lacks `agents_count`.

## Decision

Build the linked-tool registry + connect wizard + an honest derived-health projection, **Engine-B**, reusing the device-auth spine. Ten provisions:

1. **Scope (grilled):** registry + catalog + wizard + composition reader, with state populated ONLY from real signals; **defer** the CLI/desktop heartbeat protocol.
2. **Tables (Engine B, `src/opzava/modules/tools/`):** `opzava_linked_tool` (registry — `tool_id` PK, name, method `[live|gateway|mcp]`, `owner_user_id`, `connection_ref`→admin-config, `verification [heartbeat|manual]`, `runtime_agent_id`, `record_json`, timestamps) + `opzava_tool_health` (`tool_id`, `checked_at`, `state`, `latency_ms`, `detail`; PK `(tool_id, checked_at)`). `createLinkedToolRepository(db)` per the Engine-B convention (ensureSchema + record_json). Credentials/endpoints live in admin-config + `SecretReference`, **never** in the tool row (golden principle §1.2).
3. **Fixed catalog:** a tool-catalog constant (the 7 tools + `supportedMethods` + glyph). `not_linked` = a catalog tool with no linked-tool row / no valid grant. Tools outside the catalog are unknown (not free-form registration). Extensible later by editing the constant.
4. **State is a PROJECTION, never a stored flag.** `projectToolState` composes: `connected`/`disconnected` from device-grant validity (`device_tokens.revoked_at` / `access_expires_at`); `not_linked` from catalog∖registry; gateway `active`/`degraded` from `gateway_health_logs` (`active` = online AND `agents_count`>0 — **derive `agents_count` at probe time** by joining the `agents` table, no inherited-schema change); MCP via manual-confirm (`verification='manual'`). **"probe pending"** is the honest default for an unprobeable tool — NEVER a fabricated ●/✦.
5. **Honest state cap (100 T4):** Live-agent/CLI tools cap at `connected`/`disconnected`/`not_linked`; MCP caps at `connected(manual)`/`not_linked`; ONLY gateways reach `active`/`degraded`. The "5 of 7 connected" rollup counts real grants/health, never fabricated.
6. **Composition read-seam (the ARD-worthy claim, 24:174 — RATIFIED):** the merge of `device_tokens` (Engine A) + `gateway_health_logs` (Engine A) + `agents` heartbeat (Engine A) → `opzava_tool_health` (Engine B) happens ONLY through `readUnifiedToolHealth` (a composition-layer reader). The tools module **never** imports `src/lib` or references inherited tables (`engine-boundary.test.mjs`). The agent-heartbeat→tool-state bridge is a one-way composition read.
7. **Probe adapters per method behind a uniform interface:** `LiveHeartbeatAdapter` (poll `agents.last_seen`), `GatewayHealthAdapter` (`GET /api/gateways/health` — the only honest `active`/`degraded` source), `McpManualAdapter` (no auto-probe; manual-confirm). `probeToolHealth` writes `opzava_tool_health` rows; the surface reads the latest projection.
8. **Connect wizard = the device-code flow (ARD 0012) in UX clothing:** Step 1 pick tool (catalog), Step 2 pick method (**Opzava extension** to RFC 8628 — MCP|Live|Gateway, auto-skip if single), Step 3 copy command (templated from `MC_URL` admin-config + masked `MC_API_KEY`) → `POST /api/tools/connect` creates a pending linked-tool row, Step 4 live-verify (poll for Live/Gateway; manual-confirm for MCP). The "assistant wires itself" tab degrades to **assistive instructions** (F-AI-LIMIT — no agent has local filesystem access; the human confirms).
9. **Routes (Engine B, thin):** `GET /api/tools` (list + current projected health), `POST /api/tools/connect`, `POST /api/tools/[id]/reconnect`, `PATCH /api/tools/[id]` (manual-confirm / owner), `DELETE /api/tools/[id]` (unlink). Events: `tool.status_changed` / `tool.linked` / `tool.unlinked` (via `eventBus`, record-before-emit).
10. **Deferred (tracked, honest):** the CLI/desktop heartbeat protocol (`active`/`degraded` for non-gateway tools); tool↔StepRun linkage ("running a step" — StepRun is dead surface here); p95/latency for non-gateways. ARD 0020's doorway "5 of 7" binds to `GET /api/tools` once this ships.

## Consequences

- **Positive:** reuses the fully-built device-auth spine (the wizard is UX over RFC 8628; `connected`/`disconnected` derive from grants); honest health (real signals only, glyph-not-colour, probe-pending default); engine boundary respected (composition read, no cross-import); convention-exact repository.
- **Negative:** a substantial net-new Engine-B surface (2 tables, repo, catalog, composition reader, 3 probe adapters, 5 routes, the wizard); `active`/`degraded` limited to gateways until a CLI heartbeat protocol exists; gateway `active` needs `agents_count` derived at probe time (a join, not a column) — a small perf consideration.
- **Neutral:** device-auth (Engine A) is untouched; the tools surface is a dependent system over it; CONTEXT.md `LinkedTool`/`ToolHealth` terms already exist (+ a new composition-boundary Forbidden-Ambiguity entry).

## Alternatives considered

- **LinkedTool as a pure view over `device_tokens` (no registry).** Rejected: `device_tokens` is an auth artifact (no "known but unconnected" tool, no health history, no catalog); `not_linked` + health-over-time + the "5 of 7" need a registry + probe history.
- **Free-form tool registration (any device).** Rejected: the mockup + `not_linked` semantics need a fixed catalog of known tools; free-form can't express `not_linked`.
- **Add `agents_count` to `gateway_health_logs` (Engine-A schema change).** Rejected in favour of derive-at-probe: avoid churning the inherited gateway schema; join the `agents` table at probe time.
- **Cross-engine import (tools module reads `device_tokens`/`gateway_health` directly).** Rejected: violates the boundary; merge only via `readUnifiedToolHealth`.
- **Build the CLI heartbeat protocol now.** Rejected this slice (grilling): the tools themselves must emit heartbeats — a separate F-INTEGRATION effort; the honest interim caps non-gateway tools + shows "probe pending".

## References

- Surface: `wiring/24-tools-connections.md` (74 elements; F-NOW 54 / F-INTEGRATION 15 / F-AI-LIMIT 5; net-new tables/routes/events; the ARD-worthy claim at 24:174); mockups `essential-tools{,-empty}.html`, `essential-connect-wizard.html`; `12-linked-tools-health.md` (catalog + anatomy); `100-theme-resolutions.md` T4 (state cap).
- Spine (per grounding): ARD 0012; migration 058 (`migrations.ts:1512+` — `device_tokens`/`oauth_device_sessions`); device routes `src/app/api/auth/device/{code,approve,token}`; `token-service.ts` (`device_label`, `last_seen_at`); `auth.ts` B1b `resolveDeviceToken`.
- Existing health: `gateway_health_logs` (`migrations.ts:1370`); `GET /api/gateways/health`; `agents.last_seen` (inherited).
- Domain: CONTEXT.md `LinkedTool`/`ToolHealth` (+ the active-only-for-gateways + composition-read Forbidden-Ambiguity entries).
- Relates: ARD 0007 (engines), ARD 0013 (D7.6 / §H1), ARD 0020 (the profile doorway).

## Deep-module design (codebase-design — design-it-twice winner)

A deeper grilling (probe model = on-demand at GET + ~20s memo) + 3-way design-it-twice produced this build-ready shape (D2-structural spine + D3 render-ready view + bare-function convention).

**Files:** `src/opzava/modules/tools/` (Engine-B-PURE) — `tool-state.ts` (ceiling types), `tool-catalog.ts` (the 7), `tool-health-adapter.ts` (3 adapters), `project-tool-state.ts` (pure projector), `tool-view.ts` (render-ready view), `linked-tool-repository.ts`. + `src/opzava/platform/tool-health/` (composition) — `engine-a-signals.ts` (by-value Engine-A reads), `unified-tool-health.ts` (`readUnifiedToolHealth` + `listToolsWithHealth` memo). + routes `api/tools/{route, [id]/route, [id]/reconnect/route}`.

**Engine boundary (RATIFIED by precedent):** `modules/tools/` imports zero `src/lib` and names zero inherited tables → passes `engine-boundary.test.mjs` exactly like `modules/team`. The Engine-A signal reads (`device_tokens`, `gateway_health_logs`⋈`agents`, `agents.last_seen`) live ONLY in `platform/tool-health/engine-a-signals.ts` — the same sanctioned placement as `platform/costs/unified-cost-reader.ts` (which already reads `token_usage` by value, gate-green). `readUnifiedToolHealth` is the composition reader; the module never holds an Engine-A handle.

**The state ceiling is a COMPILER guarantee (the key deepening):** per-method narrower unions — `LiveHeartbeatState = Extract<ToolState,'connected'|'disconnected'|'not_linked'>`, `McpManualState = 'connected'|'not_linked'`, `GatewayHealthState = 'active'|'degraded'|'disconnected'|'not_linked'`. Each adapter is declared `=> Probe<itsState>`, so a LiveHeartbeat adapter returning `'active'` is a **`tsc` failure**, not a review catch; a compile-time `_activeProof` assertion guards the partition against future widening; `ADAPTER_BY_METHOD satisfies Record<ToolMethod,…>` makes a new method without an adapter a compile error. `probe_pending` is a discriminated `Probe<S>` wrapper (`kind:'pending'` carries no `state`) → a never-probed tool **cannot** be rendered `connected`. "Never fabricate ✦/◐ for a non-gateway tool" (100 T4) becomes *unrepresentable*, not merely avoided.

**`projectToolState` (PURE, total):** `(signals, catalog, registry, now, windows) → ToolView[]` — no db, no clock (`now` injected); one **render-ready** `ToolView` per catalog entry (always 7; glyph/badge/detail/action/isCurrentDevice precomputed so the panel switches on one enum). Grant-validity gates everything (revoked/expired `device_tokens` → `disconnected` regardless of probe); `not_linked` = catalog ∖ registry; staleness windows (default `connected < 10min`) live here, admin-config-tunable. `summarizeToolHealth` counts only `active|connected|degraded` — `probe_pending`/`not_linked` cannot pad "5 of 7".

**Repository (Engine-B-pure, convention-exact):** `createLinkedToolRepository(db)` — lazy `ensureSchema`, prepared stmts, `record_json`, `Object.freeze` (per `agent-role-repository.ts`). `opzava_linked_tool` (unique index on `(toolKey, owner, method)` → connect idempotency) + `opzava_tool_health` (PK `(tool_id, checked_at)`, write-through history). No token/endpoint column (`.strict()` zod rejects extras → no-secret is structural).

**Probe model:** on-demand at GET — `listToolsWithHealth(db, userId)` memoizes ~20s (per-user `Map`; mutation routes call `invalidateToolCache`; self-heals; no background loop); write-through persists each fresh projection as an `opzava_tool_health` sample; `tool.status_changed` emitted only on a real transition (record-before-emit).

**Connect wizard = device-code flow (ARD 0012):** Step 3 `POST /api/tools/connect` (templated from `MC_URL` + **masked** `MC_API_KEY`, never raw) creates a pending row; Step 4 polls the same `GET /api/tools` until the grant flips state (live/gateway) or `PATCH {confirm:true}` (MCP manual); the "assistant wires itself" tab degrades to assistive instructions (F-AI-LIMIT).

**Test seam:** `projectToolState`/adapters/catalog tested DIRECTLY (pure, literal rows; `@ts-expect-error` that a live adapter can't return `'active'`); repository + signal-readers via in-memory SQLite (the `agent-role-repository.test` idiom); the boundary gate extended to scan `modules/tools` (passes as-is) with `platform/tool-health` sanctioned like the cost-reader. **Deletion test:** removing `modules/tools` + `platform/tool-health` loses only linked-tool health; Engine A (device-auth, gateways, agents) is untouched.

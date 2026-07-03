# Slice 2.5 Design Memo Red-Team Review

Scope: `docs/plan/research/slice2.5-cc-mcp-live-card.md`
Grounding artifacts: `docs/plan/EXECUTION.md`, `docs/plan/grilling-decisions.md` (Q16), `ux-redesign/mockups/orchestrator-chat.html`, `ux-redesign/mockups/task-board.html`, `ux-redesign/mockups/essential-card.html`, `ux-redesign/mockups/issues.html`, `packages/runtime-control`, `apps/gateway-broker/src/internal/http-server.ts`, `apps/web/lib/ask-admin-stream.ts`, `apps/web/lib/session.ts`, `packages/identity-access/drizzle/0002_slice1e_tasks.sql`, `packages/identity-access/drizzle/0003_slice2_runtime_control.sql`, and MCP/GitHub docs.

## Verdict: UNSOUND

### 1) [Critical] Link-token authority is underspecified and vulnerable to theft/replay
- **Memo section**: `Authentication & session handoff` and `live card join flow` sections (around lines ~523+).
- **Evidence**:
  - `grilling-decisions.md` Q16 (lines ~383-394) binds trust to `tasks:read|write` and one-time link tokens tied to session membership/version, which can be re-used unless strict TTL + audience checks are enforced at every request.
  - `apps/web/lib/session.ts` only re-derives tenant/workspace context from session object and does not add independent bind checks for outbound card-link actions.
  - MCP authorization spec requires bearer tokens in HTTP headers per request and token audience validation (`modelcontextprotocol.io/specification/2025-11-25/basic/authorization`).
- **Risk**:
  1. Token theft via shared logs/clipboard/Referrer is viable if token appears in link context and not strictly bound to client fingerprint.
  2. Replay window exists because revocation and session membership checks are described but no evidence of short-lived, rotating, single-use proof-of-possession token.
  3. Scope creep risk: payload includes task context beyond `tasks:read|write`, enabling future privilege inflation without re-auth.
- **Fix**:
  - Use short-lived, single-use proof tokens in Authorization header only (never in URL/query for this flow), include `aud`, `scope`, `sid`, `tenant_id`, `exp`, and nonce hash.
  - Enforce token introspection/blacklist at gateway and reject on session version drift.
  - Add strict one-time claims stored with write-once row + index on replay attempts.

### 2) [Critical] MCP transport claim (SSE + multi-consumer) conflicts with protocol behavior and our existing seam
- **Memo section**: `transport topology` (around lines ~560-600)
- **Evidence**:
  - MCP spec (2025-11-25 transports) positions SSE as legacy and recommends modern Streamable HTTP for remote clients; Streamable HTTP is designed for request/response over POST.
  - C# SDK notes SSE legacy `/sse` + `/message` endpoints are stateful and disabled by default due to backpressure; POST returns `202 Accepted` before work completes (`csharp.sdk.modelcontextprotocol.io/api/ModelContextProtocol.AspNetCore.MapMcp` docs via search result).
  - `packages/runtime-control/src/application/task-tools.ts` currently exposes only `opzava_tasks_list`, `opzava_tasks_create`, `opzava_tasks_update` tool handlers; no transport or fanout helper for per-consumer stream subscriptions.
- **Risk**:
  1. Memo overstates multi-consumer behavior with SSE but no clear handling of session affinity/resume semantics.
  2. Concurrent `/message` requests can outpace downstream capacity because SSE mode has weak backpressure and unbounded in-flight work (as noted in official MCP SDK notes).
  3. Our tool seam does not yet expose any consumer-aware publish path, so “broadcasted live card stream” behavior cannot be guaranteed.
- **Fix**:
  - Migrate to Streamable HTTP default with explicit stateless/stateful policy and `Mcp-Session-Id` handling where required.
  - Add explicit fanout layer (event bus + sticky session tokens) so multiple viewers get consistent event projection without shared-process assumptions.

### 3) [High] Card-id sequence generation under concurrency is high-risk
- **Memo section**: `id generation` (`card_id`, `per-workspace sequence`, `advisory lock`) around lines ~650+.
- **Evidence**:
  - No existing migration for the 2.5 card sequence exists yet (`packages/identity-access/drizzle/` contains `0002_...` and `0003_...` only in existing files observed).
  - `packages/identity-access/drizzle/0002_slice1e_tasks.sql` and `0003_slice2_runtime_control.sql` show explicit RLS + FK patterns; no analogous sequence table/schema exists to anchor safe ordering.
  - `runtime-control` tools currently parse/create task ids as UUIDs and do not expose sequence semantics.
- **Risk**:
  1. Advisory-lock-based counters can deadlock under long transactions and duplicate/gap under crash or partial rollback.
  2. Per-workspace sequence in app code without serializable transaction boundaries increases duplicate-card-id collisions.
- **Fix**:
  - Use database-native sequence/identity columns or `INSERT ... RETURNING` with `UNIQUE(workspace_id, card_sequence)` and retry-on-conflict.
  - If human-readable IDs are required, store both internal UUID PK and mutable user-facing sequence from DB sequence.

### 4) [Critical] Active-close write-through and completion atomicity are under-modeled
- **Memo section**: `active-close`, `write-through`, `retries` around lines ~700+.
- **Evidence**:
  - `apps/gateway-broker/src/internal/http-server.ts` maps internal tool lifecycle events via `tool.completed -> tool.succeeded` and normalizes several paths to success, indicating lossy event translation without idempotent close state.
  - `apps/web/lib/ask-admin-stream.ts` has terminal-state handling + synthetic `interruptedAskAdminStreamEvent` path, with no durable replay queue contract in this memo.
  - There is no explicit mention in memo of atomic “close+complete” transition guards around DB writes and outbound event emission.
- **Risk**:
  1. Double-close: separate close+completion paths can both write `closed_at`, causing inconsistent states and duplicated side-effects.
  2. Retry queue durability is absent; transient failures can drop events and wedge UI state.
  3. Reopen divergence: local cache may accept reopen even if backend persisted close earlier.
- **Fix**:
  - Introduce explicit state machine (`OPENING→ACTIVE→CLOSED_COMPLETION_PENDING→CLOSED_DONE`) with idempotency keys and single write transaction.
  - Persist outbox events and emit with de-dupe keys for UI bridges.
  - Add rate-limited retry worker with exponential backoff and dead-letter retention.

### 5) [High] Live parity checklist is inconsistent with concrete mockup elements
- **Memo section**: `Mockup parity checklist` and `live-card acceptance criteria` near end.
- **Evidence**:
  - `ux-redesign/mockups/orchestrator-chat.html` contains visible pills and help affordances (`What’s this?`, account/health status blocks, assistant cost/log/alerts action chips) that are not all reflected in memo's explicit checklist.
  - `ux-redesign/mockups/task-board.html` has `New task`, search/filter toolbar, explicit empty “Done” state, and loaded/skeleton card states.
  - `ux-redesign/mockups/essential-card.html` includes typing indicators/read markers, mention popover, card action menu, evidence/files tabs, and a “Done” completion dialog surface that require backend/event parity.
  - `ux-redesign/mockups/issues.html` includes “Synced with GitHub”, triage strip, and “Showing X of Y open” pagination/count copy; only partial coverage appears in memo.
- **Risk**:
  - Delivery promise overstates feature surface unless additional backend hooks are delivered in 2.5.
- **Fix**:
  - Revise checklist to map each mandatory visible element to an owning event and data model (including read receipts, typing, and GitHub sync banners).
  - Block slice approval until mockup parity diff is zero.

### 6) [High] 0004 migration for 2.5 lacks documented RLS parity with 0002/0003
- **Memo section**: `migration plan` and `persistence` (around lines ~520-680).
- **Evidence**:
  - Existing Slice 2.x migrations (`0002_slice1e_tasks.sql`, `0003_slice2_runtime_control.sql`) include explicit `ENABLE ROW LEVEL SECURITY`, policy `CREATE POLICY ... FOR ... USING (...) WITH CHECK (...)` patterns.
  - No corresponding `0004` migration file is present in observed identity-access migration directory for 2.5 objects.
- **Risk**:
  - New runtime control tables or join tables added without RLS patterns can become privilege-exposure points.
  - Missing `WITH CHECK` and read policy symmetry breaks multi-tenant isolation guarantees already established.
- **Fix**:
  - Create `0004_` migration with full read/write policy parity to `0002/0003`: tenant/workspace scoping in both `USING` and `WITH CHECK`, plus deterministic migration rollback and ownership checks.

### 7) [High] Interim read-receipts/typing over SSE is non-fault-tolerant in current architecture
- **Memo section**: `real-time parity` and `typing/read-receipts over SSE` near bottom.
- **Evidence**:
  - SSE/stream behavior is already being handled as request/response translation in app code (`ask-admin-stream.ts`, `http-server.ts`) with no shared-state transport contract for scaling.
  - `apps/web` stream ingestion has terminal-state + reconnect fallback logic but no explicit distributed cursor persistence for read/typing ephemeral events.
  - `MCP HTTP/SSE model` in official docs is session-oriented; legacy SSE splits channels and is stateful and replay-sensitive to connection lifecycle.
- **Risk**:
  - In multiple-instance deployment, read/typing markers become node-local and can be dropped or replayed out-of-order.
  - Reopen after reconnect can lose marker history and re-create false unread states.
- **Fix**:
  - Persist ephemeral state (`presence`, `typing`, `read_cursor`) in a durable store and fan out via pub/sub with sequence numbers.
  - Add explicit resume cursors and anti-replay dedupe on frontend consumers.

### 8) [Critical] Slice 2.5 x-splitting is too large for a single-codegen verification cycle
- **Memo section**: `Execution plan` and `sub-slice split`.
- **Evidence**:
  - Memo bundles: auth token hardening, MCP transport migration, sequence generation, write-through semantics, stream parity (typing/read), mockup parity expansion, and RLS migration in one slice narrative.
  - `docs/plan/EXECUTION.md` requires explicit checklists and testable contracts before coding; this scope is >2.5x blast radius.
- **Risk**:
  - Silent coupling: fixes in one area (eg SSE transport) can invalidate assumptions in another (task-id generation or mockup parity).
  - Self-verification in one codegen run becomes infeasible; high probability of regressions hidden under shared mocks.
- **Fix**:
  - Split into explicit subslices: `2.5-A auth tokens`, `2.5-B live transport`, `2.5-C state machine + sequencing`, `2.5-D parity + schema`, `2.5-E migration/RLS hardening` with independent acceptance tests.

### 9) [Medium] mention->assistant-reply loops are not bounded
- **Memo section**: `interaction model` and `mentions` around lines ~820+.
- **Evidence**:
  - `ux-redesign/mockups/essential-card.html` includes explicit mention popover/actions, enabling assistants to self-reference in UI copy.
  - `runtime-control` tools currently allow task update operations without role-level loop guard and there is no explicit suppression policy for assistant-to-assistant mention cycles.
  - `gateway-broker` event mapping converts generic tool completion events without origin attribution for loop-guarding.
- **Risk**:
  - Assistant-generated mentions can be interpreted as fresh tasks/inputs and trigger cascading tool calls (reply storms).
  - Rate-limited API surfaces (including GitHub integration surfaces with 403/429 on limit breach) can rapidly throttle under loops.
- **Fix**:
  - Add mention policy: no self-targeted or assistant-authored mentions in assistant message generation and enforce max chain depth + TTL.
  - Include event dedupe by message hash + per-task loop counters before tool dispatch.

## Required fixes before implementation begins
1. Define and implement strict token model + validation pipeline (header-based bearer, short TTL, audience + session version binding).
2. Replace/clarify transport path: Streamable HTTP with documented session/backpressure semantics; retire unsupported multi-consumer SSE assumptions.
3. Implement DB-native card id mechanism with tested concurrency and migration coverage.
4. Build an explicit close-state transaction model and durable outbox + retry queue.
5. Publish a true mockup parity matrix that includes all visible elements from all four HTMLs.
6. Add `0004` migration with full RLS parity before any app-layer feature relies on 2.5 tables.

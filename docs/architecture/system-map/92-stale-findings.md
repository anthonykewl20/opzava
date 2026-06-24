# Stale & Verified Findings — Opzava Architecture Ledger

> **Purpose.** A curated, code-verified register of the findings an editing AI agent must know.
> Every entry is verified against the shipped source (the `verify-don't-assume` discipline): each
> status is **CONFIRMED**, **PARTIAL**, or **REFUTED**, with `file:line` evidence. This file is the
> single source the colocated `MODULE.md` "Editor guardrails" sections copy from, so the guardrails
> stay consistent across modules.
>
> **Status legend:** ✅ CONFIRMED (still true — treat as an invariant) · ⚠️ PARTIAL (true with
> nuance) · ❌ REFUTED (a prior claim now wrong — corrected here).
>
> Verified 2026-06-24. Where this ledger and the code disagree, **code wins** — fix this ledger.

---

## ❌ REFUTED — "the provider live-execution guard is bypassed / mock-first only"

An older system-map finding asserted the live send path bypasses the safety guard and only the mock
path was wired. **No longer true.** The guarded send path is wired into production:

- `src/app/api/campaigns/[id]/run/route.ts` → `createGuardedCampaignSendExecutorForCampaign`
- → `src/opzava/modules/content/campaign/guarded-campaign-send-runtime.ts`
- → `src/opzava/modules/content/workflow/guarded-campaign-send-executor.ts` → `guardLiveProviderExecutionAfterPreflight`

**Guardrail (content / providers MODULE.md):** the live boundary *is* the production send path. Do
not add a second, parallel live-execution route; all live provider calls go through the guarded
executor.

## ⚠️ PARTIAL — "the durable runner was built but is unused"

The durable runner IS used — but only by the **campaign-send subsystem**, not as a general
per-step runner across the whole content workflow.

- `createRunnerRepository` → `src/opzava/modules/content/campaign/guarded-campaign-send-runtime.ts`
- `createRunnerWorker` → `src/opzava/modules/content/campaign/run-approved-campaign.ts`

**Guardrail (runner MODULE.md):** `Job`/`Attempt` is the real durable-execution model for campaign
sends; the broader workflow steps do not yet run through it. Do not assume every workflow step is
durable.

## ✅ CONFIRMED — core `WorkflowRun`/`StepRun` machinery is dead surface

`parseWorkflowRun`, `parseStepRun`, `transitionWorkflowRunStatus`, `transitionStepRunStatus` in
`src/opzava/core/workflows/contracts.ts` have **zero production consumers** (only their own
`.test.ts`). `parseWorkflowDefinition` is the only wired export — used solely by
`src/opzava/modules/content/workflow/content-workflow.ts:7,117`.

**Guardrail (core/workflows MODULE.md):** do not "fix" or extend the run/step-run transition
machinery assuming it drives execution — it does not. The runner's `Job`/`Attempt` is the execution
model.

## ✅ CONFIRMED — `social` and `general-va` are dead-wired

Both are step libraries with **no SQLite tables and no production callers** — referenced only as
plain string step-ids in `src/opzava/modules/team/department-pipeline.ts`. No route or service
imports their step services at runtime.

**Guardrail (social / general-va MODULE.md):** these modules are scaffolding, not a live pipeline.
Do not assume a caller exists. Renaming or adding a step-id must keep `department-pipeline.ts` in
sync (enforced by `test/stepid-coupling.test.mjs`).

## ✅ CONFIRMED — only 8 content artifact fields are persisted

`src/opzava/modules/content/workflow/record-workflow-artifacts.ts` persists 8 artifact fields
(`CONTENT_WORKFLOW_ARTIFACT_FIELDS`: keywordResearch, sourceCapture, seoBrief, outline, articleDraft,
factCheckReport, brandReview, antiSlopReview). The `human-approval` step is an **approval gate** and
the final `wordpress-draft` is an **external action** — neither is persisted as a content artifact.

**Guardrail (content MODULE.md):** `human-approval` is a gate, not an artifact type; do not expect
it in the artifact store.

## ✅ CONFIRMED — two unreconciled agent models

The inherited `agents` table (driven by `src/lib/migrations.ts`, surfaced at `src/app/api/agents/`)
and the opzava `opzava_agent_roles` table (`src/opzava/modules/team/agent-role-repository.ts`) are
separate, with no bridge or reconciliation code.

**Guardrail (team MODULE.md, engine-boundary):** inherited "agents" ≠ opzava "roles". Do not assume
they share an id or lifecycle. See ARD 0007 (engine separation) and `test/engine-boundary.test.mjs`.

## ✅ CONFIRMED — approval-runtime narrows `target.kind` to `external-action`

`src/opzava/platform/providers/approval-runtime.ts:67` rejects any `target.kind !== 'external-action'`,
while `src/opzava/core/approvals/contracts.ts:15-16` allows both `'artifact'` and `'external-action'`.

**Guardrail (core/approvals + providers MODULE.md):** the provider layer intentionally narrows the
core contract. An `artifact`-targeted approval is core-valid but cannot gate an external provider
call. Accepted narrowing, not a bug — flag it, do not "fix" by widening the provider path.

## ✅ CONFIRMED — `expired`/`cancelled` approvals leave decision fields unconstrained

`src/opzava/core/approvals/contracts.ts:32-41` superRefine constrains only `requested` (no decision
fields) and `approved`/`rejected` (decision fields required). `expired` and `cancelled` fire neither
branch, so `approverId`/`decisionReason`/`decidedAt` are unconstrained for them.

**Guardrail (core/approvals MODULE.md):** known debt. Do not silently rely on or "tighten" these
fields without a deliberate decision.

---

## Realtime-chat traps (from `realtime-chat-production-review.md`)

The production review graded the SSE+HTTP-write spine sound but catalogued defects. The
integrity/privacy/resync/drain items below are **RESOLVED** in the shipped source; the two
write-path correctness items are **CONFIRMED, not yet fixed**. Each is the verbatim guardrail an
editor of the live `src/lib` surfaces (`docs/architecture/engine-a-live-surfaces.md`) must not
regress. **Scope: realtime spine only — task-dispatch/scheduler entries are owned by the Followup
track and intentionally omitted here.**

### ✅ RESOLVED — coordinator `body.from` spoof (P0-1)
An older route honored `body.from === 'coordinator'` as a privileged override from any operator
session (coordinator impersonation). **Fixed.** `from` is now always server-resolved and
`body.from` is ignored on the human-authenticated route.
- **Evidence:** `src/app/api/chat/messages/route.ts:350-354` (`const from = auth.user.display_name
  || auth.user.username || 'system'`; comment block at `:350-353` states `body.from` is never
  trusted).
- **Guardrail (chat write route):** never reintroduce a `body.from` override for human sessions.
  The coordinator override path (if ever needed) must be gated on the coordinator agent's scoped
  API key, not a client string.

### ✅ RESOLVED — SSE chat-membership ACL (P2-1 minimal predicate)
The SSE/replay filter was workspace-only; any workspace viewer could read every DM over the live
stream and on reconnect replay. **Fixed** with a minimal `from`/`to` predicate — no new table.
- **Evidence:** `src/app/api/events/route.ts:84-94` (`chat.*` events carrying `from_agent`/
  `to_agent` are delivered only to the two participants or an operator/admin).
- **Guardrail (SSE route):** the membership predicate runs at the `sendEvent` boundary. Any new
  chat delivery path (including `/api/v1/runs/stream` if it ever carries chat) MUST port this
  predicate. Full `chat_participants` tier remains deferred (P2-1 Phase 2) — do not fold it into
  a hotfix.

### ✅ RESOLVED — `chat_message_sent` unified-audit emission
Human chat sends were absent from the unified audit trail. **Fixed.** Only the user-originated
send is audited; system-generated replies are deliberately excluded.
- **Evidence:** `src/app/api/chat/messages/route.ts:413-419` (`logAuditEvent({ action:
  'chat_message_sent', … })` at `:419` writes to the inherited `audit_log` that `GET /api/audit`
  projects; comment at `:413-417` states the Engine-A/no-new-boundary rationale and the
  exclude-replies rule).
- **Guardrail (chat write route):** do not audit `createChatReply` output — the compliance trail
  records human actions, not agent chatter. Re-auditing replies is a deliberate decision, not a
  drive-by.

### ✅ CONFIRMED — missing `client_message_id` write idempotency (P1-3, NOT yet fixed)
No client-supplied stable key exists anywhere in the write path; the gateway key is derived from
the server-generated messageId + `Date.now()` (non-deterministic). A lost 201 + Retry creates a
duplicate committed row + a duplicate gateway run.
- **Evidence:** `src/app/api/chat/messages/route.ts:527` (`const idempotencyKey =
  \`mc-${messageId}-${Date.now()}\``); no `client_message_id` column in `src/lib/migrations.ts:64-74`;
  store dedup keys on positive server id only (`src/store/index.ts:1120`).
- **Guardrail (chat write route):** do NOT assume a retry returns the same message id or that the
  gateway de-duplicates. Until the `client_message_id` column + partial UNIQUE index +
  `INSERT … ON CONFLICT DO NOTHING RETURNING id` fix lands, a Retry is a duplicate. Derive the
  gateway key from the client id, not `messageId+Date.now()`. Do NOT adopt the
  no-op-`UPDATE...RETURNING` idiom — `DO NOTHING` + optional SELECT is sufficient (REJECT
  over-engineering).

### ✅ CONFIRMED — write path not transactional / outbox-after-IO (P1-1, P1-2, NOT yet fixed)
The messages INSERT, `logActivity`, `createNotification`, and the outbox row (via `broadcast`→
`recordServerEvent`) are FOUR independent auto-commits, and the outbox row is written AFTER up to
~21s of gateway I/O. A hard kill/restart between any two leaves committed-but-SSE-invisible
messages; the user's own message broadcasts only at the end (`route.ts:762`), and coordinator
status replies broadcast earlier (`createChatReply` `:108`) — reply-before-originator ordering.
- **Evidence:** `src/app/api/chat/messages/route.ts:388` (messages INSERT), `:403` (logActivity),
  `:419`/`:430` (audit + notification), `:762` (broadcast, post-IO); `src/lib/realtime-events.ts:98-101`
  (single auto-commit INSERT in `recordServerEvent`); grep confirms ZERO `db.transaction` in
  `src/app/api/chat/`.
- **Guardrail (chat write route + realtime-events):** `recordServerEvent` is one auto-commit INSERT
  by design — the transactionality gap is owned by the route, not by `realtime-events`. The fix
  wraps the four durable writes (messages + activity + notification + the chat.message outbox
  INSERT) in ONE `db.transaction(() => {...})` begun with **`BEGIN IMMEDIATE`** (better-sqlite3's
  `db.transaction` is DEFERRED by default; per sqlite.org/lang_transaction.html §2.1 `busy_timeout`
  is not reliably honored on DEFERRED→write upgrade), emits `eventBus.broadcast` AFTER commit, and
  moves the outbox row INSIDE the tx so the SSE poller can always replay it. Broadcast the
  originating message BEFORE generating coordinator replies (fixes the ordering bug). Do NOT build
  a generalized `recordServerEventInTx`/`send_event_on_commit` abstraction — `db.transaction` is
  already idiomatic (31× across runner/admin-config/scheduler).

### ✅ RESOLVED — resync sentinel + jittered retry (P1-4, P2-3)
The replay path had no retention-gap detection and the `retry:` frame was a fixed 5000ms shared by
all clients (reconnect-storm amplifier). **Both fixed.**
- **Evidence (resync):** `src/app/api/events/route.ts:52,115-122` (if `requestedLastEventId > 0 &&
  lastSentId < minId`, emit ONE id-less `resync.required` control frame and jump cursor to
  `minId-1`; fires at most once per connection via `resyncSentinelEmitted`); `minRealtimeEventId`
  in `src/lib/realtime-events.ts:158-167`.
- **Evidence (jitter):** `src/lib/realtime-events.ts:184-186` (`formatSseRetryFrame(base=SSE_RETRY_MS,
  jitter=2000)` → `retry: ${base + Math.floor(Math.random()*jitter)}`); emitted on every
  (re)connect at `src/app/api/events/route.ts:130` and `src/app/api/v1/runs/stream/route.ts:99`.
- **Guardrail (SSE routes + realtime-events):** the resync sentinel is id-less and MUST NOT
  advance the durable cursor (`formatSseFrame` omits `id:` for non-numeric ids —
  `realtime-events.ts:177-179`). The `retry:` frame MUST stay jittered per-connection; do not
  revert to a fixed value.

### ✅ RESOLVED — graceful instance drain (P2-4)
SIGTERM used to hard-kill every SSE viewer (only PTYs were disposed; the HTTP server was never
`.close()`'d). **Fixed** with a bounded drain.
- **Evidence:** `scripts/mc-server.cjs:42-57` (`performGracefulDrain`: `server.close()` to stop
  new connections → bounded `setTimeout(drainMs)` → PTY dispose + exit; the bound fires regardless
  of whether `server.close` ever calls back); wired to SIGTERM at `:57,65`.
- **Guardrail (mc-server):** the drain bound is load-bearing — a hanging `close()` cannot stall
  shutdown. Do not remove the bounded timeout or revert to dispose-only. The durable
  `realtime_events` outbox + 1s poll + `Last-Event-ID` replay remain the complete safety net for
  any connection dropped mid-drain; do not add a draining-flag/resync-broadcast subsystem
  (over-engineering).

---

## Layering leaks (corrected in the realignment)

Real violations of the declared layering; both fixed.

- **❌→✅ core→platform leak:** `src/opzava/core/artifacts/contracts.ts` imported `isSecretReference`
  from `platform/admin-config/contracts` — an upward domain→infrastructure edge violating the
  Dependency Rule. Fixed by relocating the pure `SecretReference` model to `core/secrets` (see the
  realignment ARD).
- **❌→✅ cross-module internal import:** `src/opzava/modules/team/agent-activity.ts` imported
  `createArtifactRepository` from `content`'s internals. Fixed by routing through the `content`
  public barrel (`@/opzava/modules/content`).

## Folder-contract drift (corrected in P1)

`docs/architecture/folder-structure.md` previously mandated folders that do not exist
(`platform/db/`, `platform/logging/`, `platform/module-registry/`; module-level `application/`,
`data/`, `ui/`, `testing/`; and `workflows/` plural), omitted `platform/observability/`, and named a
non-existent `outreach` module as an initial feature module. Corrected to match the real tree under
code-is-truth.

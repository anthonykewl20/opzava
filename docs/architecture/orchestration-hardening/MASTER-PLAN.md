# Orchestration Hardening — Master Remediation Plan

> **status:** Approved · **date:** 2026-06-25 · **supersedes:** `docs/architecture/system-map/91-remediation-plan.md`
> **companion ARDs:** [0011 — Single-Orchestrator Execution Model](../../ard/0011-single-orchestrator-execution-model.md) · [0012 — Device Authorization](../../ard/0012-device-authorization.md)
> **authority:** This is the single source of truth for orchestration, MCP, security, and device-auth work. Where it conflicts with older docs, this wins. *Code-wins-over-docs* governs every citation below; line numbers were verified against HEAD on 2026-06-25.

---

## 1. Architecture verdict (Executive Summary)

Opzava is **functionally coherent as a single-replica, single-writer deployment** but **structurally unsound as the "horizontally-scalable AI operations control plane" `CLAUDE.md` mandates.** Three structural truths drive the whole plan:

1. **There is no orchestrator — there are three unlinked execution subsystems in one SQLite file.**
   - **Engine A** — inherited `src/lib`: the `tasks` table + `task-dispatch.ts` scheduler tick (operator console), dispatched via OpenClaw gateway or direct Claude/OpenAI API.
   - **Engine B** — `src/opzava/platform/runner`: a genuinely-excellent durable job/attempt/dead-letter state machine, but **campaign-send only** — one job kind, one enqueue site, drained **synchronously inside the HTTP request** (`run-approved-campaign.ts`), background daemon never booted in prod.
   - **Engine C** — the 11-step content workflow (`POST /api/ops/runs` → `runAndRecordContentWorkflow`): runs **synchronously inline through MOCK providers** (`createMockContentWorkflowProviderAdapters`); real adapter classes exist but **no production route constructs them**. Demo-ware wired into the ops dashboard.
   - They share **no tables, no foreign keys, no imports at runtime, and no lifecycle reconciliation.** `opzava_campaigns` has no `task_id` FK. The moment a feature links an Engine A task to an Engine B job (the natural product direction), you get silently stuck tasks with no join key to detect it.

2. **The horizontal-scale mandate is structurally impossible over SQLite + an uncoordinated in-process scheduler.** `scheduler.ts` runs `dispatchAssignedTasks` on a bare `setInterval` with **no leader election** (`scheduler.ts:498`). At 2 replicas (trivial via Dokploy/docker-compose), both schedulers claim the same tasks — the `dispatch_attempts` TOCTOU becomes a **guaranteed** double-dispatch every tick, not a low-probability race.

3. **The quality gate ("Aegis" — the user called it "Atlas", which is only a UX-mockup name) is enforced on both PATCH-to-`done` paths but has real holes:** a `parseReviewVerdict` substring match (`task-dispatch.ts:968`) that **default-allows** on malformed/injected model output, no lease on `quality_review` (a crashed/hung model call strands the task forever — invisible to every worker), and a shared non-atomic `dispatch_attempts` counter collapsed across three state machines.

**What is solid (do not regress):** the atomic guarded-UPDATE claim pattern (mirrored across all claim sites), the `TaskDispatchDeps` DI seam (two real adapters), the runner's job/attempt/dead-letter state machine, `SecretReference` (cleartext never crosses into payloads/prompts/logs), the unified cost/audit read surfaces, constant-time secret compares, and `92-stale-findings.md` (more honest than some of the code).

**The three load-bearing moves:** (1) make the write spine **transactional + lease-governed**; (2) add a **principal-binding authz seam**; (3) **decide single-active-writer-vs-Postgres explicitly** and fuse device-auth into the same `getUserFromRequest` cascade. This plan executes all three.

---

## 2. Resolved Decisions (FINAL — do not re-litigate)

| # | Decision | Resolution |
|---|----------|------------|
| D-1 | **Transport (device-auth)** | stdio-only now (MCP 2025-06-18: *stdio servers SHOULD NOT follow the auth spec*). HTTP-MCP (RFC 9728+8414+7591+PKCE+8707) deferred as **additive** — token endpoint is grant-type-agnostic from day one, `device_tokens.audience` column reserved now. |
| D-2 | **Local token store** | `0o600` plaintext local file + **OPTIONAL** `OPZAVA_TOKEN_ENC_KEY` envelope encryption (fallback `AUTH_SECRET`). **NO passphrase** (headless stdio shim has no TTY). **NO** `keytar`/`libsecret` (breaks Docker parity + standalone binary). Explicit plaintext opt-in is `OPZAVA_INSECURE_STORAGE` (default unset). |
| D-3 | **Access TTL** | **8h** access / **30d** rotating refresh (RFC 6749 §10.4 reuse detection). 60s server-skew grace on access; **zero** grace on the 30d refresh cap. Optional `MC_DEVICE_INSTANT_REVOKE=1` denylist kills the 8h revoked-but-unexpired window. |
| D-4 | **Horizontal scale** | **SINGLE-ACTIVE-WRITER** now via a leader-election/advisory-lock seam. Postgres (ARD 0006) tracked as future state, **NOT P0**. Reframe `CLAUDE.md`/`deployment.md` honestly. Correct invariant: **lock TTL < lease TTL** (lock 90s / lease 10min). |
| D-5 | **Fuse point** | Principal-binding (B1a) + `resolveDeviceToken` (B1b) land in the **same** `getUserFromRequest` cascade; device tokens are principal-bound + scope-derived from day one. Split into B1a (no device dep) + B1b (depends D2) to kill the circular dep. |
| D-6 | **Orchestrator unification** | Make `src/opzava/platform/runner` the canonical path for all 3 engines: generalize `createJobKindExecutor` (`job-kind-executor.ts:9`) to register `task-dispatch` + `content-step` alongside `CAMPAIGN_SEND_JOB_KIND`; `task-dispatch.ts` enqueues instead of executing inline; add `task_id` FK + read-only stuck-task detector. Multi-phase **Track C, gated behind A/B**, not P0. |

---

## 3. Tracks & Tasks (35 tasks)

Every task is independently shippable as one tiny Conventional Commit (no `Co-Authored-By`/AI trailers) with a clean rollback. `depends_on` is the dependency DAG; the linearized order in §4 is a valid topological sort.

### Track A — Orchestration correctness, write-spine safety & the ARMED lease  `[P0]`

**Goal:** transactional write spine, a `claimed_at` lease **armed at all three claim sites** (not just declared), task-creation idempotency, three atomic-guarded counters (split from one shared column), idempotent cost attribution, and reclamation of the `quality_review` dead-zone.

#### A0 — Durability decision + mandatory default-on `wal_checkpoint`  `[P0]`  · depends_on: (none)
- **Objective:** Move the synchronous-level decision to the FRONT of the track (A2–A4 build against a known durability contract). Default: keep `synchronous=NORMAL` (`db.ts:56`) + a MANDATORY default-on `wal_checkpoint` task. Verified: `src/lib` has ZERO `wal_checkpoint` statements today and `auto_backup` is `defaultEnabled:false`, so the checkpoint is mandatory, not optional.
- **Files:** `src/lib/db.ts:56` (PRAGMA synchronous=NORMAL — decision target), `:55` (journal_mode=WAL), `:61` (busy_timeout=5000); `src/lib/scheduler.ts` (add a `wal_checkpoint` SCHEDULED_TASK alongside `auto_cleanup`); `docs/ard/0011-…md` (record decision + rationale).
- **Acceptance:** (1) ARD 0011 records the decision (keep NORMAL+wal_checkpoint, OR upgrade to FULL) with rationale — default if unconfirmed = keep NORMAL; (2) new scheduler task `wal_checkpoint` is `defaultEnabled:true`: `PRAGMA wal_checkpoint(PASSIVE)` every 5–15min + `PRAGMA wal_checkpoint(TRUNCATE)` in the off-peak window; (3) a forced TRUNCATE reduces the `-wal` file near-zero; a 24h soak with backup off shows WAL stays bounded; (4) the G1 leader-heartbeat write is counted in the checkpoint cadence; (5) `pnpm test:all` green.
- **Test:** Write workload → `wal_checkpoint(TRUNCATE)` → assert `-wal` near-zero. Crash test: write+fsync a tx, `kill -9`, reopen, assert the row present at the chosen synchronous level.
- **Risk:** FULL halves write throughput; benchmark before committing the FULL upgrade (decision is front-loaded; FULL is benchmark-gated). TRUNCATE briefly blocks writers — keep off-peak.
- **Rollback:** Restore `synchronous=NORMAL`-only; remove the `wal_checkpoint` task.

#### A1 — Migration `055`: split `dispatch_attempts` into 3 counters + `claimed_at` + `client_request_id`  `[P0]`  · depends_on: A0
- **Objective:** Append migration id `055_task_counters_lease_idempotency` (054 ends at `migrations.ts:1480`; array closes at `:1499`). Add `review_attempts`, repurposed `dispatch_attempts`, `aegis_error_count`, `aegis_error_not_before`, `claimed_at`, `client_request_id` + a partial-unique index. Idempotent (PRAGMA guard mirroring 054) and multi-replica-safe.
- **Files:** `src/lib/migrations.ts` (append before the closing `]` at `:1499`; PRAGMA table_info guard + ALTER ADD COLUMN mirroring 054); `src/lib/schema.sql` (document new columns); `src/app/api/tasks/route.ts` (createTask sets `client_request_id`).
- **Acceptance:** (1) id `055_task_counters_lease_idempotency` globally unique vs every id in `migrations[]` AND `extraMigrations[]` (governance test); (2) partial unique index `idx_tasks_client_request_id ON tasks(workspace_id, client_request_id) WHERE client_request_id IS NOT NULL` (mirror `:1493`); (3) `claimed_at`, `aegis_error_not_before`, counters added (nullable/default); (4) two replicas cold-starting against fresh `.data` → exactly one applies 055 (PK dedupes), the PRAGMA guard makes the second a no-op; (5) `test/migration-ids-unique.test.mjs` (node:test) loads both arrays and asserts no id collisions — guards A1/B2/A4/D1/C3 collectively; (6) `pnpm test:all` green on fresh `.data/` and `.data/` with 054 applied.
- **Test:** Vitest: apply 055, assert columns exist; the partial index rejects a duplicate `(workspace_id, client_request_id)` and accepts NULL duplicates; re-run → no error.
- **Risk:** `ALTER ADD COLUMN` is O(n) under WAL; deploy off-peak. PRAGMA guard prevents double-add.
- **Rollback:** `DELETE FROM schema_migrations WHERE id='055_…'`; columns are nullable so legacy `?? 0` reads keep working.

#### A2 — Transactional write spine + FULL idempotency idiom (SELECT-first-then-return-existing)  `[P0]`  · depends_on: A1
- **Objective:** Wrap capture + claim + Aegis revert + side effects in ONE `db.transaction`; broadcast once AFTER commit. The idempotency idiom is the FULL chat-route pattern (SELECT-first, return existing with `idempotent:true` on `SQLITE_CONSTRAINT_UNIQUE`), NOT just the index — prevents a 500 on concurrent duplicate captures.
- **Files:** `src/app/api/tasks/route.ts` (fold logActivity/subscriptions/notifications/broadcast into ONE `db.transaction` around `createTaskTx`); `src/lib/task-dispatch.ts:1133` (Aegis revert — unguarded UPDATE → guarded conditional `WHERE status='quality_review'` inside the same tx); `src/app/api/chat/messages/route.ts:478-501` (the runtime idempotency precedent).
- **Acceptance:** (1) POST capture: counter+INSERT+logActivity+subscription+notification in ONE tx; broadcast once after commit; (2) Aegis revert (`:1134`) is a guarded conditional UPDATE inside the same tx as the error-record write; (3) duplicate `client_request_id` → guarded INSERT → on `SQLITE_CONSTRAINT_UNIQUE` SELECT the existing task and return it with `idempotent:true` (mirror `chat/messages/route.ts:486-500`), never a 500; (4) no autocommit statement remains between a status-flip UPDATE and its dependent writes; (5) unit test: throwing logActivity → 500 AND no task row (all-or-nothing).
- **Test:** Vitest: stub logActivity to throw → 500 + no task row; exactly one broadcast per capture; capture twice with same `client_request_id` → second returns first task with `idempotent:true`.
- **Risk:** `BEGIN IMMEDIATE` across the notification INSERT lengthens lock hold; keep the tx body tight (no external HTTP inside — broadcasts/gateway stay outside). `busy_timeout=5000` absorbs contention.
- **Rollback:** Revert the tx-wrapping; autocommit restored. A1 columns remain forward-compatible.

#### A3 — Atomic guarded counters + reset-on-phase-transition + Aegis-error backoff WITH the status-query audit for `aegis_unavailable`  `[P0]`  · depends_on: A1
- **Objective:** Replace the three read-modify-write sites (verified `:1077`/`:1542`/`:1198`) with atomic conditional `UPDATE … WHERE id=? AND status=?` branching on `.changes`; route Aegis model-errors to a bounded `aegis_unavailable` terminal. **Critical:** enumerate EVERY status-discriminating query and classify `aegis_unavailable` for each, or the new state is a NEW dead-zone.
- **Files:** `task-dispatch.ts:1077-1097` (Aegis-reject → `review_attempts`), `:1541-1562` (dispatch-fail → `dispatch_attempts`), `:1133-1143` (Aegis error → `aegis_error_count` + `aegis_error_not_before` + `aegis_unavailable`), `:1198` (stale-requeue counter).
- **Acceptance:** (1) all three sites use `UPDATE tasks SET <counter>=<counter>+1 WHERE id=? AND status=?` branching on `.changes===0` (extend the pattern at `:1288`/`:1005`); (2) Aegis-reject→`review_attempts` cap 3→failed; dispatch-fail→`dispatch_attempts` cap 5→failed; Aegis-error→`aegis_error_count`+backoff→`aegis_unavailable`; (3) STATUS-QUERY AUDIT: enumerate every `status =`/`status ===` query across `src/` and classify `aegis_unavailable` (at minimum `requeueStaleTasks` (A5) + `runAegisReviews` SELECT `aegis_unavailable` rows past backoff → flip back to `review`; `isCompletionStatus` excludes it; UI filter includes it); (4) on `assigned→in_progress` the dispatch budget resets to 0; on success all counters reset; (5) concurrency test: two simultaneous increments → exactly +2; (6) `pnpm test:all` green.
- **Test:** Vitest concurrency: two async increments → final === initial+2. Unit: `review_attempts=3` reject→failed. Audit test: requeue/review reclaim `aegis_unavailable` past backoff.
- **Risk:** `aegis_unavailable` is the #1 silent-dead-zone risk WITHOUT the audit — it recreates the theme-3 dead-zone. Document the split + reclamation in the task-lifecycle doc + ops-cheatsheet.
- **Rollback:** Revert to the single shared `dispatch_attempts`; new columns default NULL/0; flip `aegis_unavailable` rows back to `review` manually.

#### A4 — Migration `057`: `token_usage.idempotency_key` + `workspace_id`; `recordUsage` INSERT OR IGNORE  `[P0]`  · depends_on: A2
- **Objective:** Verified: `token_usage` (`migrations.ts:492`) has NO `idempotency_key` AND NO `workspace_id` column. Migration 057 adds both + a partial unique index; `recordUsage` uses `INSERT OR IGNORE` keyed on `(workspace_id, task_id, session_id, model, idempotency_key)`.
- **Files:** `src/lib/migrations.ts` (append `057_token_usage_idempotency_workspace` — PRAGMA guard, add columns, partial unique index `idx_token_usage_idempotency ON token_usage(workspace_id, task_id, session_id, model, idempotency_key) WHERE idempotency_key IS NOT NULL`); `src/lib/task-dispatch.ts:614-638` (recordUsage autocommit INSERT, swallows at `:637` → `INSERT OR IGNORE` + warn-log); `:693`/`:823`/`:875` (call sites — pass a deterministic idempotency_key).
- **Acceptance:** (1) 057 adds both columns; id globally unique; (2) recordUsage writes idempotency_key+workspace_id and uses `INSERT OR IGNORE` (exactly one row per tuple); (3) the catch (`:637`) logs at warn with `{task_id, model, session_id}` — no silent swallow; (4) an Aegis-rejected-then-re-dispatched task does not double-count; (5) test: recordUsage twice with same key → one row; injected throw → warn log; (6) `pnpm test:all` green. **Note:** `workspace_id` exists since migration `023_workspace_isolation_phase3` (`migrations.ts:655`) — 057 only adds the index + idempotency_key.
- **Test:** Vitest: recordUsage twice with same key → one row; injected throw → warn log.
- **Risk:** Cost attribution is the product's reason-to-exist. The idempotency_key must be deterministic (`task_id+session_id+model+per-dispatch nonce`) so a retry produces the SAME key.
- **Rollback:** Revert recordUsage to autocommit + silent catch; columns nullable and ignored.

#### A4b — Migration `060`: `token_usage` cost backfill  `[P0]`  · depends_on: A4
- **Objective:** `recordUsage` writes `cost = 0` hardcoded today (`task-dispatch.ts:625`, the 6th positional INSERT arg); `unified-cost-reader` sums a never-populated `cost_usd`. 060 backfills the deterministic cost into existing rows and the write path populates it going forward (resolved in A4's INSERT OR IGNORE).
- **Files:** `src/lib/migrations.ts` (append `060_token_usage_cost_backfill`); `src/lib/task-dispatch.ts:625` (populate cost from `data.usage` / model pricing).
- **Acceptance:** (1) 060 backfills cost for existing rows from a deterministic source; (2) recordUsage populates cost; (3) `unified-cost-reader` reflects non-zero cost; (4) test: a dispatched task produces a token_usage row with cost>0; (5) `pnpm test:all` green.
- **Test:** Vitest: dispatch → token_usage row has cost derived from pricing.
- **Risk:** Pricing must come from `model-config.ts` (no hardcoded literals — repo rule).
- **Rollback:** Revert the cost populate; backfill is additive.

#### A5 — ARM THE LEASE: stamp `claimed_at` at ALL THREE claim sites + extend `requeueStaleTasks` to reclaim `quality_review` + startup sweep  `[P0]`  · depends_on: A1, A3
- **Objective:** v1 declared the lease but never armed it. v2 stamps `claimed_at` at **all three** claim sites (dispatchAssignedTasks `:1288`, Aegis `:1005`, AND the polling-queue claim `tasks/queue/route.ts:118` — the third site v1 missed); extends `requeueStaleTasks` to reclaim `quality_review` past lease; adds a startup sweep.
- **Files:** `task-dispatch.ts:1288` + `:1005` (add `claimed_at=clock.now()`); `src/app/api/tasks/queue/route.ts:118` (add `claimed_at` — the third site); `task-dispatch.ts:1171-1175` (change `WHERE t.status='in_progress'` → `status IN ('in_progress','quality_review') AND claimed_at < now - lease`); `src/lib/scheduler.ts` startup (sweep: `UPDATE tasks SET status='review', claimed_at=NULL WHERE status='quality_review' AND claimed_at < now - lease`).
- **Acceptance:** (1) all THREE claim UPDATEs set `claimed_at` inside their guarded tx; (2) after a claim, `SELECT claimed_at` is non-null recent (all three sites); (3) `requeueStaleTasks` reclaims BOTH `in_progress` AND `quality_review` past lease (decoupled from flaky `agents.status`); (4) startup sweep flips `quality_review` past lease back to `review` on writer boot; (5) the `quality_review` dead-zone is CLOSED; (6) `listStuckTasks` (C3) returns a `quality_review` row past lease — POPULATED, not empty; (7) `pnpm test:all` green.
- **Test:** Vitest: claim at all three sites → `claimed_at` non-null; seed `quality_review claimed_at=now-20min` → sweep/requeue flips to `review`; within lease → excluded.
- **Risk:** The polling-queue claim (`:118`) is the easily-missed third site. Lease TTL > lock TTL (G1 invariant).
- **Rollback:** Remove `claimed_at=clock.now()`; revert `requeueStaleTasks` to `in_progress`-only; remove the sweep. Dead-zone returns (detected-only by C3).

### Track B — Security, principal-binding authz & SSRF  `[P0]`

**Goal:** Bind every mutating endpoint to the authenticated principal, add the quality-review `source` discriminator + structural VERDICT match, bulk-PUT per-task ownership, admin-gate `/api/connect`, fence `soul_content`, close hygiene holes, bind lateral-movement routes, and add runtime-DNS SSRF protection on webhooks.

#### B1a — Principal-binding authz (no device dep): `requireAgentSelfAccess` on PUT agents/[id], /soul, bulk PUT tasks, sessions/control, exec-approvals  `[P0]`  · depends_on: (none)
- **Objective:** The fusePoint's principal-binding half, split out so it has NO dependency on the device-auth module (kills v1's latent circular dep). Wire `requireAgentSelfAccess`/`requireAgentTaskAccess` (`workspace-scope.ts:74`/`:109`) on the agent-mutating + bulk-task + lateral-movement routes.
- **Files:** `src/app/api/agents/[id]/route.ts:62` (PUT — add `requireAgentSelfAccess`); `src/app/api/agents/[id]/soul/route.ts:105` (PUT soul); `src/app/api/tasks/route.ts` (bulk PUT — `requireAgentTaskAccess` per row); `src/app/api/sessions/[id]/control/route.ts:15` (operator, no agent binding — bind the target session's agent); `src/app/api/exec-approvals/route.ts:25` (bind the approval's agent); `src/lib/enforcement/workspace-scope.ts:74` (`requireAgentSelfAccess` — reuse), `:109` (`requireAgentTaskAccess` — reuse).
- **Acceptance:** (1) PUT `/api/agents/[id]` and `/soul` call `requireAgentSelfAccess` and return 403 when an operator-scoped principal targets a different agent (admins exempt via `:76`); (2) bulk PUT iterates and calls `requireAgentTaskAccess` per row; (3) `sessions/[id]/control` and `exec-approvals` bind the target session/approval to the caller's `agent_id`; (4) test: operator A PUT `/api/agents/B/soul` → 403; `/api/agents/A/soul` → 200; bulk PUT mix → A:updated, B:forbidden; (5) `pnpm test:all` green.
- **Test:** Integration: cross-agent PUT → 403; same-agent → 200; bulk PUT two tasks → A updated, B forbidden; sessions/control kill on B's session with A key → 403.
- **Risk:** Tightening could break operator scripts assuming cross-agent access; document the migration.
- **Rollback:** Remove the `requireAgentSelfAccess`/`requireAgentTaskAccess` calls.

#### B1b — FUSED `resolveDeviceToken` cascade branch  `[P0]`  · depends_on: D2
- **Objective:** Insert `resolveDeviceToken(bearer)` between the `agent_api_keys` block (ends ~`auth.ts:554`) and the plugin hook (`:557`) in ONE cascade change. Device tokens and agent-scoped keys share one authz path from day one. Depends on D2 (which creates the function).
- **Files:** `src/lib/auth.ts:435` (`getUserFromRequest`), insertion between `agent_api_keys` block (`:554`) and plugin hook (`:557`); `src/opzava/core/auth/token-service.ts` (`resolveDeviceToken` — created in D2; B1b wires the call site only).
- **Acceptance:** (1) `resolveDeviceToken` invoked exactly once, AFTER `agent_api_keys` and BEFORE the plugin hook; on miss returns null and the cascade falls through; (2) returns a `User` carrying `agent_id`/`agent_name`/`workspace_id`/`role=deriveRoleFromScopes(scopes)` — device tokens indistinguishable from agent-scoped keys to the authz layer; (3) `architecture.test.ts`: exactly one opzava file exports `resolveDeviceToken`; (4) precedence test: agent-scoped key resolves before device token before plugin hook; (5) `pnpm test:all` green.
- **Test:** Vitest: device Bearer resolves to the bound principal; unknown/malformed → null; precedence: agent key > device token > plugin.
- **Risk:** Moving auth precedence changes which resolver wins; the device branch MUST sit AFTER `agent_api_keys` and BEFORE the plugin hook — covered by the precedence test.
- **Rollback:** Remove the one-line call + the B1a calls; the device-auth module remains unreached until re-wired.

#### B2 — Migration `056`: `quality_reviews.source` discriminator WITH in-migration backfill + structural VERDICT match  `[P0]`  · depends_on: B1a
- **Objective:** Add `quality_reviews.source TEXT NOT NULL DEFAULT 'human'` (056); the backfill `UPDATE … SET source='model' WHERE reviewer='aegis'` runs INSIDE the migration `up()` (v1 had it only in a risk note — an engineer would ship without it, misclassifying every Aegis verdict as 'human'). Rewrite `parseReviewVerdict` to a structural anchored regex. **Code-wins correction:** the `reviewer` field is ALREADY server-resolved (`quality-review/route.ts:91-94`) — drop v1's stale "caller-controlled reviewer" framing; the residual is the `source` discriminator + the injection-vulnerable parser.
- **Files:** `src/lib/migrations.ts` (append `056_quality_reviews_source` — ADD COLUMN + backfill UPDATE inside the SAME `up()`); `src/app/api/tasks/route.ts:53-61` (`hasAegisApproval` keys on `reviewer='aegis'` at `:56` → `WHERE source='model' AND status='approved'`); `src/app/api/tasks/[id]/route.ts:32-44` (mirror gate); `src/app/api/quality-review/route.ts:119-122` (INSERT — add `source='human'`); `src/lib/task-dispatch.ts:968-973` (`parseReviewVerdict` — substring `upper.includes('VERDICT: APPROVED')` at `:970` is the injection vector).
- **Acceptance:** (1) 056 adds `source` AND runs the backfill INSIDE `up()`; (2) `hasAegisApproval` gates on `WHERE source='model' AND status='approved'`; (3) `parseReviewVerdict` requires `/^VERDICT:\s*(APPROVED|REJECTED)/i` (structural); ANY malformed/missing verdict defaults to REJECTED (default-DENY); (4) no existing `reviewer='aegis'` row is left with `source='human'` after migration; (5) test: a model reply with embedded 'VERDICT: APPROVED' mid-text → REJECTED; (6) the Aegis insert path writes `source='model'`; (7) `pnpm test:all` green.
- **Test:** Vitest `parseReviewVerdict` table: `'VERDICT: APPROVED\nNOTES: ok'`→approved; `'blah VERDICT: APPROVED blah'`→rejected; `''`→rejected. `hasAegisApproval`: human-source approved→false; model-source approved→true. Migration: seed `reviewer='aegis'`, run 056, assert `source='model'`.
- **Risk:** The backfill is load-bearing — without it the migration retroactively breaks `hasAegisApproval`.
- **Rollback:** Revert `hasAegisApproval` to `reviewer='aegis'`; revert parser to substring. The `source` column remains DEFAULT 'human' and is ignored.

#### B3 — `/api/connect` admin-gate + name allowlist + collision check + 0o600/hermes/registerAuthResolver hygiene  `[P0]`  · depends_on: B1a
- **Objective:** `/api/connect` auto-create must be admin-gated with a name-format allowlist + collision check (`connect/route.ts:15` is `requireRole('operator')`; `validation.ts:251` `agent_name` has NO allowlist). Hygiene: profile `0o600` (`mc-cli.cjs:129` saveProfile no mode → 0644), hermes reject-not-fallback (`hermes/route.ts:268`), registerAuthResolver scope gate (`auth.ts:36-38`).
- **Files:** `src/app/api/connect/route.ts:15` (`operator`→`admin` for create), `:27-32` (unvalidated agent_name auto-INSERT); `src/lib/validation.ts:251` (connectSchema `agent_name` — add `^[a-z0-9][a-z0-9-]{1,62}$` + collision→409); `scripts/mc-cli.cjs:129` (saveProfile `{mode:0o600}`; loadProfile chmods existing); `scripts/mc-tui.cjs` (mirror); `src/app/api/hermes/route.ts:268` (bin fallback→reject 500 when `!existsSync`), `:261` (subcommand allowlist + audit log); `src/lib/auth.ts:36-38` (registerAuthResolver — require non-admin role unless explicit admin scope).
- **Acceptance:** (1) `/api/connect` auto-create requires admin; `agent_name` matches the allowlist and does not collide (409); (2) saveProfile passes `{mode:0o600}`; loadProfile chmods existing to 0o600 once; (3) hermes bin rejects when `!existsSync(hermesBin)` (500); subcommand allowlist `{run,start,stop,status}`; `logAuditEvent` on every invocation; (4) registerAuthResolver's hook cannot mint admin without an explicit admin scope; (5) test: profile mode 0o600 (fs.stat); hermes missing venv → 500; `/api/connect` invalid name → 400; duplicate → 409; (6) `pnpm test:all` green.
- **Test:** node:test: write profile, assert `stat.mode & 0o777 === 0o600`; hermes `existsSync` false → 500; `/api/connect '../../etc'` → 400; existing name as non-admin → 403/409; registerAuthResolver returning `role:'admin'` without admin scope → rejected.
- **Risk:** Tightening `/api/connect` to admin could break CLI auto-registration; document the migration. Hard-rejecting hermes breaks setups relying on `parts[0]`; the audit log makes breakage visible.
- **Rollback:** Remove the admin gate + allowlist + collision check; restore `parts[0]` fallback; remove the mode arg + scope contract.

#### B4 — SSRF protection on webhooks (runtime DNS check, not static hostname)  `[P0]`  · depends_on: (none)
- **Objective:** Verified `isBlockedWebhookUrl` (`webhooks/route.ts:10-34`) blocks a static hostname set + private IPv4 but NOT IPv4-mapped IPv6 (`::ffff:127.0.0.1`), decimal/octal/hex IP encodings, IPv6 ULA, or DNS rebinding. The gateway path (`config.gatewayHost`, operator-configured) is NOT an SSRF vector — scope this to webhooks/outbound-delivery only.
- **Files:** `src/app/api/webhooks/route.ts:10-34` (static match → runtime DNS resolution + private/loopback/link-local/metadata IP reject + PIN resolved IP for the fetch); `src/lib/validation.ts` (webhook URL validation).
- **Acceptance:** (1) webhook delivery resolves the hostname at DELIVERY time, rejects if it resolves to private/loopback/link-local/metadata IP (`169.254.169.254`, `fc00::/7`, `::ffff:127.0.0.1`); (2) IP-literal encodings (decimal/octal/hex) normalized and blocked; (3) the resolved IP is PINNED for the fetch (defeats DNS rebinding); (4) the gateway path explicitly NOT in scope; (5) test: URL resolving to `127.0.0.1`/`169.254.169.254`/`::ffff:127.0.0.1` → rejected; DNS-rebinding host → rejected; (6) `pnpm test:all` green.
- **Test:** node:test: stub `dns.lookup` → 127.0.0.1 → rejected; → 169.254.169.254 → rejected; pin test: second lookup returns private → fetch uses the pinned public IP or is rejected.
- **Risk:** Runtime DNS adds latency to delivery; do it in the delivery worker, not validation. Document an allowlist escape hatch if over-blocking legitimate internal webhooks.
- **Rollback:** Revert to the static `isBlockedWebhookUrl`; remove runtime DNS + IP pinning.

### Track C — Deep-module refactors (gated behind A/B)  `[P1]`

**Goal:** Extract Aegis as a deep module (`core/reviews`), split the `task-dispatch.ts` god-module so dispatch enqueues and the runner executes, make the runner the canonical path for all three engines with the `task_id` FK, and dedupe the client adapters into a shared module. **Battle-tested by [ARD 0014](../../../ard/0014-workflow-engine.md):** a teardown of Haystack / Sim / CrewAI / Dify found all four converge on the same graph-engine shape. The deepening builds `src/opzava/core/workflow-engine/` — a pure `core/` library of 5 deep modules (`StepContract` + `Engine` + `RunContext` + `ReviewStrategy` + `EngineLayer`) that BOTH engines express graphs against (ARD 0007 holds; not a merge). C1/C2/C3 below now have production-tested shapes: Aegis → a `ReviewStrategy` adapter (CrewAI `LLMGuardrail` + Haystack Strategy/Decision); the god-module split → Steps + Layers around the `Engine` (Dify graphon + Sim DAGBuilder/HandlerRegistry); the runner → the executor the Engine invokes per-Step. See ARD 0014 + CONTEXT.md (Step / WorkflowGraph / Edge / RunContext / ReviewStrategy / ModelInvocation).

#### C-WF — Build `src/opzava/core/workflow-engine/` (StepContract + Engine + RunContext + ReviewStrategy + EngineLayer interfaces + tests)  `[P1]`  · depends_on: (none)
- **Objective:** The foundation for C1/C2/C3 (ARD 0014). A pure `core/` library — framework-independent, layering-guarded — of 5 deep modules:
  - `contracts.ts` — `StepContract { kind, inputs: StepSocket[], outputs: StepSocket[], run(ctx) }`; `NodeRunResult { status, outputs, edgeSourceHandle? }`; `EdgeHandle`; `EdgeState (unknown|taken|skipped)`. Zod-validated; connections validated at wiring-time (Haystack 2.0 lesson — reject incompatible edges BEFORE any run).
  - `engine.ts` — the edge-state DAG scheduler: a Step is ready iff ≥1 in-edge `taken` AND 0 in-edge `unknown`; on success mark out-edges `taken` + enqueue newly-ready; un-chosen branches `skipped`. Async-generator ready-set. One mechanism = parallelism + branching + skip-propagation (Dify graphon `GraphStateManager`).
  - `run-context.ts` — `RunContext`: `Map<stepId, Map<varName, Segment>>` + `{{#stepId.varName#}}` template resolver + reserved scopes (`sys`, `env`). The inter-step data flow.
  - `ReviewStrategy` + `EngineLayer` interfaces land here (the quality seam + the cross-cutting hook array). Adapters come with C1 (Aegis → ReviewStrategy) + C3 (Persistence/Quota/Audit layers).
  - `MODULE.md` — invariants (pure core/; edge-state is the sole scheduling mechanism; StepContract is the test surface).
- **Files:** `src/opzava/core/workflow-engine/{contracts,engine,run-context,MODULE}.ts`; `workflow-engine.test.ts`; `src/opzava/architecture.test.ts` (admit core/workflow-engine to the layering guard).
- **Acceptance:** (1) Engine runs a 3-step linear graph + a parallel branch + a conditional (via `edgeSourceHandle`) + skip-propagation; (2) RunContext set/get/resolveTemplate + reserved scopes; (3) pure core/ (architecture test); (4) every module testable through its interface, not its internals; (5) `pnpm test:all` green.
- **Test:** `workflow-engine.test.ts` — graph execution (linear, parallel, conditional, skip), RunContext (set/get/resolve/{{#...#}}/reserved-scope), edge-state transitions.
- **Risk:** Keep the Engine PRIMITIVE — no provider/DB/persistence IN it (those are Layers + the runner). The Engine knows nothing about WHAT a Step does (Sim HandlerRegistry discipline).
- **Rollback:** Delete `core/workflow-engine/` — additive, nothing depends on it yet.
- **Cross-repo evidence (ARD 0014):** Haystack (typed-contract-at-wiring + Agent-as-Tool); Sim (SerializedWorkflow + DAGBuilder/Engine/HandlerRegistry + error-as-edge); CrewAI (LLMGuardrail + manager-agent + Flow); Dify/graphon (edge-state + VariablePool + ModelRuntime Protocol + Layering — Dify extracted its engine, strongest signal). Do NOT copy: worker-threads/Celery/Redis/plugin-daemon (Node single-threaded); vector DBs (SQLite-native); generic crash-recovery (HITL-pause + lease-retry suffices).

#### C0 — Extract minimal `scripts/lib/mc-client.cjs` EARLY (loadProfile/saveProfile 0o600/httpRequest/sseStream passthrough)  `[P1]`  · depends_on: (none)
- **Objective:** v1 sequenced C4 (which CREATES the shared module) AFTER D5/E3 which both edit it. v2 extracts a MINIMAL shared module NOW so D5's SSE rewrite and E3's per-tool timeouts have a real target.
- **Files:** `scripts/lib/mc-client.cjs` (NEW minimal — `loadProfile`/`saveProfile(0o600)`/`httpRequest(timeoutMs)`/`sseStream` passthrough); `scripts/mc-mcp-server.cjs`, `mc-cli.cjs`, `mc-tui.cjs` (require it).
- **Acceptance:** (1) minimal module exports the four fns; all three adapters require it (no duplicate copy); (2) `saveProfile` uses `{mode:0o600}` (from B3); (3) timeout is a named constant per surface passed to `httpRequest` — no hardcode drift; (4) each adapter's existing tests pass unchanged; (5) D5 and E3 can depend on this module existing; (6) `pnpm test:all` green.
- **Test:** `scripts/lib/mc-client.test.cjs`: httpRequest timeout AbortController fires; sseStream parses a `data:` frame.
- **Risk:** Capture each adapter's current timeout/error-shape as a golden test before extraction so parity is enforced.
- **Rollback:** Restore the three inline copies; delete the module.

#### C1 — Extract Aegis reviewer as `src/opzava/core/reviews` deep module  `[P1]`  · depends_on: B2
- **Objective:** Move `buildReviewPrompt` (`:930`), `parseReviewVerdict` (hardened in B2), and the `runAegisReviews` loop body into `core/reviews` exposing `review(task)` + pure prompt/verdict fns; barrel-re-export so `scheduler.ts` imports stay unchanged. The claim (guarded UPDATE at `:1005`) STAYS in `task-dispatch.ts` (the dispatcher owns DB state).
- **Files:** `task-dispatch.ts:905-1154` (extract); `src/opzava/core/reviews/contracts.ts` (NEW — zod, mirror `core/secrets/contracts.ts`); `review-service.ts` (NEW — `review(task, deps): Promise<ReviewVerdict>`); `MODULE.md` (NEW); `src/opzava/architecture.test.ts` (core/reviews must not import platform/modules).
- **Acceptance:** (1) core/reviews exports `review(task)`, `buildReviewPrompt(task)`, `parseReviewVerdict(text)` — pure or deps-injected, framework-independent; (2) `runAegisReviews` becomes a thin caller: claim → `core/reviews.review(task)` → write verdict; (3) `scheduler.ts` and importers compile unchanged; (4) `architecture.test.ts`: core/reviews imports no platform/* or modules/*, no cycle; (5) the hardened parser + `source='model'` insert move with the module; (6) `pnpm test:all` green; task-dispatch.ts shrinks.
- **Test:** Vitest: parser table (from B2) + buildReviewPrompt snapshot + `review()` against a stubbed model; architecture guard.
- **Risk:** Keep the claim in task-dispatch.ts and move only prompt/verdict/model-call. `ReviewVerdict` is a frozen readonly contract.
- **Rollback:** Move fns back into task-dispatch.ts; delete core/reviews. Barrel re-export means callers are unaffected.

#### C2 — Split the god-module: dispatch enqueues, runner executes (explicit DIRECT-API completion path; golden snapshot BEFORE)  `[P1]`  · depends_on: C1, A1
- **Objective:** Verified the `1474-1536` synchronous-completion block is reachable ONLY via the direct-API fall-through (branch `:1338`); `targetSession` `continue`s at `:1402`, new-session at `:1471`. Capture a golden snapshot of dispatch outcomes BEFORE the refactor; refactor so dispatch enqueues a job and the runner executes; route the DIRECT-API completion through the runner executor explicitly; delete the genuinely-dead duplication; reject `(useDirectApi && targetSession)` explicitly.
- **Files:** `task-dispatch.ts:1336-1536` (branch control flow); `src/opzava/platform/runner/worker.ts:45` (executor drain); `src/opzava/modules/content/workflow/job-kind-executor.ts:9` (register the new kind).
- **Acceptance:** (1) BEFORE any change: capture a golden fixture of `dispatchAssignedTasks` outcomes for a seeded set (direct-API, target-session, new-session); (2) `dispatchAssignedTasks` claims `assigned→in_progress` and enqueues a `{kind:'task-dispatch', task_id}` job; the runner executes the provider/gateway/direct-API call; (3) the DIRECT-API completion path is routed through the runner executor explicitly; (4) the genuinely-dead duplication is deleted; (5) `(useDirectApi && targetSession)` rejected explicitly; (6) each branch is an explicit early-return; (7) AFTER: golden test asserts byte-identical terminal status/resolution/activity (direct-API covered specifically); (8) `pnpm test:all` green.
- **Test:** Vitest: dispatch against a stubbed enqueue → one job with correct kind+task_id; golden: runner drains, transitions match the fixture; branch: `(useDirectApi && targetSession)` → explicit rejection.
- **Risk:** The golden snapshot (captured BEFORE) is the parity guarantee. The DIRECT-API completion path is the only live synchronous path — MUST be covered by the golden test.
- **Rollback:** Restore inline execution; remove the kind registration.

#### C3 — Runner canonical path: register task-dispatch + content-step kinds; `task_id` FK (opzava_runner_004); read-only stuck-task detector (now POPULATED by A5)  `[P1]`  · depends_on: C2, A1, A5, G1
- **Objective:** Per D-6: generalize `createJobKindExecutor` to register `task-dispatch` + `content-step` alongside `CAMPAIGN_SEND_JOB_KIND`; add the missing `task_id` FK (migration `opzava_runner_004_task_id`, following the 001/002/003 convention — id does not collide with main-array ids); add `listStuckTasks()` now POPULATED because A5 arms `claimed_at`. Do NOT delete the LIVE `WorkflowRun`/`listRecentWorkflowRuns` surface (`ops/runs/route.ts:29`).
- **Files:** `job-kind-executor.ts:9`; `src/opzava/platform/runner/contracts.ts` (Job type — add optional `task_id`), `migrations.ts` (append `opzava_runner_004_task_id` via the runner/migrations seam); `src/opzava/platform/runner/run-queries.ts:24` (add `listStuckTasks()`); `src/app/api/ops/runs/route.ts` (expose read-only).
- **Acceptance:** (1) `createJobKindExecutor` registers three kinds; (2) `opzava_runner_004_task_id` adds `task_id INTEGER` nullable + FK (FK enforced: `db.ts:58` foreign_keys=ON); id unique across both arrays (governance test); (3) `listStuckTasks()` returns `quality_review` AND `in_progress` past lease — POPULATED by A5; (4) liveness preserved: `WorkflowRun`/`listRecentWorkflowRuns` + `sourceStepRunId` NOT deleted; (5) test: enqueue a task-dispatch job → runner drains → `task_id` FK resolves; a `quality_review` row past lease appears in `listStuckTasks()`; (6) `pnpm test:all` green.
- **Test:** Vitest: kind dispatch for each of three kinds; seed `quality_review claimed_at=now-20min` → `listStuckTasks()` returns it; within lease → excluded.
- **Risk:** Adding the FK via the runner/migrations seam is the documented single crossing. `listStuckTasks` is only useful AFTER A5 arms `claimed_at` — hence C3 depends_on A5.
- **Rollback:** Unregister the two new kinds; `task_id` column stays nullable and ignored. `listStuckTasks` can remain as a read-only diagnostic.

#### C4 — Deep extraction of `scripts/lib/mc-client.cjs` (dedupe timeout-drift + single sseStream home)  `[P1]`  · depends_on: C0, C2
- **Objective:** Build on C0: complete the timeout-dedup (TUI 8000 hardcode vs MCP 30000 vs CLI variable) and make `sseStream` the single home (the D5 Last-Event-ID rewrite targets this one file). Eliminate the sseStream id-gap.
- **Files:** `scripts/lib/mc-client.cjs` (from C0); `scripts/mc-mcp-server.cjs:74` (30000), `mc-cli.cjs`, `mc-tui.cjs` (8000 hardcode).
- **Acceptance:** (1) one shared module; all three adapters require it; (2) timeout is a single named constant per surface — no drift; (3) `sseStream` lives in one place; (4) behavior parity (golden tests); (5) `pnpm test:all` green.
- **Test:** `mc-client.test.cjs`: httpRequest timeout + sseStream `data:` parsing (and after D5, Last-Event-ID resend).
- **Risk:** Behavioral drift between the three copies is why they drifted; capture golden tests before deep extraction.
- **Rollback:** Restore the three inline copies; revert the module to the C0 minimal.

### Track D — Device-auth + persistent reliable connection  `[P0]`

**Goal:** Ship RFC 8628 device-authorization (Opzava as own OAuth AS+RS, 8h/30d rotating refresh), the three-layer rotation guard with SERVER-SAFE disambiguation, device-flow endpoints with DB-BACKED rate limits, `/device` approval page, resilient transport reusing the SSE cursor, the fused B1b cascade branch, honestly-scoped exactly-once idempotency, redaction governance, scope-capped issuance (no admin device tokens), and the openapi.json + .env.example + system-map docs.

#### D1 — Migration `058`: `device_tokens` + `oauth_device_sessions` + `revoked_access_tokens` denylist (audience reserved)  `[P0]`  · depends_on: B1a
- **Objective:** Append `058_device_tokens_oauth_sessions_denylist` (renumbered from v1's 055 collision). Create three tables: `device_tokens` (mirrors `agent_api_keys`/040 at `migrations.ts:1224`), `oauth_device_sessions` (clones the access-requests approval template), and `revoked_access_tokens` (the optional `MC_DEVICE_INSTANT_REVOKE` denylist, folded into 058 to avoid a redundant 059 id). Idempotent CREATE TABLE IF NOT EXISTS.
- **Files:** `src/lib/migrations.ts` (append before `:1499`; mirror the 040 pattern); `src/app/api/auth/access-requests/route.ts` (014 approval template); `docs/architecture/system-map/00-database-ledger.md` (document all three tables — v1 dropped this).
- **Acceptance:** (1) `device_tokens` has the full column set (`user_id`, `workspace_id` REQUIRED at issuance (no default), `device_id`, `device_label`, `client_kind DEFAULT 'public'`, `scopes TEXT DEFAULT '[]'`, `access_token_hash`, `refresh_token_hash`, `refresh_token_prev_hash`, `rotation_chain_id`, `rotation_seq DEFAULT 1`, `access_expires_at`, `refresh_expires_at`, `rotated_at`, `last_seen_at`, `last_used_ip`, `revoked_at`, `revoke_reason`, `audience TEXT` reserved, timestamps); UNIQUE `(workspace_id, access_token_hash)` + UNIQUE `(workspace_id, refresh_token_hash)`; indexes on chain/user/device/refresh_hash/access_expires/revoked; (2) `oauth_device_sessions`: `user_code_canonical UNIQUE`, `device_code_hash`, `status DEFAULT 'pending'`, `user_id`, `scopes`, `client_label`, `requested_by_ip`, `expires_at`, `approved_at`, `approved_by`; indexes; (3) `revoked_access_tokens` denylist table; (4) id 058 globally unique; (5) runMigrations applies atomically + idempotently; audience reserved; (6) `00-database-ledger.md` documents all three; (7) test: applies on fresh db, no-op on re-run; UNIQUE pairs reject duplicate hashes.
- **Test:** Vitest: apply 058, INSERT duplicate `(workspace_id, access_token_hash)` → UNIQUE error; re-run → no error; confirm tables + indexes via `PRAGMA index_list`.
- **Risk:** `device_tokens.workspace_id` has NO DEFAULT (D2 requires explicit) to prevent the cross-tenant trap. The chain + refresh_hash indexes are required for the O(1) conditional UPDATE in D3.
- **Rollback:** DROP the three tables; `DELETE FROM schema_migrations WHERE id='058_…'`. All new with no inbound legacy refs.

#### D2 — `src/opzava/core/auth` module: contracts + token-service + device-code + crypto + MODULE.md + architecture guard (scope-capped, explicit-workspace, optional denylist)  `[P0]`  · depends_on: D1
- **Objective:** The deep module owning issuance/rotation/validation/revocation. Public surface: `resolveDeviceToken(bearer): User|null` (~15-line cascade branch wired in B1b), `issueForDevice` (REQUIRES explicit `workspace_id`, scope-capped to never admin), `rotate` (three-layer guard), `revoke` (family-wide).
- **Files:** `src/opzava/core/auth/contracts.ts` (zod, mirror `core/secrets/contracts.ts`: DEVICE_TOKEN_KIND, accessTokenSchema 8h, refreshTokenSchema 30d, deviceCodeSchema, userCodeSchema base-20); `token-service.ts` (resolve/issue/rotate/revoke); `device-code.ts` (issueDeviceCode, bindUserCode, canonicalizeUserCode); `crypto.ts` (hashToken sha256 mirroring `auth.ts:634`, optionalEnvelopeEncrypt(`OPZAVA_TOKEN_ENC_KEY||AUTH_SECRET`)); `MODULE.md`; `src/opzava/architecture.test.ts` (layering + `resolveDeviceToken`-uniqueness guards).
- **Acceptance:** (1) `resolveDeviceToken` looks up by `access_token_hash` (sha256, never raw), validates `access_expires_at` with 60s skew grace + `revoked_at IS NULL`, returns a `User` with `role=deriveRoleFromScopes(scopes)` defaulting to viewer (never admin); (2) `issueForDevice` REQUIRES explicit `workspace_id` (throws if missing) and REJECTS/DOWNGRADES any scope mapping to admin — device tokens capped at operator/viewer regardless of approver; (3) `issueForDevice`: access=`mc_dt_+randomBytes(32).hex` 8h, refresh=`mc_rt_+randomBytes(32).hex` 30d, chain=UUID, seq=1; raw tokens returned once, hashes persisted; (4) `rotate`: three-layer guard (single-flight optimization + SQLite conditional UPDATE as the lock + grace window); disambiguation specified in D3; (5) `revoke`: family-wide on rotation reuse + `security.event` severity=critical; (6) when `MC_DEVICE_INSTANT_REVOKE=1`: revoke also writes `access_token_hash` to the denylist and `resolveDeviceToken` checks it per-request; (7) `architecture.test.ts`: core/auth imports no platform/modules; exactly one opzava file exports `resolveDeviceToken`; (8) MODULE.md documents invariants (hash-only-at-rest, rotation_seq monotonic, reuse→family-revocation, 8h/30d schema-pinned, scope-capped-never-admin, explicit-workspace-required, contracts `.strict()`); (9) `pnpm test:all` green.
- **Test:** Vitest: `resolveDeviceToken` by-hash lookup; skew boundary (accept at access_expires_at-1s and +59s, reject at +61s); revoked_at rejection; default-viewer; `issueForDevice` without workspace_id → throws; with admin scope → downgraded/rejected; crypto envelope round-trip with key set/unset (fallback AUTH_SECRET); architecture guards pass.
- **Risk:** The rotation guard is the #1 subtle-bug surface — the SERVER-SAFE `changes()===0` disambiguation lands in D3. Keep `resolveDeviceToken` ~15 lines.
- **Rollback:** Delete `src/opzava/core/auth/`; revert architecture guards; remove the B1b call site. The 058 tables remain.

#### D3 — Token endpoints + SERVER-SAFE three-layer rotation guard + reuse detection  `[P0]`  · depends_on: D2
- **Objective:** `POST /api/auth/device/token` implements refresh with the three-layer guard + RFC 6749 §10.4 reuse→family-revocation. **Critical v2 fix:** v1's loser-branch disambiguation FALSE-REVOKED the entire family on a LEGITIMATE concurrent retry (two mc shims, a retrying proxy) — locking the user out. v2 distinguishes via `rotation_seq`: legit immediate-prior (concurrent loser) vs replayed-old-token (reuse). Critical rate-limit (`critical:true` survives `MC_DISABLE_RATE_LIMIT=1`).
- **Files:** `src/app/api/auth/device/token/route.ts` (NEW — grant_type=refresh_token + device_code; grant-type-agnostic per D-1); `src/app/api/auth/device/revoke/route.ts` (NEW); `src/opzava/core/auth/token-service.ts`; `src/lib/rate-limit.ts:191` (`createKeyedRateLimiter` — refresh limiter `critical:true`, keyed by IP + refresh_token hash prefix).
- **Acceptance:** (1) refresh: the conditional UPDATE (`WHERE rotation_chain_id=? AND refresh_token_hash=? AND revoked_at IS NULL AND rotated_at IS NULL`) is the lock; `changes()===1` → new pair; (2) SERVER-SAFE DISAMBIGUATION: on `changes()===0` re-read the row — if `revoked_at IS NOT NULL` → already-revoked, 401 idempotent (safe); if `rotated_at IS NOT NULL AND rotation_seq == max(seq in chain)` → legit concurrent loser → 409 `already_rotated` with the CURRENT valid token's metadata (NOT a new pair, NOT a revoke); ONLY if `rotated_at IS NOT NULL AND rotation_seq < max(seq)` → genuine reuse → family revoke + `security.event` severity=critical; (3) the token endpoint accepts device_code too (grant-type-agnostic); audience populated but not enforced; (4) CONCURRENCY TEST: two simultaneous refreshes of the SAME token → exactly ONE 200 + new tokens, the OTHER 409 `already_rotated`, ZERO family revocations; (5) REUSE TEST: re-presenting a token whose `rotation_seq < max` → chain revoked + `security.event` once; re-revoke → safe no-op; (6) refresh limiter `critical:true`; (7) `pnpm test:all` green.
- **Test:** Vitest concurrency: two `Promise.all` refreshes → one 200, one 409, ZERO revocations. Reuse: rotate, re-present older token → chain revoked + spy once; re-revoke → no-op. Re-present immediate-prior (seq==max) → 409 not revoke.
- **Risk:** HIGHEST-RISK TASK. The `changes()===0` disambiguation MUST use `rotation_seq`, not `rotated_at`-presence alone. Sticky-session Traefik routes a refresh to replica B while replica A holds prior state — the DB conditional UPDATE is the only correctness guarantee.
- **Rollback:** Return 501 from the refresh path (or restrict to device_code grant); reuse-detection stays inert.

#### D4 — Device-code endpoints + `/device` approval page + DB-BACKED rate limits + RFC 8628 anti-phishing  `[P0]`  · depends_on: D3
- **Objective:** `POST /api/auth/device/code` (device_code+user_code, `expires_in=900` per RFC 8628 §3.2), the polling token endpoint, `GET /api/auth/devices` admin list + `/[id]/revoke`, the `/device` approval page with anti-phishing. **Critical v2 fix:** v1's rate limits are in-memory per-process Maps — an attacker behind NAT or a non-sticky LB splits attempts across N replicas, multiplying the limit by N. v2 uses a DB-BACKED counter keyed on `(ip, user_code_hash)` mirroring the A3 guarded-counter pattern (replica-consistent).
- **Files:** `src/app/api/auth/device/code/route.ts` (NEW); `src/app/api/auth/devices/route.ts` (NEW — admin list); `src/app/api/auth/devices/[id]/revoke/route.ts` (NEW — writes denylist when `MC_DEVICE_INSTANT_REVOKE=1`); `src/app/device/page.tsx` (NEW — DeviceApprovalPanel); `src/lib/rate-limit.ts:191` (DB-BACKED device-flow limiter `critical:true`, OR a new `dbRateLimiter` primitive mirroring A3).
- **Acceptance:** (1) `POST /api/auth/device/code` returns `{device_code, user_code, verification_uri, expires_in:900, interval:5}`; device_code ≥128 bits never displayed; user_code 8 base-20 chars `XXXX-XXXX`; (2) the device-flow rate limit is DB-BACKED (replica-consistent, `critical:true`); (3) the polling endpoint returns `authorization_pending`/`slow_down`/`expired`/`denied` per §3.5; `slow_down` permanently adds 5s; (4) `GET /api/auth/devices` (admin) lists active tokens; `POST /[id]/revoke` revokes the chain (+ denylist when enabled); (5) `/device` displays the user_code, requires explicit confirm (no auto-approve on `verification_uri_complete`), shows device_label/client_kind (§5.4 anti-phishing); (6) `userCodeVerifyLimiter` (DB-backed) keyed by ip + attempted user_code, 5/600s; (7) test: full device flow; (8) `pnpm test:all` green.
- **Test:** Integration: POST code → poll pending → approve at `/device` → poll returns tokens; deny → denied. Rate-limit: 6 rapid wrong user_codes from one IP across two simulated replicas → 429 (DB-backed). E2E (playwright) on local-docker-parity: `mc auth device` → user_code → approve → token stored.
- **Risk:** The DB-backed limiter is the device-flow's #1 exploit fix — the in-memory Map is bypassable at >1 replica. Anti-phishing UX: enforce explicit confirm + display user_code.
- **Rollback:** Return 501 from the code/devices endpoints; `/device` returns 'feature disabled'.

#### D5 — Resilient-http + refresh-on-401 single-flight + SSE client-resume rewrite + honestly-scoped exactly-once idempotency  `[P0]`  · depends_on: D6, C0
- **Objective:** Build the shared resilient transport (in `scripts/lib/mc-client.cjs` from C0, which now EXISTS): refresh-on-401 with in-process single-flight, the `sseStream` Last-Event-ID rewrite (genuine new client work — `mc-cli.cjs:207` parses only `data:`, ignores `id:`), and exactly-once mutation retry HONESTLY SCOPED to routes that have an idempotency index (chat via 054, task capture via A1's `client_request_id`) — v1 assumed a generic key on most tables (it does not exist).
- **Files:** `scripts/lib/mc-client.cjs` (from C0); `scripts/mc-cli.cjs:207`/`:252` (sseStream rewrite — track last `id:`, resend `Last-Event-ID` on reconnect); `src/lib/realtime-events.ts:165` (`readServerEventsAfter` — server-side, unchanged), `:202` (`parseLastEventId`); `src/lib/migrations.ts:1493` (054 partial unique index — the precedent), `src/app/api/chat/messages/route.ts:478-501` (SELECT-first idiom).
- **Acceptance:** (1) `sseStream` tracks the last `id:` and sends `Last-Event-ID` on reconnect; server resume unchanged + correct; (2) refresh-on-401: a 401 triggers exactly one in-process refresh (single-flight), retries the original call once with the new bearer; a 401 on the refresh call itself returns 401 without retrying (no deadlock); (3) exactly-once via `Idempotency-Key` HONESTLY SCOPED to indexed routes only; non-indexed routes → single-attempt-no-retry, surface the 5xx; (4) transport reuses the realtime SSE cursor; the only new substrate is client `id:` tracking; (5) test: server drops mid-stream → sseStream reconnects with `Last-Event-ID` and resumes without gaps; retried POST with same key on an indexed route executes once (`idempotent:true`); (6) `pnpm test:all` green.
- **Test:** node:test: sseStream against a stubbed server emitting `id:1/data:A`, disconnect, reconnect with `Last-Event-ID:1` emitting `id:2/data:B` → client sees A then B (no gap, no dup). Idempotency: POST twice same key on chat → executes once, `idempotent:true`. Non-indexed route → single attempt, 5xx surfaced.
- **Risk:** The sseStream rewrite is genuinely new work. Single-flight refresh must not deadlock under recursive 401. Honest scope prevents silent double-writes on non-indexed routes.
- **Rollback:** Restore `data:`-only sseStream; disable refresh-on-401; drop the Idempotency-Key header.

#### D6 — Local client: stdio shim + CLI device flow + 0o600 atomic write + structured errors + cold-start no-TTY runtime invariant + .env.example docs  `[P0]`  · depends_on: D4
- **Objective:** The stdio MCP shim + CLI gain device-flow bootstrap: `mc auth device` → user_code → approve → token stored at 0o600 via atomic temp+rename (same-dir). Structured `{error,message,action}` errors replace the raw throw at `mc-mcp-server.cjs:82`. Runtime-verified cold-start no-TTY invariant (v1 had it as prose). `.env.example` documents `OPZAVA_TOKEN_ENC_KEY` + `OPZAVA_INSECURE_STORAGE`.
- **Files:** `scripts/mc-mcp-server.cjs:82` (raw throw → structured), `:23` (loadConfig → device-flow bootstrap), `:60` (api() → stored token + refresh-on-401); `scripts/mc-cli.cjs` (`mc auth device`, XDG credentials path, atomic temp+rename 0o600 same-dir); `scripts/lib/mc-client.cjs` (shared credential store); `.env.example` (append `OPZAVA_TOKEN_ENC_KEY` + `OPZAVA_INSECURE_STORAGE`).
- **Acceptance:** (1) `mc auth device` prints user_code + verification_uri, polls, on approval stores the token pair in an XDG-respecting file written via atomic temp+rename (same-dir) at 0o600 (no passphrase); (2) the shim reads the stored token on spawn (no TTY prompt — cold-start-after-reboot works), refreshes on 401 via D5, never logs `mc_dt_`/`mc_rt_`/device_code; (3) COLD-START NO-TTY RUNTIME INVARIANT: spawn the shim with piped (non-TTY) stdin + no credential file → exits non-zero within N seconds with a stderr line containing 'mc auth device' (actionable), never blocks on stdin.read; (4) tools/call returns structured `{error:'unauthorized'|'forbidden'|'not_found'|'rate_limited'|'server_error', message, action}` preserving HTTP status (replaces `:82`); (5) default scope viewer/operator — the shim holds a non-admin token; (6) `.env.example` documents both env vars; (7) `pnpm test:all` green.
- **Test:** node:test: mock device endpoints, run bootstrap, assert credentials file mode 0o600, no passphrase; tools/call against stubbed 403 → `{error:'forbidden', status:403}`; no log contains `mc_dt_`/`mc_rt_`; cold-start spawn with piped stdin + no cred file → non-zero exit with 'mc auth device' on stderr within N seconds.
- **Risk:** Atomic temp+rename across filesystems can fail; write the temp in the SAME dir. The shim MUST fail loudly (not silently) if the credential file is missing AND no device flow is possible. The cold-start invariant is load-bearing for every reboot.
- **Rollback:** Remove `mc auth device`; revert `mc-mcp-server.cjs:82` to the raw throw; the shim falls back to `MC_API_KEY`.

#### D7 — Redaction governance test + openapi.json specs + 60-api-layer.md docs  `[P0]`  · depends_on: D6, D4
- **Objective:** Add `test/device-auth-redaction.test.mjs` (no raw tokens in logs/errors). openapi.json specs for the ~10 new device/auth endpoints (api:parity runs FIRST in `test:all` at `package.json:29` — every route needs a spec or the gate fails). `60-api-layer.md` documents the new routes.
- **Files:** `test/device-auth-redaction.test.mjs` (NEW — mirror `test/status-healthcheck-contract.test.mjs`); `openapi.json` (NEW specs for `/api/auth/device/code`, `/token`, `/revoke`, `/api/auth/devices`, `/api/auth/devices/[id]/revoke`); `docs/architecture/system-map/60-api-layer.md`.
- **Acceptance:** (1) the redaction test reads each device-flow source file and asserts no `console.(log|error|warn)(…mc_dt_|mc_rt_|device_code=|refresh_token)` at the call site + no raw token prefix in an error/message return path; (2) openapi.json has a spec for every new device/auth path+method; api:parity passes; (3) `60-api-layer.md` lists the new routes; (4) wired into `test:governance` → `test:all`; (5) the redaction test fails (red) if a developer adds `console.log(accessToken)`; (6) `pnpm test:all` green.
- **Test:** node:test: the redaction test itself; api:parity: every new route has a spec; negative control: temporarily add `console.log(mc_dt_…)` → redaction test fails.
- **Risk:** Regex redaction tests can be bypassed by string concatenation; anchor on call sites + review in `/security-review`. The openapi specs are a hard `test:all` gate.
- **Rollback:** Delete the redaction test; remove the openapi specs; no production code depends on these.

### Track E — MCP server hardening  `[P1]`

**Goal:** Convert the code-reading-only MCP findings to runtime-verified (spawn stdio, exercise real JSON-RPC), add a MCP-tools-vs-routes contract test, per-tool timeouts with route context, preserve HTTP status in errors, handle `notifications/cancelled`, and fix the CLI cron verb mapping.

#### E1 — MCP stdio integration test harness (spawn + JSON-RPC initialize/tools.list/tools.call/notifications.cancelled)  `[P1]`  · depends_on: D2
- **Objective:** Replace the static `require()`-only test (`mc-mcp-server.test.mjs:17` never spawns) with a harness that spawns the stdio server, pipes real JSON-RPC, and asserts runtime behavior: initialize handshake, tools/list, a tools/call against a stubbed REST, `notifications/cancelled` aborts the in-flight fetch, and the 30s timeout message.
- **Files:** `scripts/mc-mcp-server.test.mjs:17`; `scripts/mc-mcp-server.cjs:917` (method switch), `:954-959` (tools/call catch), `:86` (AbortError → 'Request timeout (30s)'), `:896-898` (`CAPABILITIES={tools:{}}`); NEW `scripts/mc-mcp-server.spawn.test.mjs`.
- **Acceptance:** (1) the harness spawns the server, sends initialize, asserts a successful `InitializeResult` with protocolVersion + capabilities.tools; (2) sends tools/list, asserts the TOOLS array; sends a tools/call with a stubbed fetch, asserts the result; (3) sends `notifications/cancelled` for an in-flight tools/call and asserts the fetch aborts (AbortController keyed by request-id); (4) probes an unimplemented method → -32601 at runtime; (5) the 30s timeout asserted via a fake clock / 1ms override; (6) `pnpm test:all` green.
- **Test:** node:test: the harness; assertions on the spawned child's stdout JSON-RPC responses.
- **Risk:** Spawning a child in CI can be flaky on timing; use deterministic fake clocks + a stubbed REST (no real network).
- **Rollback:** Delete the spawn harness; the static test remains (status quo).

#### E2 — MCP-tools-vs-routes contract test (resolve each TOOLS handler api() target to a route file)  `[P1]`  · depends_on: E1
- **Objective:** The surviving sub-claim of the refuted 'api:parity not in test:all' finding: no test resolves each TOOLS handler's `api()` target to a route file. (api:parity IS already in test:all at `package.json:29`; `/api/v1/runs` is NOT ignore-listed — those halves are refuted.) Build the contract test.
- **Files:** `scripts/mc-mcp-server.cjs:95` (TOOLS), `:101`/`:369`/`:572`/`:721` (pass-throughs); `scripts/api-contract-parity.ignore` (confirmed: only comment lines 1-5, no route entries); NEW `scripts/mcp-tools-routes-contract.test.mjs`.
- **Acceptance:** (1) the test parses TOOLS, extracts each handler's `api()` target (method + URL), asserts a matching route file exists under `src/app/api/`; (2) every handler mapped; a handler whose target route is missing fails the test (prevents perma-ignored drift); (3) dynamic URL templates (`/api/agents/${id}`) normalized to `[id]`; (4) confirms api:parity runs in test:all + the ignore file has no route entries; (5) `pnpm test:all` green.
- **Test:** node.test: the contract test; negative control: add a TOOLS entry pointing at a non-existent route → fails.
- **Risk:** Dynamic URL templates must be normalized to the `[id]` bracket convention.
- **Rollback:** Delete the contract test; api:parity continues to run.

#### E3 — Per-tool timeouts + route context + preserve HTTP status + notifications/cancelled AbortController map (uses C0 httpRequest)  `[P1]`  · depends_on: E1, C0
- **Objective:** Replace the 30s blanket timeout (`:74`) with per-tool/category timeouts carrying route context; preserve HTTP status in the tool error (the collapsed-error at `:82`); implement `notifications/cancelled` via a request-id AbortController map. Uses the C0 shared `httpRequest(timeoutMs)` (now EXISTS).
- **Files:** `scripts/mc-mcp-server.cjs:74` (30000 blanket), `:82` (collapsed error), `:913` (notifications/initialized only — add cancelled); `scripts/lib/mc-client.cjs` (from C0).
- **Acceptance:** (1) each TOOLS entry declares a `timeoutMs` (run-reporting/session-continue get a longer budget); (2) tools/call errors include the HTTP status + route path (e.g. `{error:'server_error', status:502, route:'/api/v1/runs'}`); (3) `notifications/cancelled` looks up the in-flight AbortController by request-id and aborts; (4) the 30s blanket constant removed; (5) test: a slow tool (stubbed 5s) with 1s timeout → timeout error with route; a cancelled in-flight call aborts cleanly; (6) `pnpm test:all` green.
- **Test:** node.test (via E1 harness): stub a tool route sleeping 5s, set timeoutMs=1000, assert timeout error with `{route}`; `notifications/cancelled` mid-call → abort; stub 502 → status preserved.
- **Risk:** Per-tool timeout values must be chosen carefully (too short aborts legitimate long runs). Start conservative.
- **Rollback:** Restore the 30000ms blanket + collapsed error + initialized-only handling.

#### E4 — Fix CLI cron verb mapping (create→add, pause/resume→toggle, run→trigger) + integration test  `[P1]`  · depends_on: (none)
- **Objective:** The CLI cron verbs (`mc-cli.cjs:540-547`) all POST `/api/cron` with `bodyFromFlags` and no action field; the route action vocabulary is `{list,logs,history,toggle,trigger,remove,add,clone}`. Map CLI verbs to route actions; 'update' has no route action (map to add-with-id).
- **Files:** `scripts/mc-cli.cjs:540-547`; `src/app/api/cron/route.ts` (action branches: toggle `:272`, trigger `:298`, remove `:342`, add `:367`, clone `:416`); NEW `scripts/mc-cli-cron.test.mjs`.
- **Acceptance:** (1) create→`add`; pause/resume→`toggle`; run→`trigger`; remove→`remove`; list→GET; update→add-with-id (backward compat); (2) each verb produces the correct `{method, route, body:{action, …}}`; (3) integration test: each verb against a stubbed `/api/cron` returns the action-handled response (not a 400); (4) `pnpm test:all` green.
- **Test:** node.test: invoke each verb with a stubbed httpRequest, assert outgoing `body.action`; negative: 'update' → add-with-id.
- **Risk:** Removing/changing 'update' could break operator scripts; document in CLI --help + ops-cheatsheet.
- **Rollback:** Restore the `bodyFromFlags`-only cron verbs.

### Track F — Client-connectivity truthing + dead surface  `[P2]`

**Goal:** Truth the client-connectivity surface: relabel Claude Desktop/Codex Desktop as planned, relabel `/api/adapters` as an event-ingest shim, pin `OPENCLAW_GATEWAY_IMAGE` to a digest + gateway-protocol contract test, and gate/move the social+general-va scaffold.

#### F1 — Relabel desktop adapters + `/api/adapters` + gate social/general-va scaffold  `[P2]`  · depends_on: (none)
- **Objective:** Mark claude-desktop/codex-desktop as 'planned/not implemented' (or implement+test); relabel `/api/adapters` (`openclaw.ts:9` broadcasts `agent.created`, `generic.ts` is event-only) as an event-ingest shim and document openclaw-adapter != openclaw-gateway; gate/move the social+general-va scaffold.
- **Files:** `src/lib/adapters/openclaw.ts:9`, `generic.ts`, `index.ts:18`; `src/app/api/adapters/route.ts:67`; `docs/architecture/system-map/51-inherited-integrations.md`; `src/opzava/modules/social`, `general-va`.
- **Acceptance:** (1) desktop connectors labeled 'planned' in UI + docs (or implemented with a test); (2) `/api/adapters` documented as event-ingest shim; openclaw-adapter vs openclaw-gateway distinction explicit; (3) social+general-va gated behind a feature flag (or moved to a stubs dir); (4) governance test asserts the 'planned' label; (5) `pnpm test:all` green.
- **Test:** node.test governance: grep the integrations doc + UI strings, assert 'planned' (or a passing implementation test).
- **Risk:** Relabeling may disappoint users; communicate clearly. Gating must not break imports — use a feature flag read at the route layer.
- **Rollback:** Restore the original labels; ungate.

#### F2 — Pin `OPENCLAW_GATEWAY_IMAGE` to a digest + gateway-protocol contract test  `[P2]`  · depends_on: F1
- **Objective:** Pin the gateway container image to an immutable digest (not a moving tag) and add a contract test asserting the gateway protocol surface Opzava depends on (the two compatibility fallbacks at `spawn/route.ts:83` `sessions_spawn`, `:100` `agent`).
- **Files:** `docker-compose.dokploy.yml` + `docker-compose-openclaw.yml` (the two files that define the gateway service — `docker-compose.yml` defines no gateway service); `src/app/api/spawn/route.ts:83`, `:100`; `src/lib/openclaw-gateway.ts:67`; NEW `test/gateway-protocol-contract.test.mjs`.
- **Acceptance:** (1) `OPENCLAW_GATEWAY_IMAGE` references a `sha256` digest in BOTH compose files that define the gateway service (`docker-compose.dokploy.yml`, `docker-compose-openclaw.yml`), pinned as the default in a `${VAR:-digest}` pattern (operator-overridable); note `docker-compose.yml` defines no gateway service so it is out of scope; (2) the contract test asserts the two gateway RPC methods (`sessions_spawn`, `agent`) are documented + the fallback paths match the documented protocol; (3) the contract test codifies the expected surface so a moving-target upstream change fails CI; (4) `pnpm test:all` green.
- **Test:** node.test: assert the image string matches `@sha256:[a-f0-9]{64}`; assert the spawn fallback method names match the contract doc.
- **Risk:** Pinning to a digest blocks security updates until manually bumped; document the bump cadence in ops-cheatsheet.
- **Rollback:** Restore the mutable tag; delete the contract test.

### Track G — Horizontal-scale honesty (single-active-writer + cross-tenant fix + correct TTL invariant)  `[P0]`

**Goal:** Resolve the CLAUDE.md-mandate-vs-deployment.md-reality contradiction: adopt single-active-writer via a leader-election/advisory-lock seam; document honestly; thread explicit workspaceId through `runAegisReviews` AND `requeueStaleTasks` (the REAL cross-tenant fix); use the CORRECT invariant (**lock TTL < lease TTL**).

#### G1 — Leader-election/advisory-lock seam + thread explicit workspaceId through runAegisReviews AND requeueStaleTasks + correct TTL invariant  `[P0]`  · depends_on: A1
- **Objective:** v1 had THREE defects here, all fixed: (1) WRONG-FUNCTION TARGET — v1 said "remove `workspaceId ?? 1` in `runAegisReviews` (`:399`)" but `:399` is in `reconcileDeferredTaskCompletions`; `runAegisReviews` (`:980`) takes NO workspaceId and its SELECT (`:989`) has NO workspace filter — it scans ALL workspaces; (2) CROSS-TENANT LEAK not closed — removing the `?? 1` default does NOT add the filter; `runAegisReviews` AND `requeueStaleTasks` (`:1171`, WHERE status='in_progress' only) both lack a workspace filter; (3) INVERTED INVARIANT — v1 said 'lease < lock' then gave lock 90s / lease 10min (the opposite). Correct: **lock TTL < lease TTL** so a crashed leader's lock expires BEFORE any in-flight task's lease.
- **Files:** `src/lib/scheduler.ts:57-67` (`runTaskDispatchChain` — gate behind `acquireLeadership()`), `:163` (dispatch handler), `:172` (runAegisReviews handler), `:190` (requeueStaleTasks handler); `src/lib/task-dispatch.ts:980-992` (runAegisReviews — thread `deps.workspaceId`, add `WHERE t.workspace_id = ?`, throw when unset); `:1160-1175` (requeueStaleTasks — thread workspaceId, add WHERE); `:399` (reconcile — require explicit); NEW `src/lib/leader-lock.ts` (advisory lock via a `leader_locks` table).
- **Acceptance:** (1) `acquireLeadership()` returns true on at most one replica; the tick runs the dispatch chain only when held; non-leader replicas skip dispatch (read-only); (2) CORRECT INVARIANT: lock TTL < lease TTL (lock 90s, lease 10min) — a crashed leader's lock expires BEFORE any in-flight claimed task's lease (no double-dispatch); (3) `acquireLeadership()` checked INSIDE the runTaskDispatchChain/runAegisReviews/requeueStaleTasks handlers only — heartbeat/cleanup still execute on non-leaders (assertion: a non-leader's heartbeat fires within its interval); (4) CROSS-TENANT FIX: runAegisReviews (`:989`) AND requeueStaleTasks (`:1173`) BOTH filter `WHERE t.workspace_id = ?`; a workspace-2 task is invisible to a workspace-1 writer; (5) reconcile (`:399`) requires explicit workspaceId; (6) concurrency test: two replica ticks → exactly one runs `dispatchAssignedTasks`; leader crash → reclaiming replica waits until BOTH lock TTL AND lease TTL elapsed before acquiring; (7) runAegisReviews/requeueStaleTasks throw/no-op when workspaceId unset; (8) `pnpm test:all` green.
- **Test:** Vitest: two `acquireLeadership()` → exactly one true; after lock TTL + lease TTL, the second acquires (NOT before lease expiry); runAegisReviews without workspaceId → throws; cross-tenant: workspace-2 quality_review → invisible to workspace-1 writer; non-leader heartbeat still fires.
- **Risk:** A leader-lock failure (crash without release) is recovered by the TTL; the CORRECT invariant (lock < lease) bounds double-dispatch to ZERO and failover downtime to lock TTL. The lock table is a new high-frequency write point — counted in A0's checkpoint cadence.
- **Rollback:** Remove `acquireLeadership()` gating; restore `workspaceId ?? 1`; remove the workspace filters. The lock table can remain unused.

#### G2 — Reframe CLAUDE.md + deployment.md + ops-cheatsheet single-active-writer honestly  `[P0]`  · depends_on: G1
- **Objective:** Reframe 'ENFORCE horizontal scalability' to honestly describe single-active-writer over SQLite today, with Postgres (ARD 0006) as the path to true multi-writer scale. Reconcile `deployment.md:625` (verified: 'SQLite uses WAL mode but does not support multiple writers').
- **Files:** `CLAUDE.md` (Critical Constraints — reframe); `docs/deployment.md:625`; `docs/ops-cheatsheet.md`.
- **Acceptance:** (1) CLAUDE.md 'ENFORCE horizontal scalability' reframed to 'single-active-writer over SQLite (leader-elected scheduler); Postgres (ARD 0006) is the path to true horizontal scale'; (2) `deployment.md:625` consistent with the leader-lock seam (one active writer, N read replicas); (3) ops-cheatsheet documents lock TTL (90s), lease TTL (10min), the lock<lease invariant, failover behavior, and that read replicas serve reads while the elected writer dispatches; (4) governance tests pass; (5) assert CLAUDE.md no longer contains the unqualified mandate.
- **Test:** Manual doc review + governance test pass; assert the unqualified mandate is gone.
- **Risk:** Softening a mandate can read as backsliding; frame as honesty (code wins) and keep the Postgres path explicit.
- **Rollback:** Restore the original wording.

### Track H — SQLite durability & graceful drain (coordinated shutdown)  `[P0]`

**Goal:** Decide synchronous level + wal_checkpoint policy (A0, moved to the front), make the graceful drain ACTUALLY await scheduler idle (v1 was self-contradictory — the drain explicitly did NOT await `stopBackgroundTimers`, and `stopScheduler` is a bare `clearInterval` that does not await the in-flight tick), coordinate the conflicting SIGTERM handlers (closeDatabase LAST), and add MCP server signal handlers.

#### H2 — Graceful drain ACTUALLY awaits scheduler idle + coordinated SIGTERM ordering (closeDatabase LAST) + MCP signal handlers  `[P0]`  · depends_on: G1, A0
- **Objective:** v1 did NOT close the crash-window: the real drain (`mc-server.cjs:84`) explicitly does NOT await `stopBackgroundTimers` ('best-effort; do not await'), and `stopScheduler` (`scheduler.ts:593`) is a bare `clearInterval` that does NOT await the in-flight tick (`await spec.handler` at `:529`). PLUS `db.ts:275-276` registers `closeDatabase` on SIGINT/SIGTERM, so a SIGTERM can close the DB handle BEFORE the in-flight dispatch finishes — the exact crash-window H2 claims to close. v2: make the drain AWAIT `stopBackgroundTimers` (Promise.race with DRAIN_MS), make `stopScheduler` await the in-flight tick, establish canonical ordering (stop dispatch → server.close → closeDatabase LAST).
- **Files:** `scripts/mc-server.cjs:80-95` (performGracefulDrain — AWAIT `stopBackgroundTimers` via `Promise.race([stopPromise, drainTimer])`; remove the 'do not await' comment at `:84`); `src/lib/scheduler.ts:593-597` (`stopScheduler` — track `activeTick: Promise<void>|null`, `await activeTick` with a timeout guard; `:529` sets it); `src/lib/db.ts:275-276` (closeDatabase on SIGINT/SIGTERM — MOVE INSIDE the coordinated drain AFTER `awaitSchedulerIdle`, or guard to run only on process `'exit'`); `src/lib/db.ts:267` (`registerProcessShutdown` — coordinate with the drain ordering); `scripts/mc-mcp-server.cjs` (add `process.on('SIGINT'/'SIGTERM')` triggering the notifications/cancelled-style abort of in-flight fetches from E3); `test/mc-server-drain.test.mjs` (extend to scheduler-await).
- **Acceptance:** (1) the drain calls `awaitSchedulerIdle()` (awaits the in-flight tick to quiesce or DRAIN_MS timeout) via `Promise.race` BEFORE `server.close()`+exit — `:84` no longer says 'do not await'; (2) `stopScheduler` (`:593`) tracks `activeTick` and awaits it (timeout guard); (3) COORDINATED SIGTERM ORDERING: (1) stopScheduler/abort in-flight dispatch FIRST, (2) server.close(), (3) closeDatabase() LAST — `db.ts:275-276`'s closeDatabase-on-SIGNAL moved inside the drain OR guarded to process `'exit'`; (4) a SIGTERM during an in-flight dispatch does NOT throw SQLITE on a closed handle; (5) DRAIN_MS bounds the wait; after timeout it proceeds (logging in-flight task ids — reclaimed by the A5 lease on next writer's startup sweep); (6) the MCP server installs SIGINT/SIGTERM handlers that abort in-flight tools/call fetches + exit cleanly (idempotent); (7) the 'drain doesn't await dispatch' claim is runtime-verified; (8) `pnpm test:all` green.
- **Test:** node:test: extend `test/mc-server-drain.test.mjs` — start a fake dispatch, trigger drain, assert it AWAITED (not fire-and-forget) or timed out + logged the task id; SIGTERM during dispatch → no SQLITE error on a closed handle; MCP: spawn, start a slow tools/call, SIGTERM → fetch aborted, clean exit.
- **Risk:** Awaiting scheduler idle can delay shutdown; bound with DRAIN_MS and log in-flight tasks (reclaimed by A5 lease). Signal handlers must be idempotent. The THREE-way SIGTERM coordination is the subtle part — establish ONE canonical ordering.
- **Rollback:** Remove `awaitSchedulerIdle` (restore 'do not await'); restore `db.ts:275-276` closeDatabase-on-SIGNAL; remove MCP signal handlers. The A5 lease still reclaims abandoned tasks.

### Track I — Dokploy operability (cookie/TLS hardening + backup/restore)  `[P0]`

**Goal:** Close three live Dokploy hazards v1 was silent on: (1) the sticky affinity cookie is httpOnly-only with no Secure/SameSite (a session-fixation/CSRF surface D4's browser approval rides on); (2) Traefik `forwardedHeaders.insecure=true` means `isRequestSecure` trusts a client-supplied `x-forwarded-proto`; (3) backup is default-off and there is NO restore path.

#### I1 — Cookie/TLS/forwarded-header hardening for Dokploy + the D4 approval page  `[P0]`  · depends_on: (none)
- **Objective:** Three verified live hazards: (1) the Traefik sticky cookie (`docker-compose.dokploy.yml:101-103`) is `httpOnly=true` only, no Secure/SameSite — rides every request unsecured on HTTPS, a session-fixation/CSRF surface D4's `/device` approval rides on; (2) Traefik `forwardedHeaders.insecure=true` (`:20`) means `isRequestSecure` (`session-cookie.ts:12`) trusts a CLIENT-SUPPLIED `x-forwarded-proto` — an attacker sending `X-Forwarded-Proto: https` over plain HTTP forces `isRequestSecure()=true`, breaking the `__Host-` contract; (3) D4's `/device` page is cookie-authenticated so these gate whether device approval works behind a misconfigured proxy.
- **Files:** `docker-compose.dokploy.yml:101-103` (sticky cookie — add Secure + SameSite=Lax via traefik labels: `loadbalancer.sticky.cookie.secure=true` + `.samesite=lax`); `docker-compose.yml` (mirror the sticky cookie Secure+SameSite labels); `docker-compose.dokploy.yml:20` (`forwardedHeaders.insecure=true` — document as dev/parity-only; in prod require `MC_TRUSTED_PROXY_CIDRS` or `MC_COOKIE_SECURE=1`); `src/lib/session-cookie.ts:11-14` (gate `x-forwarded-proto` trust behind `MC_TRUSTED_PROXY_CIDRS`, OR require `MC_COOKIE_SECURE=1`); `src/app/api/auth/login/route.ts:59-63`.
- **Acceptance:** (1) the Traefik sticky cookie is set Secure + SameSite=Lax via labels in both compose files; (2) `isRequestSecure` does NOT flip to true on a spoofed `X-Forwarded-Proto` when `forwardedHeaders.insecure=true`, UNLESS the source IP is in `MC_TRUSTED_PROXY_CIDRS` (or `MC_COOKIE_SECURE=1`); (3) D4's `/device` explicitly works under both `__Host-` and legacy cookie names; (4) test: behind parity Traefik with insecure forwarded headers, `isRequestSecure` must NOT flip on a spoofed header from a non-trusted IP; (5) `pnpm test:all` green.
- **Test:** node:test: send `X-Forwarded-Proto: https` from a non-trusted IP with insecure forwarded headers → false; from a trusted CIDR → true; assert the sticky cookie labels include secure + samesite.
- **Risk:** Forcing Secure on the sticky cookie requires HTTPS end-to-end (correct for prod; local HTTP dev needs `MC_COOKIE_SECURE` documented). The trusted-proxy allowlist must be operator-configured.
- **Rollback:** Remove the Secure/SameSite labels; restore unconditional `x-forwarded-proto` trust; document `forwardedHeaders.insecure` as dev-only.

#### I2 — Backup default-on + restore path + restore test  `[P0]`  · depends_on: A0
- **Objective:** `runBackup` (`scheduler.ts:244`) uses the correct SQLite Online Backup API (WAL-safe) but is `defaultEnabled:false`, writes to `.data/backups`, prunes to 10 — but there is ZERO restore path. A cost-recording control plane without a tested restore is not production-operable.
- **Files:** `src/lib/scheduler.ts` (`auto_backup` — flip `defaultEnabled` to true); `docs/deployment.md` (restore procedure: stop the writer, replace `.data/mission-control.db` with the backup, DISCARD `-wal`/`-shm`, restart); `docs/ops-cheatsheet.md` (restore runbook); `scripts/mc-cli.cjs` (add `mc db restore <path>` — stop-the-writer + integrity_check, OR document as a manual cold procedure).
- **Acceptance:** (1) `auto_backup` `defaultEnabled` flipped to true (retention 10); (2) documented restore procedure in `deployment.md` + ops-cheatsheet; (3) either a `mc db restore <path>` CLI verb OR an explicit documented cold-restore runbook; (4) acceptance test: restore from a backup, assert `SELECT COUNT(*)` matches + `PRAGMA integrity_check` ok; (5) tied to A0's durability decision; (6) `pnpm test:all` green.
- **Test:** node:test: take a backup via `runBackup`, restore it (CLI or manual runbook), assert row count matches + `integrity_check` ok.
- **Risk:** A restore is a cold procedure (writer stopped) — document clearly. Restoring the wrong backup loses data written since; the runbook must emphasize verifying the backup timestamp.
- **Rollback:** Flip `auto_backup` back to `defaultEnabled:false`; remove the restore CLI verb/runbook.

---

## 4. Linearized Execution Order (valid topological sort)

**P0 (safety + security + spine — positions 1–24):**
`A0 → A1 → B1a → B3 → B4 → G1 → A2 → A3 → A5 → B2 → A4 → A4b → I1 → I2 → D1 → D2 → D3 → B1b → D4 → D6 → D5 → D7 → G2 → H2`

**P1 (depth + MCP — positions 25–33):**
`C0 → E1 → E2 → E3 → E4 → C1 → C2 → C3 → C4`  *(note: C0 is dependency-free and can start in parallel with the P0 tail — it is placed here only because D5/E3 depend on it; start C0 as early as practical)*

**P2 (truthing — positions 34–35):**
`F1 → F2`

**Critical-path (longest P0→P1 orchestration chain):** `A0 → A1 → G1 → A5 → C2 → C3`. *(Deeper pure-depth chains exist in Track D, e.g. D5 at depth 9; the above is the spine chain.)*

---

## 5. Local-Docker-Parity Test Matrix (proves cloud == local)

Each row is an E2E/integration test run against the local-docker-parity stack (`docker-compose.dokploy.yml` topology, Traefik TLS, sticky affinity) AND a real Dokploy origin — asserting byte-identical behavior.

| # | Claim | Test | Owner |
|---|-------|------|-------|
| T1 | Token persistence across reboot (cold-start no-TTY) | After device login, `docker compose restart` + kill/respawn the stdio shim → reads persisted creds, refreshes with NO human interaction, next call succeeds | D6 |
| T2 | Refresh-on-401 + stolen-token detection | Access near expiry → proactive refresh at expiry−60s; force 401 → single-flight refresh + replay once; re-present a rotated token (`seq<max`) → whole chain revoked + `security.event` critical; third refresh → 401 | D3/D5 |
| T3 | SSE resume after Dokploy redeploy | `mc events watch`, capture lastEventId=N, `docker compose up -d --force-recreate` (drops SSE) → sseStream reconnects with `Last-Event-ID=N`, replays `readServerEventsAfter(N)`, events N+1..N+5 delivered exactly once (dedup on numeric id) | D5 |
| T4 | Revocation propagation (near-real-time + lazy-stdio asymmetry) | Dashboard SSE client + stdio tool both holding valid token; `POST /api/auth/devices/<id>/revoke` → dashboard gets `security.event device.revoked` ≤2s; stdio tool's NEXT call → 401 → `opzava_auth_required` → creds cleared. Document the 8h revoked-but-unexpired window | D2/D4 |
| T5 | Exactly-once mutation (local == cloud) | POST device-token-rotate twice with SAME `Idempotency-Key` → effect once, second `idempotent:true`; twice with DIFFERENT keys → both apply; idempotency cache in SQLite (survives `docker compose restart`) | D3/D5 |
| T6 | Multi-replica rotation CAS (#1 subtle-bug surface) | Two concurrent refreshes of the same `refresh_token_hash` against a two-replica stack → exactly ONE 200 + new tokens, the OTHER 409 `already_rotated`, ZERO family revocations; re-revoke an already-revoked chain → safe no-op | D3 |
| T7 | DB-backed device-flow rate limit (NAT/LB-safe) | 6 rapid wrong user_codes from one IP across two simulated replicas → 429 (DB-backed, not 10/600s) | D4 |
| T8 | Leader-election + lease reclaim | Two replica ticks → exactly one runs `dispatchAssignedTasks`; leader crash → reclaiming replica waits until lock TTL AND lease TTL elapsed before acquiring; a stranded `quality_review` past lease → reclaimed by sweep | G1/A5 |
| T9 | Cross-tenant isolation | A `quality_review`/stale task in workspace 2 → invisible to a workspace-1 writer (runAegisReviews + requeueStaleTasks both filter) | G1 |
| T10 | Transactional capture (all-or-nothing) | Stub logActivity to throw mid-capture → 500 AND no task row; exactly one broadcast per capture; duplicate `client_request_id` → returns existing with `idempotent:true` | A2 |
| T11 | Aegis default-DENY parser | Model reply with embedded 'VERDICT: APPROVED' mid-text → REJECTED; empty → REJECTED; legitimate 'VERDICT: APPROVED\n…' → approved | B2/C1 |
| T12 | Durability + drain | Write+fsync tx, `kill -9`, reopen → row present at chosen synchronous level; SIGTERM during in-flight dispatch → no SQLITE-on-closed-handle; `-wal` bounded after checkpoint | A0/H2 |
| T13 | Backup + restore | `runBackup` → restore (CLI/manual) → `SELECT COUNT(*)` matches + `integrity_check` ok | I2 |
| T14 | Cookie/TLS hardening | `X-Forwarded-Proto: https` from non-trusted IP with insecure forwarded headers → `isRequestSecure` false; trusted CIDR → true; sticky cookie Secure+SameSite | I1 |
| T15 | Redaction governance | No log path emits raw `mc_dt_`/`mc_rt_`/`device_code`; negative control: add `console.log(mc_dt_…)` → test fails | D7 |
| T16 | MCP runtime contract | Spawn stdio → initialize/tools.list/tools.call work; `notifications/cancelled` aborts in-flight fetch; per-tool timeout returns route-context error; CLI cron verbs map to route actions | E1/E3/E4 |

---

## 6. Risk Register (top risks, ordered)

1. **Multi-replica refresh-token rotation race** (D3) — the #1 subtle-bug surface behind Traefik sticky sessions (a performance hint, not a correctness guarantee). Mitigation: DB conditional UPDATE as the lock + `rotation_seq` disambiguation + the concurrency test T6.
2. **`aegis_unavailable` silent dead-zone** (A3) — the new terminal state recreates the theme-3 dead-zone WITHOUT the status-query audit. Mitigation: the audit enumerates every status query; reclamation wired.
3. **8h revoked-but-unexpired access-token window** (D2/D4) — stdio revocation is lazy (next-call 401). Mitigation: 8h bound + near-real-time `security.event` broadcast; `MC_DEVICE_INSTANT_REVOKE=1` denylist for instant kill.
4. **Graceful-drain / SIGTERM coordination** (H2) — three conflicting SIGTERM handlers can close the DB before an in-flight dispatch finishes. Mitigation: canonical ordering (dispatch → server.close → closeDatabase LAST).
5. **Cost attribution silently lost** (A4/A4b) — `recordUsage` runs outside any transaction and swallows errors today. Mitigation: `INSERT OR IGNORE` idempotency + the cost populate + warn-log.
6. **Prompt-injection into Aegis + dispatch** (B2) — untrusted task content interpolated into the review prompt + `soul_content` as system prompt. Mitigation: structural VERDICT match + default-DENY + `soul_content` fencing (B1a/B3).
7. **Pinning `OPENCLAW_GATEWAY_IMAGE` to a digest** (F2) — blocks security updates until manually bumped. Mitigation: documented bump cadence in ops-cheatsheet.
8. **Redaction is discipline, not enforcement** (D7) — `logger.ts` has NO auto-redaction. Mitigation: governance test + `redactToken()` helper + `/security-review`.
9. **Deferred HTTP-MCP / hosted multi-user** (D-1) — stdio-only now means a shared/cloud Opzava serving per-user browser-driven OAuth is a separate future effort. Mitigation: `audience` column reserved + grant-type-agnostic token endpoint from day one.
10. **Full-jitter requirement** (D5) — jitter MUST be full (`random[0, base×2^attempt]`), not equal-jitter, because all 7 clients share one origin and herd on a Dokploy redeploy. Mitigation: pinned in the resilient-http module.

---

## 7. Rollback Runbook (reverse-linearized)

Each task ships with a one-line rollback (in §3). System-level, reverse the linearized order: **P2 → P1 → P0**. Two invariant notes:
- **Migrations are forward-only-safe** by design (columns nullable, tables new with no inbound refs) — rollback is `DELETE FROM schema_migrations WHERE id='<id>'` + ignore the columns/tables. No destructive migration is in this plan.
- **A0/A5/G1 rollback restores the pre-fix state** (non-transactional, lease-less, multi-writer) — only do this if a P0 task blocks; the stuck-task / double-dispatch behaviors return and are detectable by C3's `listStuckTasks()`.

---

## 8. Glossary (codebase-design terms)

- **Module** — anything with an interface + implementation (function/class/package/slice).
- **Interface** — everything a caller must know to use the module correctly (types + invariants + ordering + errors + config + perf).
- **Depth** — behaviour per unit of interface a caller must learn. **Deep** = lots behind a small interface.
- **Seam** — where you can alter behaviour without editing in that place.
- **Adapter** — a concrete thing satisfying an interface at a seam. *One adapter = hypothetical seam; two adapters = real seam.*
- **God-module** — a module holding many responsibilities behind one file (e.g. `task-dispatch.ts` at 1753 lines).
- **Dead surface** — defined but unreached code (e.g. the mock-only content workflow, dead `WorkflowRun`/`StepRun`).
- **Leaked implementation** — an implementation detail crossing the interface (e.g. `soul_content` as raw system prompt; `workspaceId ?? 1` default).
- **TOCTOU** — time-of-check-to-time-of-use race (e.g. the read-modify-write `dispatch_attempts`).
- **Fused change** — two concerns that MUST land together (e.g. principal-binding + `resolveDeviceToken`).
- **Hard gate** — an enforced precondition (e.g. `hasAegisApproval` on PATCH→done).

---

## 9. How to Execute (discipline)

- **TDD red-green-refactor** for every task (tests first; the AC list IS the test spec).
- **Tiny Conventional Commits** — one task = one commit (`feat:`/`fix:`/`test:`/`refactor:`/`docs:`/`chore:`). **Never** `Co-Authored-By` or AI-attribution trailers (repo rule, enforced by governance).
- **Branch strategy** — work off `main`; this plan is large enough to warrant a long-lived `feat/orchestration-hardening` branch with PRs per track, OR per-task PRs into a staging branch. Prefer per-track PRs so each track reviews independently.
- **Gate** — `pnpm test:all` (lint + typecheck + test + build + e2e + governance) MUST be green before merge. `api:parity` runs FIRST in `test:all` — every new route needs an openapi spec (D7).
- **Code-wins-over-docs** — verify every `file:line` against HEAD before citing; correct stale citations in a follow-up commit.
- **ARD obligations** — ARD 0011's durability section is a PLACEHOLDER to be filled when A0 lands (record the synchronous-level decision + rationale); ARD 0012 is the device-auth contract referenced by Track D.
- **pnpm only** (no npm/yarn); rebuild `better-sqlite3` when switching Node versions; standalone is `node .next/standalone/server.js`.

---

## 10. Open questions (safe defaults ship; NOT blockers)

1. **8h access-token TTL tolerance** (D-3) — a stolen access token is honored up to 8h minus 60s skew after an operator clicks 'revoke'. Engineering default (8h + near-real-time broadcast) ships as decided; operators who demand instant kill have the documented `MC_DEVICE_INSTANT_REVOKE=1` opt-in denylist (per-request DB hit). *The one product/policy tolerance genuinely benefiting from human sign-off; the knob makes the trade-off explicit.*
2. **synchronous level choice** (A0) — `synchronous=NORMAL` (+ A2 transactional spine + mandatory wal_checkpoint) vs `FULL`. Recommendation: FULL for a control plane that records costs (low write volume absorbs the ~2x cost), benchmark-gated. Default if unconfirmed: keep NORMAL + wal_checkpoint, document the residual crash-window. A0 is sequenced at the FRONT so A2–A4 build against a known contract.
3. **leader-lock + lease TTL values** (G1) — CORRECT invariant is **lock TTL < lease TTL** (lock 90s, lease 10min). The operator's deploy cadence (how fast replicas roll) should confirm the values are neither too short (flapping leadership) nor too long (extended downtime after a crash).

---
status: Approved
date: 2026-06-24
supersedes: docs/architecture/system-map/91-remediation-plan.md
title: Orchestration Hardening — Master Remediation Plan
owners: Opzava platform
ard_refs: [0011, 0012]
---

# Orchestration Hardening — Master Remediation Plan

This is the single source of truth an engineer executes from. It fuses a 33-finding adversarial review (orchestration/dispatch, task capture, Aegis quality gate, MCP server, 7-client connectivity, security, dual-engine deep-read) with a hardened RFC 8628 device-authorization design, then closes every residual gap surfaced by a second-round completeness/integration/red-team grilling. Every task cites **file:line verified against the current repo** (code wins over docs), lists `depends_on`, measurable acceptance criteria, a test, a risk, and a one-line rollback.

> **Reading order for an executor:** Executive Summary → Resolved Decisions → Linearized Execution Order (the schedule) → the Track of the task you picked → Risk Register / Rollback Runbook / Glossary as reference.

---

## 1. Executive Summary — the architecture verdict

The Mission Control / Opzava orchestrator is **functionally coherent for a single-replica, single-writer deployment but structurally unsound as the "horizontally-scalable AI operations control plane" `CLAUDE.md` mandates.** Three load-bearing defects compound:

1. **The write spine is not transactional and not lease-governed.** Every status transition in `tasks/route.ts` (capture) and `task-dispatch.ts` (claim, promote, Aegis revert, stale-requeue) is an autocommit statement with side effects (broadcasts, notifications, `logActivity`, `recordUsage`) firing as separate statements after the commit. The chat route is the lone counter-example (one `BEGIN IMMEDIATE`). `synchronous=NORMAL` (db.ts:53) means even committed autocommits may not survive a crash, so transactions are necessary but not sufficient without a durability decision. The graceful drain (mc-server.cjs) closes HTTP + PTY but never awaits in-flight dispatch.

2. **A single `dispatch_attempts` column is shared across three state machines** (dispatch-failure cap 5, Aegis-rejection cap 3, Aegis-error no-cap), mutated by a read-modify-write TOCTOU, never reset on success — and there is **no lease on `in_progress` or `quality_review`**, so claimed-but-abandoned tasks leak and `quality_review` is a dead-zone invisible to every worker.

3. **The horizontal-scale mandate is structurally impossible** over single-writer SQLite with an in-process scheduler (scheduler.ts:498 bare `setInterval`) and no leader election. At 2 replicas the dispatch TOCTOU becomes a **guaranteed** double-dispatch every tick. The same uncoordinated scheduler triggers nearly every other finding on the routine event of a rolling-deploy or OOM, not an edge case.

The remediation backbone has three load-bearing moves: **(1)** make the write spine transactional and lease-governed (Track A); **(2)** add a principal-binding seam so operator-scoped keys cannot mutate other agents/tasks, and ship device auth with the same authz path (Tracks B + D, fused at the `getUserFromRequest` cascade); **(3)** decide the single-active-writer-vs-Postgres question explicitly (Track G) so the horizontal-scale mandate stops being aspirational.

**Cost attribution — the product's reason-to-exist — is structurally broken** (a Grill-2 catch folded into Track A): `recordUsage` (task-dispatch.ts:635) writes `cost = 0` hardcoded, and the read API's `cost ?? calculateTokenCost(...)` fallback can never fire because `0` is not nullish, so every `token_usage` row reports $0.00. This plan fixes it as **A4b** (correct writer + backfill), not just A4's dedup.

### Net plan shape

- **8 tracks (A–H) + Dokploy operability (I)**, **35 tasks** (A0–A5, A4b; B1a, B1b, B2–B4; C0–C4; D1–D7; E1–E4; F1–F2; G1–G2; H2; I1–I2).
- **Priority bands:** P0 = A (write-spine/lease), B (security/principal-binding), D (device auth), G (single-active-writer + cross-tenant), H (durability/drain), I (Dokploy). P1 = C (deep refactors), E (MCP). P2 = F (client truthing).
- **5 new migrations:** `055` (A1 counters/lease/idempotency), `056` (B2 quality_reviews.source), `057` (A4 token_usage idempotency), `058` (D1 device tables + denylist), `059` (D1.5 revoked_access_tokens denylist, or folded into 058 — resolved in D1), `opzava_runner_004` (C3 task_id FK).

---

## 2. Resolved Decisions (FINAL — do not re-litigate)

| Decision | Resolution | Consequence |
|---|---|---|
| **transport** | **stdio-only now.** MCP 2025-06-18: stdio servers SHOULD NOT follow the auth spec. HTTP-MCP (RFC 9728+8414+7591+PKCE+8707) deferred as **additive**, future state, **NOT P0**. The token endpoint is **grant-type-agnostic from day one**; `device_tokens.audience` column reserved now. | Device auth ships for the stdio MCP shim + CLI; no HTTP-MCP server in scope. |
| **localTokenStore** | **0o600 plaintext local file** + **OPTIONAL `OPZAVA_TOKEN_ENC_KEY`** envelope encryption (fallback `AUTH_SECRET`). The explicit plaintext opt-in is **`OPZAVA_INSECURE_STORAGE`** (default unset). **No passphrase** (headless stdio shim has no TTY). **No keytar/libsecret** (breaks Docker parity + standalone binary contract). | `OPZAVA_INSECURE_STORAGE=1` must be set to opt into plaintext; otherwise envelope-encrypted. Atomic temp+rename in the same dir as target. |
| **accessTtl** | **8h access / 30d rotating refresh** (RFC 6749 §10.4 reuse detection). **60s server-skew grace** on access; **zero grace** on the 30d refresh cap. OPTIONAL **`MC_DEVICE_INSTANT_REVOKE=1`** denylist knob so the 8h revoked-but-unexpired window has an operable kill-switch (honors the default — opt-in, never default-on). | Resolved + hardened: revocation is **chain-level by default** (red-team catch), not row-level. |
| **horizontalScale** | **Single-active-writer now** via a leader-election/advisory-lock seam so only one replica scheduler runs the dispatch chain. Postgres (ARD 0006) tracked as **future state, NOT P0**. Reframe `CLAUDE.md` honestly. Remove `workspaceId ?? 1`; thread explicit `workspaceId` through `runAegisReviews` AND `requeueStaleTasks` AND add a **workspace-iteration loop** in the scheduler tick (Grill-2 multi-tenancy fix). | **Correct invariant: lock TTL < lease TTL** (v1 had it inverted). Documented single-active-writer. |
| **fusePoint** | The principal-binding authz seam (B1a) and `resolveDeviceToken` (B1b) land in the **same `getUserFromRequest` cascade change** — device tokens are principal-bound + scope-derived from day one. Split into **B1a** (no device dep) + **B1b** (depends_on D2) to kill the latent circular dep. | Device tokens and agent-scoped keys share one authz path; indistinguishable to the authz layer. |
| **orchestratorUnification** | Make `src/opzava/platform/runner` the canonical execution path for all 3 engines: generalize `createJobKindExecutor` to register task-dispatch + content-step kinds alongside campaign-send; task-dispatch enqueues instead of executing inline; add the missing `task_id` FK + a read-only stuck-task detector. **Sequenced as multi-phase Track C, gated BEHIND Track A/B**, not P0. | Track C runs last; the live `WorkflowRun`/`listRecentWorkflowRuns` surface is preserved. |
| **durability (A0, made GATING)** | `synchronous` level is decided and locked **before** the lease/lock are armed (A0 runs first). **Default if unconfirmed: keep `synchronous=NORMAL` + a mandatory default-on `wal_checkpoint` — but ONLY after a documented kill-test proves the lease/lock rows survive a crash.** If the kill-test fails, force `FULL`. (Grill-2/red-team: NORMAL with new high-frequency lease/lock writes is a P0 durability gate.) | No Track A/G/H ships until A0's kill-test passes or FULL is set. |
| **multi-tenancy (Grill-2)** | The global scheduler iterates `listWorkspaces()`; the dispatch/aegis/requeue handlers run once per workspace. `workspaceId` is never defaulted on the scheduler path. | A task in workspace 2 is reviewed/requeued/reconciled by the scheduler; no throw, no single-workship-only scheduling. |

### ARD / migration numbering (FINAL)

| Item | ID / value |
|---|---|
| Orchestrator ARD | `0011` → `docs/ard/0011-single-orchestrator-execution-model.md` |
| Device-auth ARD | `0012` → `docs/ard/0012-device-authorization.md` |
| Next main migration | `055` (A1); then `056` (B2), `057` (A4), `058` (D1), `059` (D1 denylist, or folded) |
| Runner migration | `opzava_runner_004` (C3) |
| Existing ARDs | `0001`–`0010` (`0006`=postgres-compat, `0007`=engine-separation, `0008`=secret-storage, `0009`=realtime-chat, `0010`=layering-realignment) |
| New core dirs | `src/opzava/core/auth` + `src/opzava/core/reviews` to be created |

---

## 3. Tracks A–I

### Track A — Orchestration correctness, write-spine safety & the ARMED lease

**Goal.** Make the task write-spine transactional, lease-governed (`claimed_at` ARMED at all three claim sites, not merely declared), idempotent, split the shared counter into three atomic-guarded budgets, make cost-attribution idempotent **and non-zero** (A4 + A4b), reclaim the `quality_review` dead-zone, and decide+lock durability up front. **Priority band: P0.**

---

#### A0 — Durability decision + mandatory default-on `wal_checkpoint` (foundation for A2–A4; HARD GATE for A5/G1/H2)

**Objective.** Move the `synchronous`-level DECISION to the front of the track. Verified: `src/lib/db.ts:53` sets `synchronous = NORMAL`; `:52` `journal_mode=WAL`; `:58` `busy_timeout=5000`; `:56` `foreign_keys=ON`. `src/lib` has **ZERO** `wal_checkpoint` statements today and `auto_backup` is `defaultEnabled:false` (scheduler.ts:88). The checkpoint is therefore mandatory, not optional. **This task is a hard gate: A5/G1/H2 must NOT ship until A0's kill-test passes (or FULL is set).**

**Files.**
- `src/lib/db.ts:53` (`PRAGMA synchronous = NORMAL` — decision target), `:52` (journal_mode=WAL), `:58` (busy_timeout=5000)
- `src/lib/scheduler.ts` (add a `SCHEDULED_TASKS` entry `wal_checkpoint` alongside `auto_cleanup` at `:83`+)
- `docs/ard/0011-single-orchestrator-execution-model.md` (record decision + rationale)

**Depends_on.** `[]`

**Acceptance criteria.**
1. Documented decision in ARD 0011: keep `synchronous=NORMAL` (with the A2 transactional spine) **OR** upgrade to `FULL`, with rationale. Default if unconfirmed: keep NORMAL + the `wal_checkpoint` closes the residual crash-window.
2. New scheduler task `wal_checkpoint` is `defaultEnabled:true`: `PRAGMA wal_checkpoint(PASSIVE)` every 5–15min (non-blocking) and `PRAGMA wal_checkpoint(TRUNCATE)` in the off-peak cleanup window.
3. A forced `TRUNCATE` reduces the `-wal` file to near-zero; a 24h soak with `auto_backup` off shows the WAL stays bounded.
4. The G1 leader-heartbeat write is accounted in the checkpoint cadence.
5. **KILL-TEST (P0 gate, Grill-2/red-team):** write a `claimed_at` row inside a `db.transaction`, `kill -9` the process, reopen the db, assert the row is present under the chosen `synchronous` level. If it is absent under NORMAL, set `FULL` and re-run. Record the result in ARD 0011. No A5/G1/H2 task may merge until this passes.
6. `pnpm test:all` green.

**Test.** Node: run a write workload, force `wal_checkpoint(TRUNCATE)`, assert `-wal` drops near-zero. Crash test: write+fsync a tx, `kill -9`, reopen, assert the row present under the chosen synchronous level.

**Risk.** `FULL` roughly halves write throughput; benchmark before committing the FULL upgrade (the decision is gated but FULL is benchmark-confirmed). `TRUNCATE` briefly blocks writers — keep off-peak. The kill-test is load-bearing: NORMAL + the new lease/lock writes is the single biggest durability risk in the plan.

**Rollback.** Restore `synchronous=NORMAL`-only; remove the `wal_checkpoint` task. The decision doc records the trade-off either way; the kill-test result stays.

---

#### A1 — Migration 055: split `dispatch_attempts` into 3 counters + `claimed_at` + `client_request_id`

**Objective.** Append migration id `055_task_counters_lease_idempotency` to the `migrations` array. Verified: migration `054_messages_client_message_id` closes the array — the array's closing `]` is at `src/lib/migrations.ts:1501` (digest cited 1499; actual is 1501), and `runMigrations` iterates `[...migrations, ...extraMigrations]` at `:1507`. Add `review_attempts`, `aegis_error_count`, `aegis_error_not_before`, `claimed_at`, `client_request_id` + a partial-unique-index. Idempotent (PRAGMA guard mirroring 054 at `:1484-1486`) and multi-replica-safe (schema_migrations PK dedupes; the tx-wrapped loop at `:1512-1514`).

**Files.**
- `src/lib/migrations.ts` (append a new migration object literal before the closing `]` at `:1501`; PRAGMA `table_info(tasks)` guard + `ALTER ADD COLUMN` mirroring 054 at `:1484-1486`)
- `src/lib/schema.sql` (document new `tasks` columns)
- `src/app/api/tasks/route.ts` (createTask sets `client_request_id`)
- `src/opzava/platform/runner/migrations.ts` (reference only — the A1 governance test must import `getOpzavaRunnerMigrations()` directly, see test below)

**Depends_on.** `[A0]`

**Acceptance criteria.**
1. Migration id `055_task_counters_lease_idempotency` appended; id is globally unique vs every id in `migrations[]`, `extraMigrations[]` **AND** `getOpzavaRunnerMigrations()` (opzava_runner_001/002/003 today).
2. Partial unique index `idx_tasks_client_request_id ON tasks(workspace_id, client_request_id) WHERE client_request_id IS NOT NULL` (mirror `migrations.ts:1493-1495`).
3. `claimed_at INTEGER`, `aegis_error_not_before INTEGER`, `review_attempts`/`aegis_error_count` `INTEGER` added (all nullable/default 0).
4. Multi-replica cold-start: two replicas against the same fresh `.data` both attempt 055 — exactly one applies it.
5. **NEW governance test `test/migration-ids-unique.test.mjs` (node:test):** loads `migrations` + `extraMigrations` **and explicitly imports `getOpzavaRunnerMigrations` from `src/opzava/platform/runner/migrations`** (do NOT rely on the side-effecting `registerOpzavaRunnerMigrations()` firing under node:test — Grill-2 catch), and asserts no two ids collide. This single test guards A1(055)/B2(056)/A4(057)/D1(058/059)/C3(opzava_runner_004).
6. `pnpm test:all` green on fresh `.data/` and `.data/` with 054 applied.

**Test.** Vitest: apply 055 to in-memory db, assert columns exist; the partial unique index rejects a duplicate `(workspace_id, client_request_id)` and accepts NULL duplicates; re-run → no error. The governance test asserts `055` ≠ every other id including runner ids.

**Risk.** `ALTER ADD COLUMN` is O(n) under WAL; deploy off-peak. PRAGMA guard prevents double-add. Multi-replica cold-start is safe by the existing tx-wrapped loop but now an explicit AC.

**Rollback.** `DELETE FROM schema_migrations WHERE id='055_task_counters_lease_idempotency'`; columns are nullable so legacy `?? 0` reads keep working.


---

#### A2 — Transactional write spine + FULL idempotency idiom (SELECT-first-then-return-existing)

**Objective.** Wrap capture + claim + Aegis revert + side effects in ONE `db.transaction`; broadcast once after commit. The idempotency idiom is the FULL chat route pattern (SELECT-first, return existing with `idempotent:true` on `SQLITE_CONSTRAINT_UNIQUE`), not just the partial unique index. Verified precedent: `src/app/api/chat/messages/route.ts:478-501` (SELECT-first, return existing `idempotent:true`).

**Files.**
- `src/app/api/tasks/route.ts` (createTaskTx commits only counter+INSERT; `logActivity`/subscriptions/notifications/broadcast are post-tx autocommits — fold into ONE `db.transaction`)
- `src/lib/task-dispatch.ts:1133` (Aegis revert — unguarded `UPDATE` at `:1134` → `:1135`, verified no status guard) → guarded conditional `UPDATE WHERE status='quality_review'` inside the same tx
- `src/app/api/chat/messages/route.ts:478-501` (the runtime idempotency precedent)

**Depends_on.** `[A1]`

**Acceptance criteria.**
1. POST `/api/tasks` capture: counter increment + INSERT + `logActivity` + `ensureTaskSubscription` + `createNotification` in ONE `db.transaction`; broadcast once after commit.
2. Aegis error revert (`:1134`) is a guarded conditional `UPDATE WHERE status='quality_review'` inside the same tx as the error-record write.
3. Duplicate `client_request_id`: guarded INSERT; on `SQLITE_CONSTRAINT_UNIQUE`, SELECT the existing task and return it with `idempotent:true` (mirror chat/messages/route.ts:486-500) — never a 500.
4. No autocommit statement remains between a status-flip UPDATE and its dependent writes.
5. Unit test: throwing `logActivity` → 500 AND no task row (all-or-nothing).
6. `pnpm test:all` green.

**Test.** Vitest: stub `logActivity` to throw → 500 + no task row. Assert exactly one broadcast per capture. Capture twice with same `client_request_id` → second returns first task with `idempotent:true` (no 500, no dup).

**Risk.** `BEGIN IMMEDIATE` across the notification INSERT lengthens lock hold; keep the tx body tight (no external HTTP inside — broadcasts/gateway stay outside). `busy_timeout=5000` absorbs contention.

**Rollback.** Revert the tx-wrapping; autocommit restored. A1 columns remain forward-compatible.

---

#### A3 — Atomic guarded counters + reset-on-phase-transition + Aegis-error backoff WITH the ENFORCED status-query audit for `aegis_unavailable`

**Objective.** Replace the three read-modify-write counter sites with atomic conditional `UPDATE ... WHERE id=? AND status=?` branching on `.changes`; route Aegis model-errors to a bounded `aegis_unavailable` terminal. Verified sites: Aegis-reject SELECT-then-UPDATE at `:1077-1097` (uses shared `dispatch_attempts`, cap 3); the Aegis error unguarded revert at `:1133-1143`; the stale-requeue counter at `:1198`. **CRITICAL (red-team/Grill-2): the status-query audit MUST be an enforced governance test, not prose** — without it `aegis_unavailable` recreates theme-3 by construction.

> **Shared-edit NOTE (Grill-2 integration gap):** A3, A5, and G1 **all edit `requeueStaleTasks`** (`task-dispatch.ts:1162-1176` SELECT + WHERE clause). They MUST be applied in linearized order (G1 first threads `workspaceId` into the WHERE; A3's audit classifies the query; A5 then extends the WHERE to `status IN ('in_progress','quality_review') AND claimed_at < now - lease`). Do not parallelize these three on the same function — see the Linearized Execution Order.

**Files.**
- `src/lib/task-dispatch.ts:1077-1097` (Aegis-reject) → `review_attempts` guarded UPDATE
- `src/lib/task-dispatch.ts:1541-1562` (dispatch-fail) → `dispatch_attempts` guarded UPDATE
- `src/lib/task-dispatch.ts:1133-1143` (Aegis error unguarded revert) → `aegis_error_count` + `aegis_error_not_before` + `'aegis_unavailable'`
- `src/lib/task-dispatch.ts:1198` (stale-requeue counter)
- `NEW test/status-discriminating-query-audit.test.mjs` (enforced audit — see below)

**Depends_on.** `[A1]`

**Acceptance criteria.**
1. All three counter sites use `UPDATE tasks SET <counter>=<counter>+1 WHERE id=? AND status=?` branching on `.changes===0` (extend the verified claim pattern at `:1288` dispatch / `:1005` Aegis).
2. Aegis-reject increments `review_attempts` (cap 3→failed); dispatch-fail increments `dispatch_attempts` (cap 5→failed); Aegis-error increments `aegis_error_count` + `aegis_error_not_before=now+backoff` → `'aegis_unavailable'`.
3. **ENFORCED STATUS-QUERY AUDIT (red-team fix):** `test/status-discriminating-query-audit.test.mjs` greps `src/` for every SQL statement touching the `tasks` table that filters on `status`, and asserts each WHERE clause either (a) explicitly handles `aegis_unavailable`, OR (b) is on an allowlist of queries that legitimately exclude it (e.g. `isCompletionStatus`). The test FAILS if a new status-discriminating query is added without handling `aegis_unavailable`. At minimum the audit confirms: `requeueStaleTasks` (A5), `runAegisReviews` (re-selects `aegis_unavailable` past backoff → flips back to review), `isCompletionStatus` excludes it, UI status filter includes it.
4. On `assigned→in_progress` the dispatch budget resets to 0 (guarded in the same UPDATE); on success all counters reset.
5. Concurrency test: two simultaneous increments → exactly +2 (no lost update).
6. `pnpm test:all` green.

**Test.** Vitest concurrency: two async increments → final === initial+2. Unit: `review_attempts=3` reject path → failed. Audit test: `requeueStaleTasks` + `runAegisReviews` reclaim `aegis_unavailable` past backoff.

**Risk.** `aegis_unavailable` is the #1 silent-dead-zone risk WITHOUT the enforced audit — it recreates theme-3. The governance test is the only thing that prevents regression. Document the split + reclamation in the task lifecycle doc and ops-cheatsheet.

**Rollback.** Revert to the single shared `dispatch_attempts` column; new columns default NULL/0 so legacy `?? 0` reads work; flip `aegis_unavailable` rows back to `review` manually. Keep the audit test (it is harmless on the old schema).


---

#### A4 — Migration 057: `token_usage` idempotency_key (CORRECTED — `workspace_id` already exists)

**Objective.** **Premise CORRECTED (Grill-2/red-team factual error):** the original spec claimed `token_usage` has neither `idempotency_key` nor `workspace_id`. Verified: migration `023_workspace_isolation_phase3` (`src/lib/migrations.ts:674`, scoped `token_usage` + index at `:684`) **already adds `workspace_id`**; migration `025_token_usage_task_attribution` (`:777`) **already adds `task_id`** + `idx_token_usage_workspace_task_time` (`:781`); a later migration (`:1213`) already adds `cost_usd`. So migration 057 adds **ONLY `idempotency_key TEXT`** + a partial unique index. `recordUsage` uses `INSERT OR IGNORE` keyed on the existing columns + the new key.

**Files.**
- `src/lib/migrations.ts` (append migration id `057_token_usage_idempotency` — PRAGMA guard, add **`idempotency_key TEXT` only**; partial unique index `idx_token_usage_idempotency ON token_usage(workspace_id, task_id, session_id, model, idempotency_key) WHERE idempotency_key IS NOT NULL`)
- `src/lib/task-dispatch.ts:614-638` (`recordUsage` autocommit INSERT swallows at `:637`) → `INSERT OR IGNORE` + warn-log
- `src/lib/task-dispatch.ts:692-693` / `:822-823` / `:874-875` (call sites — pass a deterministic idempotency_key)

**Depends_on.** `[A2]`

**Acceptance criteria.**
1. Migration 057 adds **`idempotency_key TEXT` only** (NOT `workspace_id` — it exists since migration 023, `:674`); id globally unique (governance test from A1).
2. `recordUsage` writes `idempotency_key` + `workspace_id` (already available) and uses `INSERT OR IGNORE` so a retried dispatch de-dupes (exactly one row).
3. The catch (`:637`) no longer silently swallows — logs at warn with `{task_id, model, session_id}`.
4. An Aegis-rejected-then-re-dispatched task does not double-count for the same `(task, session, model)` tuple.
5. Test: `recordUsage` twice with the same key → one row; injected thrown error → warn log.
6. `pnpm test:all` green.

**Test.** Vitest: `recordUsage` twice with same key → one `token_usage` row. Inject thrown error → warn log (not silent).

**Risk.** The idempotency_key must be deterministic (`task_id + session_id + model + per-dispatch nonce`) so a retry produces the SAME key. Prefer `INSERT OR IGNORE` to avoid lengthening the dispatch tx lock.

**Rollback.** Revert `recordUsage` to autocommit + silent catch; the column is nullable and ignored by legacy reads.

---

#### A4b — Fix the cost-attribution subsystem: `recordUsage` writes real cost + backfill zero rows (Grill-2 CRITICAL catch)

**Objective.** **This is the largest substantive gap in the whole package.** Verified: `recordUsage` (`src/lib/task-dispatch.ts:635`, the 6th positional INSERT arg) writes `cost = 0` **hardcoded, always** — the comment at `:610-612` even says "cost is left to 0 — it is calculated separately downstream." The read API `src/app/api/tokens/route.ts` does `Number(record.cost ?? calculateTokenCost(...))` but **`0` is not nullish**, so the stored 0 short-circuits the pricing fallback and EVERY `token_usage` row reports $0.00. `agent-optimizer.ts` SUMs `cost_usd` which no writer populates (only `runs.ts` writes `cost_usd`, a different table). The product is a cost-attribution control plane that reports all zeros. A4 adds the idempotency_key (dedup) but never observes the zero-cost bug.

**Files.**
- `src/lib/task-dispatch.ts:614-638` (`recordUsage` — call `calculateTokenCost(model, inputTokens, outputTokens)` from `src/lib/token-pricing.ts`, the SoT per `src/lib/model-config.ts:12`, and write the real `cost` + `cost_usd`)
- `src/lib/migrations.ts` (append migration id `060_token_usage_cost_backfill` — `UPDATE token_usage SET cost = <recompute>, cost_usd = cost WHERE cost = 0 OR cost IS NULL`, run inside `up()`; guarded so it only backfills zero/null rows)
- `src/app/api/tokens/route.ts` (the nullish-fallback read path — keep as defensive; the WRITER is now correct)
- `src/lib/token-pricing.ts`, `src/lib/model-config.ts` (reference only)

**Depends_on.** `[A4]`

**Acceptance criteria.**
1. `recordUsage` calls `calculateTokenCost(model, inputTokens, outputTokens)` and writes the computed `cost` AND `cost_usd` (no hardcoded 0).
2. A `recordUsage` write for a known-priced model produces `cost > 0` in the DB.
3. Migration `060_token_usage_cost_backfill` recomputes `cost`/`cost_usd` for rows where `cost = 0 OR cost IS NULL`, inside `up()`.
4. `GET /api/tokens` returns non-zero cost for a priced-model dispatch (integration test).
5. Unpriced/unknown models still write a row (cost 0 is valid when the model is genuinely unpriced — distinguish "0 because unpriced" from "0 because of the bug" by checking the model is in the pricing table).
6. Test: stub a known-priced model, assert `cost>0` in DB and API.
7. `pnpm test:all` green.

**Test.** Vitest: stub a model priced at $X/Mtok, dispatch, assert `token_usage.cost > 0`. Migration test: seed a `cost=0` row for a priced model, run 060, assert `cost>0`. API test: `GET /api/tokens` returns non-zero.

**Risk.** Backfill is O(n) on `token_usage`; run off-peak. The defensive read-API fallback stays (cost===0 for a genuinely-unpriced model is legitimate); the writer-trusted + correct-writer model is chosen.

**Rollback.** Revert `recordUsage` to `cost=0`; the backfill migration is harmless to reverse (cost columns remain).

---

#### A5 — ARM THE LEASE: stamp `claimed_at` at ALL THREE claim sites + reclaim `quality_review` + guarded completion write (slow-tick split-brain fix)

**Objective.** v1 declared `claimed_at` but NO site stamps it and NO task reclaims `quality_review`, so `claimed_at` is permanently NULL and theme-3 persists. v2 stamps `claimed_at` at ALL THREE claim sites (verified: `dispatchAssignedTasks` `:1288`, Aegis `:1005`, AND the polling-queue claim `src/app/api/tasks/queue/route.ts:117` — v1 missed the third), extends `requeueStaleTasks` to reclaim `quality_review` past lease, and adds a startup sweep. **RED-TEAM ADDITION (critical): the post-provider resolution write (`task-dispatch.ts:1495`) has NO `AND status='in_progress' AND claimed_at=?` guard — a deposed leader's slow provider call can clobber the reclaiming leader's task. Guard the completion write by re-checking the lease.**

**Files.**
- `src/lib/task-dispatch.ts:1288` (dispatchAssignedTasks claim `SET status='in_progress'` — ADD `claimed_at=clock.now()`)
- `src/lib/task-dispatch.ts:1005` (Aegis claim `SET status='quality_review'` — ADD `claimed_at`)
- `src/app/api/tasks/queue/route.ts:117` (polling-queue claim `UPDATE ... SET status='in_progress'` — ADD `claimed_at`; the third site v1 missed)
- `src/lib/task-dispatch.ts:1162-1176` (`requeueStaleTasks` SELECT — change `WHERE t.status='in_progress'` to `status IN ('in_progress','quality_review') AND claimed_at < now - lease`; composes with G1's `workspace_id` filter)
- `src/lib/scheduler.ts` startup (sweep: `UPDATE tasks SET status='review', claimed_at=NULL WHERE status='quality_review' AND claimed_at < now - lease`)
- `src/lib/task-dispatch.ts:1495` (resolution/completion write — ADD `AND status='in_progress' AND claimed_at=?` guard; `changes===0` → discard/log, do NOT clobber)

**Depends_on.** `[A1, A3, G1]`  *(G1 added: A5's WHERE-clause change composes with G1's workspace filter on the same SELECT — Grill-2 coupling.)*

**Acceptance criteria.**
1. All THREE claim UPDATEs set `claimed_at=clock.now()` inside their guarded tx.
2. After a claim, `SELECT claimed_at` is non-null recent (all three sites).
3. `requeueStaleTasks` reclaims BOTH `in_progress` AND `quality_review` past lease (decoupled from flaky `agents.status`).
4. Startup sweep flips `quality_review` past lease back to `review` on writer boot.
5. The `quality_review` dead-zone is CLOSED: a stranded task past lease is reclaimed by sweep/requeue, not invisible.
6. `listStuckTasks` (C3) returns a `quality_review` row whose `claimed_at` is older than lease — POPULATED, not empty.
7. **SLOW-TICK SPLIT-BRAIN FIX (red-team):** the resolution write (`:1495`) and completion/comment writes are guarded `WHERE id=? AND status='in_progress' AND claimed_at=?`; `changes===0` → the slow provider call's result is discarded + logged (the reclaiming leader owns the task). Test: stub a 15s provider call, expire the 10s lease mid-call, reclaim + redispatch on leader B, let A's call return → A's write is a no-op.
8. **CROSS-TASK INVARIANT (Grill-2):** a test asserts `LEASE_TTL_MS > LOCK_TTL_MS` (e.g. `600000 > 90000`) reading both constants from their modules/config; fails if the relationship inverts. (Lives here AND in G1.)
9. `pnpm test:all` green.

**Test.** Vitest: claim at all three sites → `claimed_at` non-null. Seed `quality_review claimed_at=now-20min` → sweep/requeue flips to `review`. Seed within lease → excluded. Slow-tick: 15s provider + 10s lease → A's late write is a no-op. Invariant test: `LEASE_TTL_MS > LOCK_TTL_MS`.

**Risk.** The polling-queue claim (`tasks/queue/route.ts:117`) is the easily-missed third site. The completion-write guard is the split-brain fix — without it a deposed leader silently overwrites the reclaiming leader. **Lease TTL must be > lock TTL (G1 invariant, asserted by AC #8).**

**Rollback.** Remove `claimed_at=clock.now()` from the three UPDATEs; revert `requeueStaleTasks` to `status='in_progress'`-only; remove the sweep + the completion-write guard. `claimed_at` stays NULL and the dead-zone returns (detected-only by C3); the split-brain window reopens.

**End of Track A.**


### Track B — Security, principal-binding authz & SSRF

**Goal.** Bind every mutating endpoint to the authenticated principal (split B1 into B1a principal-binding + B1b the fused `resolveDeviceToken` cascade to kill the circular dep), add the quality-review `source` discriminator + structural VERDICT match, bulk-PUT per-task ownership, admin-gate `/api/connect`, fence `soul_content`, close hygiene holes, bind the lateral-movement session/exec-approvals routes, and add runtime-DNS SSRF protection on webhooks. **Priority band: P0.**

---

#### B1a — Principal-binding authz (no device dep): `requireAgentSelfAccess` on PUT agents/[id], /soul, bulk PUT tasks, sessions/control, exec-approvals

**Objective.** The fusePoint's principal-binding half, split out so it has NO dependency on the device-auth module (resolving v1's latent circular dep). Wire the existing `requireAgentSelfAccess`/`requireAgentTaskAccess` (verified at `src/lib/enforcement/workspace-scope.ts:74`/`:110`) on the agent-mutating + bulk-task + lateral-movement routes.

**Files.**
- `src/app/api/agents/[id]/route.ts:62` (PUT — add `requireAgentSelfAccess`)
- `src/app/api/agents/[id]/soul/route.ts:105` (PUT soul — add `requireAgentSelfAccess`)
- `src/app/api/tasks/route.ts` (bulk PUT — add `requireAgentTaskAccess` per row)
- `src/app/api/sessions/[id]/control/route.ts` (operator, no agent binding — bind the target session's agent; v1 missed this lateral-movement route)
- `src/app/api/exec-approvals/route.ts` (operator, no agent binding — bind the approval's agent; v1 missed this lateral-movement route)
- `src/lib/enforcement/workspace-scope.ts:74` (`requireAgentSelfAccess` — reuse), `:110` (`requireAgentTaskAccess` — reuse)

**Depends_on.** `[]`

**Acceptance criteria.**
1. PUT `/api/agents/[id]` and PUT `/api/agents/[id]/soul` call `requireAgentSelfAccess(auth.user, id)` and return 403 when an operator-scoped principal targets a different agent (admins exempt via existing `:76`).
2. Bulk PUT `/api/tasks` iterates tasks and calls `requireAgentTaskAccess` per row (403 for any task the operator principal does not own; admins exempt).
3. `sessions/[id]/control` and `exec-approvals` bind the target session/approval to the caller's `agent_id` (403 for an agent-scoped key targeting another agent's live session/approval) — closes the lateral-movement vector.
4. Test: operator A PUT `/api/agents/B/soul` → 403; PUT `/api/agents/A/soul` → 200. Bulk PUT mix → A:updated, B:forbidden.
5. `pnpm test:all` green.

**Test.** Integration: PUT `/api/agents/B/soul` with agent-A creds → 403; with agent-A creds targeting A → 200. Bulk PUT with two tasks (`assigned_to=A`, `B`) under agent-A creds → A:updated, B:forbidden. `sessions/control` kill on agent B's session with agent-A key → 403.

**Risk.** Tightening could break operator scripts that assume cross-agent access; document the migration. The session/approval binding requires deriving the owning agent from the session/approval record (one extra read).

**Rollback.** Remove the `requireAgentSelfAccess`/`requireAgentTaskAccess` calls; cross-agent mutation reverts to operator-role access.

---

#### B1b — FUSED `resolveDeviceToken` cascade branch (depends_on D2 — the device half of the fusePoint)

**Objective.** Insert `resolveDeviceToken(bearer)` between the agent_api_keys block (closes ~`src/lib/auth.ts:556`) and the plugin hook (`:558-560`) in ONE `getUserFromRequest` cascade change. Device tokens and agent-scoped keys share one authz path from day one. Split from B1a to eliminate the circular dep. **Grill-2 reconciliation (medium gap):** the cascade BRANCH is a thin ~15-line call to `token-service.resolveDeviceToken`; the ~30-line hash/lookup/skew-grace/last_seen logic lives in the service (so "identical shape" + "~15 lines" are reconciled — the branch is thin, the service is deep).

**Files.**
- `src/lib/auth.ts:556-560` (insertion point — verified: `_authResolverHook` invoked at `:558`, agent_api_keys block closes at `:556`)
- `src/opzava/core/auth/token-service.ts` (`resolveDeviceToken` — created in D2; B1b wires the call site only)

**Depends_on.** `[D2]`

**Acceptance criteria.**
1. `resolveDeviceToken` invoked exactly once in `getUserFromRequest`, AFTER agent_api_keys (so agent keys resolve first) and BEFORE the plugin hook; on miss returns null and the cascade falls through.
2. `resolveDeviceToken` returns a `User` carrying `agent_id`/`agent_name`/`workspace_id`/`role=deriveRoleFromScopes(scopes)` AND stamps `last_seen_at` (parity with the agent_api_keys block at `auth.ts:547`) — device tokens indistinguishable from agent-scoped keys to the authz layer.
3. `architecture.test.ts`: exactly one opzava file exports `resolveDeviceToken` (`token-service.ts`).
4. Precedence test: an agent-scoped key still resolves before a device token; a device token resolves before the plugin hook.
5. **DEVICE-TOKEN DISPATCH (Grill-2 medium gap):** a device-token-authenticated request that reaches the dispatch path still passes through `scanForInjection` (`agent-runtimes.ts:7`) — AC + test assert the injection guard fires for device-token principals. (If this is not enforced, the security-note pairing is dropped from the design notes instead — do not assert a mitigation no task delivers.)
6. `pnpm test:all` green.

**Test.** Vitest: `getUserFromRequest` with a device Bearer resolves to the bound principal; `resolveDeviceToken` returns null for an unknown/malformed bearer. Precedence: agent key wins over device token over plugin. `last_seen_at` stamped.

**Risk.** Moving auth precedence changes which resolver wins; the device branch MUST sit AFTER agent_api_keys and BEFORE the plugin hook — covered by the precedence unit test.

**Rollback.** Remove the one-line `resolveDeviceToken` call + the `requireAgentSelfAccess` calls from B1a; the device-auth module (D2) remains unreached until re-wired.

---

#### B2 — Migration 056: `quality_reviews.source` discriminator WITH backfill INSIDE the migration + structural VERDICT match

**Objective.** Add `quality_reviews.source TEXT NOT NULL DEFAULT 'human'` (migration 056); the backfill `UPDATE ... SET source='model' WHERE reviewer='aegis'` runs **INSIDE the migration `up()`** (v1 had it only in the risk note — an engineer following only the AC would retroactively misclassify every Aegis verdict as 'human', breaking the very gate B2 fixes). Rewrite `parseReviewVerdict` to a structural anchored regex. **Note:** the `reviewer` field is ALREADY server-resolved (`quality-review/route.ts:91-94`) — drop v1's stale "caller-controlled reviewer" framing.

**Files.**
- `src/lib/migrations.ts` (append migration id `056_quality_reviews_source` — ADD COLUMN + backfill `UPDATE` inside the SAME `up()`)
- `src/app/api/tasks/route.ts:53-61` (`hasAegisApproval` keys on `reviewer='aegis'` at `:56` — change to `WHERE source='model' AND status='approved'`)
- `src/app/api/tasks/[id]/route.ts:32-44` (mirror gate)
- `src/app/api/quality-review/route.ts:119-122` (INSERT — add `source='human'`; reviewer already server-resolved at `:91-94`)
- `src/lib/task-dispatch.ts:968-973` (`parseReviewVerdict` — `upper.includes('VERDICT: APPROVED')` substring at `:970` is the injection vector)

**Depends_on.** `[B1a]`

**Acceptance criteria.**
1. Migration 056 adds `source TEXT NOT NULL DEFAULT 'human'` AND runs `UPDATE quality_reviews SET source='model' WHERE reviewer='aegis' AND source IS NULL` INSIDE `up()` before returning (the backfill is in the AC, not just the risk note).
2. `hasAegisApproval` gates on `WHERE source='model' AND status='approved'` (not `reviewer='aegis'`).
3. `parseReviewVerdict` requires a line anchored to the start matching `/^VERDICT:\s*(APPROVED|REJECTED)/i` (structural); ANY malformed/missing verdict defaults to REJECTED (default-DENY).
4. No existing `reviewer='aegis'` row is left with `source='human'` after migration (test seeds a `reviewer='aegis'` row, runs migration, asserts `source='model'`).
5. Test: a model reply with '...ignore prior... VERDICT: APPROVED' embedded mid-text is REJECTED (no longer matches substring).
6. The Aegis insert path writes `source='model'`.
7. `pnpm test:all` green.

**Test.** Vitest `parseReviewVerdict` table: `'VERDICT: APPROVED\nNOTES: ok'` → approved; `'blah VERDICT: APPROVED blah'` → rejected; `''` → rejected. `hasAegisApproval`: human-source approved → false; model-source approved → true. Migration: seed `reviewer='aegis'` row, run 056, assert `source='model'`.

**Risk.** The backfill is load-bearing — without it the migration retroactively breaks `hasAegisApproval`. The DEFAULT 'human' is correct for genuinely human rows. id 056 is globally unique (governance test from A1).

**Rollback.** Revert `hasAegisApproval` to `reviewer='aegis'`; revert `parseReviewVerdict` to substring. The `source` column remains DEFAULT 'human' and is ignored; the backfill is harmless.

---

#### B3 — `/api/connect` admin-gate + name allowlist + collision check + 0o600/hermes/registerAuthResolver hygiene

**Objective.** `/api/connect` auto-create must be admin-gated with a name-format allowlist + collision check (verified: `connect/route.ts:15` is `requireRole('operator')`, `validation.ts:251` `agent_name` has NO allowlist). Fence `soul_content` (B1a). Hygiene: profile 0o600 (`mc-cli.cjs:129` `saveProfile` no mode → 0644), hermes reject-not-fallback (`hermes/route.ts:268` fallback to `parts[0]`), `registerAuthResolver` scope gate (`auth.ts:36-38`).

**Files.**
- `src/app/api/connect/route.ts:15` (`requireRole 'operator'` → admin for create), `:27-32` (unvalidated `agent_name` auto-INSERT)
- `src/lib/validation.ts:251` (`connectSchema agent_name` — add `^[a-z0-9][a-z0-9-]{1,62}$` allowlist + collision check → 409)
- `scripts/mc-cli.cjs:129` (`saveProfile` — add `{mode: 0o600}`; chmod existing at `loadProfile`)
- `scripts/mc-tui.cjs` (mirror `saveProfile` 0o600)
- `src/app/api/hermes/route.ts:268` (bin fallback to `parts[0]` → reject 500 when `!existsSync`), `:261` (`startsWith('hermes')` no word boundary → subcommand allowlist + audit log)
- `src/lib/auth.ts:36-38` (`registerAuthResolver` — require non-admin role unless explicit admin scope)

**Depends_on.** `[B1a]`

**Acceptance criteria.**
1. `/api/connect` POST auto-create requires admin role; `agent_name` matches `^[a-z0-9][a-z0-9-]{1,62}$` and does not collide (409, not silent create).
2. `saveProfile` (`mc-cli.cjs:129` + `mc-tui.cjs`) passes `{mode: 0o600}`; `loadProfile` chmods existing files to 0o600 once.
3. hermes bin rejects when `!existsSync(hermesBin)` (500, not `parts[0]`); subcommand allowlist `{run,start,stop,status}`; `logAuditEvent` on every invocation.
4. `registerAuthResolver`'s hook cannot mint admin without an explicit admin scope.
5. Test: profile mode 0o600 (`fs.stat`); hermes missing venv → 500; `/api/connect` invalid name → 400; duplicate → 409.
6. `pnpm test:all` green.

**Test.** node:test: write a profile, assert `stat.mode & 0o777 === 0o600`. hermes: stub `existsSync` false, POST run, assert 500. `/api/connect`: `agent_name '../../etc'` → 400; existing name as non-admin → 403/409. `registerAuthResolver`: hook returning `role:'admin'` without admin scope rejected.

**Risk.** Tightening `/api/connect` to admin could break CLI auto-registration; document the migration (operators pre-register or admin approves). Hard-rejecting hermes breaks setups relying on `parts[0]`; the audit log makes breakage visible.

**Rollback.** Remove the admin gate + allowlist + collision check; restore `parts[0]` fallback; remove the mode arg + `registerAuthResolver` scope contract.

---

#### B4 — SSRF protection on webhooks (runtime DNS check, not static hostname) — v1 never audited this

**Objective.** v1 assumed the gateway path was the only outbound surface, missing that webhook delivery URLs ARE user-supplied and fetched server-side. Verified `isBlockedWebhookUrl` (`webhooks/route.ts:10-34`) blocks a static hostname set + private IPv4 but NOT IPv4-mapped IPv6 (`::ffff:127.0.0.1`), decimal/octal/hex IP encodings, IPv6 ULA, or DNS rebinding. **The gateway path (`callOpenClawGateway` uses `config.gatewayHost`, operator-configured) is NOT an SSRF vector** — scope this to webhooks/outbound-delivery only.

**Files.**
- `src/app/api/webhooks/route.ts:10-34` (`isBlockedWebhookUrl` — static hostname match → runtime DNS resolution + private/loopback/link-local/metadata IP reject + pin resolved IP for the fetch)
- `src/lib/validation.ts` (webhook URL validation)

**Depends_on.** `[]`

**Acceptance criteria.**
1. Webhook delivery resolves the hostname at DELIVERY time (not just validation), rejects if it resolves to private/loopback/link-local/metadata IP (`169.254.169.254`, `fc00::/7`, `::ffff:127.0.0.1`, etc.).
2. IP-literal encodings (decimal `2130706433`, octal, hex) are normalized and blocked.
3. The resolved IP is PINNED for the actual fetch (defeats DNS rebinding: public-at-validation, private-at-fetch).
4. The gateway path (`config.gatewayHost`) is explicitly NOT in scope (operator-configured env, verified not user-controlled).
5. Test: a webhook URL resolving to `127.0.0.1` / `169.254.169.254` / `::ffff:127.0.0.1` → rejected; a DNS-rebinding host (public then private) → rejected on the private resolution.
6. `pnpm test:all` green.

**Test.** node:test: stub `dns.lookup` to return `127.0.0.1` → delivery rejected. Stub to return `169.254.169.254` → rejected. Pin test: second lookup returns private → fetch uses the first (pinned) public IP or is rejected.

**Risk.** Runtime DNS resolution adds latency to delivery; do it in the delivery worker, not the validation path. Over-blocking could reject legitimate internal webhooks — document an explicit allowlist escape hatch if needed.

**Rollback.** Revert to the static hostname `isBlockedWebhookUrl`; remove the runtime DNS check + IP pinning.

**End of Track B.**


### Track C — Deep-module refactors (gated behind A/B)

**Goal.** Extract Aegis as a deep module (`core/reviews`), split `task-dispatch.ts` so dispatch enqueues and the runner executes (preserving the DIRECT-API completion path explicitly), make the runner the canonical path for all three engines with the `task_id` FK, dedupe the client adapters into a shared module (split C4 into C0 minimal-early + C4 deep). **Priority band: P1. Gated behind Tracks A + B.**

---

#### C0 — Extract minimal `scripts/lib/mc-client.cjs` EARLY (loadProfile/saveProfile 0o600/httpRequest/sseStream passthrough) so D5/E3 have a target

**Objective.** v1 sequenced C4 (which CREATES `scripts/lib/mc-client.cjs`) AFTER D5 and E3 which both edit it. v2 splits: extract a MINIMAL shared module NOW carrying `loadProfile`/`saveProfile(0o600)`/`httpRequest(timeoutMs)`/`sseStream` passthrough, so D5's SSE rewrite and E3's per-tool timeouts have a real target. Deep timeout-dedup deferred to C4. **C0 is promoted to P0** (Grill-2: it is genuinely load-bearing for D5 and is small/no-dep) — see Linearized Execution Order.

**Files.**
- `scripts/lib/mc-client.cjs` (NEW minimal — `loadProfile`, `saveProfile` with 0o600, `httpRequest(timeoutMs)`, `sseStream` passthrough)
- `scripts/mc-mcp-server.cjs` (require the shared module), `scripts/mc-cli.cjs` (require), `scripts/mc-tui.cjs` (require)

**Depends_on.** `[]`

**Acceptance criteria.**
1. A minimal `scripts/lib/mc-client.cjs` exports `loadProfile`/`saveProfile(0o600)`/`httpRequest(timeoutMs)`/`sseStream` passthrough; all three adapters require it (no duplicate copy).
2. `saveProfile` uses `{mode: 0o600}` (from B3).
3. Timeout is a named constant per surface (stdio MCP, CLI, TUI) passed to `httpRequest` — no hardcode drift.
4. Each adapter's existing tests pass unchanged (behavior parity).
5. D5 and E3 can now depend on this module existing.
6. `pnpm test:all` green.

**Test.** node.test in `scripts/lib/mc-client.test.cjs`: `httpRequest` timeout AbortController fires; `sseStream` parses a `data:` frame. Adapter smoke tests pass.

**Risk.** Capture each adapter's current timeout/error-shape as a golden test before extraction so parity is enforced.

**Rollback.** Restore the three inline copies; delete `scripts/lib/mc-client.cjs`.

---

#### C1 — Extract Aegis reviewer as `src/opzava/core/reviews` deep module

**Objective.** Move `buildReviewPrompt` (`task-dispatch.ts:930`), `parseReviewVerdict` (hardened in B2), and the `runAegisReviews` loop body into `src/opzava/core/reviews` exposing `review(task)` + pure prompt/verdict functions; barrel-re-export so `scheduler.ts` imports stay unchanged. The claim (guarded UPDATE at `:1005`) STAYS in `task-dispatch.ts` (the dispatcher owns DB state).

**Files.**
- `src/lib/task-dispatch.ts:905-1154` (`ReviewableTask` `:905`, `buildReviewPrompt` `:930`, `parseReviewVerdict` `:968`, `runAegisReviews` `:980`)
- `src/opzava/core/reviews/contracts.ts` (NEW — zod, mirror `core/secrets/contracts.ts`)
- `src/opzava/core/reviews/review-service.ts` (NEW — `review(task, deps): Promise<ReviewVerdict>`)
- `src/opzava/core/reviews/MODULE.md` (NEW)
- `src/opzava/architecture.test.ts` (`core/reviews` must not import `platform`/`modules`)

**Depends_on.** `[B2]`

**Acceptance criteria.**
1. `core/reviews` exports `review(task)`, `buildReviewPrompt(task)`, `parseReviewVerdict(text)` — pure or deps-injected, framework-independent.
2. `task-dispatch.ts` `runAegisReviews` is a thin caller: claim (guarded UPDATE `:1005`) → `core/reviews.review(task)` → write verdict; prompt/verdict logic no longer in the dispatcher.
3. `scheduler.ts` and importers compile unchanged (barrel re-export preserves names).
4. `architecture.test.ts`: `core/reviews` imports no `platform/*` or `modules/*`; no import cycle.
5. The hardened `parseReviewVerdict` (B2) + `source='model'` insert (B2) move with the module.
6. `pnpm test:all` green; `task-dispatch.ts` line count drops measurably toward enqueue-only.

**Test.** Vitest: `parseReviewVerdict` table (carried from B2) + `buildReviewPrompt` snapshot + `review()` against a stubbed model. `architecture.test.ts` layering guard for `core/reviews`.

**Risk.** Moving the claim out of the loop must preserve exactly-one-wins; keep the claim in `task-dispatch.ts` and move only prompt/verdict/model-call into `core/reviews`. `ReviewVerdict` is a frozen readonly contract.

**Rollback.** Move the functions back into `task-dispatch.ts`; delete `core/reviews`. Barrel re-export means callers are unaffected.

---

#### C2 — Split `task-dispatch` god-module: dispatch enqueues, runner executes (explicit DIRECT-API path; golden snapshot BEFORE refactor)

**Objective.** Verified `task-dispatch.ts:1336-1536` control flow: `useDirectApi && !targetSession` at `:1338`; `targetSession` branch `continue`s at `:1402`; new-session branch `continue`s at `:1471`; the synchronous completion block (`:1474+`) is reachable ONLY via the `:1338` fall-through. Capture a golden snapshot BEFORE the refactor; refactor so dispatch enqueues a job and the runner executes; route the DIRECT-API completion path through the runner executor explicitly; delete the genuinely-dead duplication; reject `(useDirectApi && targetSession)` explicitly.

**Files.**
- `src/lib/task-dispatch.ts:1336-1536` (branch control flow)
- `src/opzava/platform/runner/worker.ts:45` (`createRunnerWorker` — executor drain)
- `src/opzava/modules/content/workflow/job-kind-executor.ts:9` (`createJobKindExecutor` — register the new kind)

**Depends_on.** `[C1, A1]`

**Acceptance criteria.**
1. **BEFORE any code change:** capture a golden snapshot fixture at **`test/fixtures/dispatch-golden.json`** (seeded task set + expected terminal `{status, outcome, resolution, activity}` for direct-API, target-session, new-session branches) — commit it as a fixture (Grill-2 low gap: concrete path + format specified).
2. `dispatchAssignedTasks` claims `assigned→in_progress` and enqueues a `{kind:'task-dispatch', task_id}` job; the runner worker executes the provider/gateway/direct-API call.
3. The DIRECT-API completion path (the only live synchronous-completion path, branch `:1338`) is routed through the runner executor explicitly — `status=review` + comment + activity written by the executor.
4. The genuinely-dead duplication (the unreachable post-`continue` block) is deleted, not enshrined.
5. `(useDirectApi && targetSession)` is rejected explicitly (no silent fall-through into `chat.send` against an unavailable gateway).
6. Each of the three branches is an explicit early-return block (no nested else).
7. **AFTER the refactor:** the golden test at **`src/lib/__tests__/dispatch-golden.test.ts`** asserts byte-identical terminal status/resolution/activity per task (direct-API path covered specifically by name). Re-record the fixture only on intentional behavior change.
8. `task-dispatch.ts` shrinks; responsibility narrows to claim + enqueue + reconcile.
9. `pnpm test:all` green.

**Test.** Vitest: `dispatchAssignedTasks` against a stubbed enqueue → one job with correct kind+task_id. Golden: runner drains the job, transitions match the pre-refactor fixture. Branch: `(useDirectApi && targetSession)` → explicit rejection. Direct-API completion: `status=review` + comment + activity.

**Risk.** Behavioral parity: the runner executes asynchronously; the golden snapshot (captured BEFORE) is the parity guarantee. The DIRECT-API completion path is the only live synchronous path and MUST be covered by the golden test specifically.

**Rollback.** Restore inline execution in `dispatchAssignedTasks`; remove the task-dispatch kind registration. The runner continues to serve `campaign-send`.

---

#### C3 — Runner canonical path: register task-dispatch + content-step kinds; `task_id` FK (opzava_runner_004); read-only stuck-task detector (POPULATED by A5); resolve runner-daemon leader-gating

**Objective.** Per `orchestratorUnification`: generalize `createJobKindExecutor` to register `task-dispatch` + `content-step` alongside `CAMPAIGN_SEND_JOB_KIND`; add the missing `task_id` FK on the runner job table (migration `opzava_runner_004`); add `listStuckTasks()` which is now POPULATED because A5 arms `claimed_at`. **Do NOT delete the LIVE `WorkflowRun`/`listRecentWorkflowRuns` surface** (verified live at `ops/runs/route.ts:29`). **RED-TEAM RESOLUTION (runner-daemon leader-gating):** the runner's own maintenance daemon (`src/opzava/platform/runner/maintenance-daemon.ts:9-12`) runs on a SEPARATE timer NOT gated by G1's leader-lock; ARD 0007 states engines are not merged. Post-C3, task work executes via the runner — the daemon's leader-gating must be resolved explicitly here.

**Files.**
- `src/opzava/modules/content/workflow/job-kind-executor.ts:9` (`createJobKindExecutor` — add task-dispatch + content-step to the executors record)
- `src/opzava/platform/runner/contracts.ts` (`Job` type — add optional `task_id`), `src/opzava/platform/runner/migrations.ts` (append migration id `opzava_runner_004_task_id` — `task_id INTEGER` nullable + FK; FK IS enforced: `db.ts:56` `foreign_keys=ON`)
- `src/opzava/platform/runner/run-queries.ts:24` (add read-only `listStuckTasks()` — `quality_review`/`in_progress` past `lease_expires_at`, reading the A5-armed `claimed_at`)
- `src/app/api/ops/runs/route.ts` (expose `listStuckTasks` read-only)
- `src/opzava/platform/runner/maintenance-daemon.ts` (leader-gating resolution — see AC #6)

**Depends_on.** `[C2, A1, A5, G1]`

**Acceptance criteria.**
1. `createJobKindExecutor` registers three kinds: `CAMPAIGN_SEND_JOB_KIND`, `'task-dispatch'`, `'content-step'`; `resolveKind` dispatches correctly.
2. Migration `opzava_runner_004_task_id` adds `task_id INTEGER` (nullable, no backfill) via the `runner/migrations.ts` `registerMigrations` seam (the documented single crossing); id does not collide with any main-array migration id (governance test from A1 imports `getOpzavaRunnerMigrations()` directly); FK is enforced (`foreign_keys=ON` at `db.ts:56`).
3. `listStuckTasks()` returns `quality_review` AND `in_progress` rows whose `claimed_at < now - lease` — POPULATED because A5 arms `claimed_at`.
4. **Liveness guardrail (red-team):** `listRecentWorkflowRuns` in `run-queries.ts:24` aggregates `opzava_runner_operational_events` and is LIVE (`ops/runs/route.ts:29`) — it is NOT the removed `core/workflows` WorkflowRun state machine; do not delete. `sourceStepRunId` is consumed by ~30 step-service files in `src/opzava/modules/{content,social,general-va}` as the lineage contract; do not rename or remove. A governance assertion in C3's test asserts `ops/runs/route.ts` still imports `listRecentWorkflowRuns` after the refactor (a deletion-test guard).
5. Test: enqueue a task-dispatch job → runner drains → `task_id` FK resolves; a `quality_review` row past lease (armed by A5) appears in `listStuckTasks()`.
6. **RUNNER-DAEMON LEADER-GATING (red-team):** explicitly state one of: (a) gate `maintenance-daemon.ts` behind `acquireLeadership()` once task-dispatch enqueues into the runner, OR (b) keep the runner daemon un-gated BECAUSE its own `lease_expires_at` + `idempotency_key` is the safety property (state which). The chosen resolution is documented in C3's risk note + ops-cheatsheet so the post-C3 split-brain is not silent.
7. `pnpm test:all` green.

**Test.** Vitest: `createJobKindExecutor` dispatches each of the three kinds. `run-queries`: seed a `quality_review` row with `claimed_at=now-20min` (A5-armed), assert `listStuckTasks()` returns it; seed within lease, assert excluded. Governance: `ops/runs/route.ts` imports `listRecentWorkflowRuns` post-refactor.

**Risk.** Adding the FK via the `runner/migrations.ts` seam is the documented single crossing. Do NOT delete `WorkflowRun`/`StepRun` surface (code-wins confirms live). `listStuckTasks` is only useful AFTER A5 arms `claimed_at`. The runner-daemon gating decision is load-bearing for post-C3 correctness.

**Rollback.** Unregister the two new kinds (leave `CAMPAIGN_SEND_JOB_KIND`); `task_id` column stays nullable and ignored. `listStuckTasks` can remain as a read-only diagnostic.

---

#### C4 — Deep extraction of `scripts/lib/mc-client.cjs` (dedupe timeout-drift + single sseStream home) — depends on C0

**Objective.** Build on the C0 minimal module: complete the timeout-dedup (TUI 8000 hardcode vs MCP 30000 vs CLI variable) and make `sseStream` the single home (the D5 Last-Event-ID rewrite targets this one file). Eliminate the sseStream id-gap. C4 depends on C0.

**Files.**
- `scripts/lib/mc-client.cjs` (from C0 — complete the extraction: single `sseStream` home, single `httpRequest`, dedup the timeout constants)
- `scripts/mc-mcp-server.cjs:74` (30000ms), `scripts/mc-cli.cjs`, `scripts/mc-tui.cjs` (8000ms hardcode)

**Depends_on.** `[C0, C2]`

**Acceptance criteria.**
1. One shared module exports `loadProfile`/`saveProfile(0o600)`/`httpRequest(timeoutMs)`/`sseStream`; all three adapters require it, no duplicate copy.
2. Timeout is a single named constant per surface passed to `httpRequest` — no hardcode drift (the TUI 8000 vs MCP 30000 drift is eliminated).
3. `sseStream` lives in one place (the D5 Last-Event-ID rewrite targets this single file).
4. Behavior parity: each adapter's golden tests pass; 0o600 applies to all three `saveProfile` paths.
5. Test: shared-client unit test covers `httpRequest` timeout + `sseStream` `data:` parsing.
6. `pnpm test:all` green.

**Test.** node.test in `scripts/lib/mc-client.test.cjs`: `httpRequest` timeout AbortController fires; `sseStream` parses a `data:` frame and (after D5) resends `Last-Event-ID`. Adapter smoke tests pass.

**Risk.** Behavioral drift between the three copies is why they drifted; capture each adapter's current timeout/error-shape as a golden test before the deep extraction.

**Rollback.** Restore the three inline copies; revert `scripts/lib/mc-client.cjs` to the C0 minimal module.

**End of Track C.**


### Track D — Device-auth + persistent reliable connection

**Goal.** Ship RFC 8628 device-authorization (Opzava as own OAuth AS+RS, 8h/30d rotating refresh), the three-layer rotation guard with SERVER-SAFE atomic disambiguation, device-flow endpoints with DB-BACKED rate limits, `/device` approval page, resilient transport reusing the SSE cursor, the fused B1b cascade branch, exactly-once idempotency (scoped honestly), redaction governance, scope-capped issuance, chain-level revocation by default, and the openapi.json + .env.example + system-map docs. **Priority band: P0.**

---

#### D1 — Migration 058: `device_tokens` + `oauth_device_sessions` + `revoked_access_tokens` denylist (`workspace_id NOT NULL`; `audience` reserved)

**Objective.** Append migration id `058_device_tokens_oauth_sessions_denylist`. Create `device_tokens` (mirrors `agent_api_keys`/040 pattern) and `oauth_device_sessions` (clones the access-requests approval template). **Grill-2 RESOLUTION (the denylist referenced by D2/D3/D4 had no schema home):** the `revoked_access_tokens` denylist table is created HERE (inside 058), so D2's revoke + D4's revoke endpoint have a table to write. **Grill-2 RESOLUTION (`workspace_id NOT NULL`):** `device_tokens.workspace_id` is declared `INTEGER NOT NULL` (not merely "no default") so the schema enforces the explicit-workspace invariant, not just the D2 application check.

**Files.**
- `src/lib/migrations.ts` (append migration id `058_device_tokens_oauth_sessions_denylist` before the closing `]` at `:1501`; mirror the 040 agent_api_keys pattern)
- `src/app/api/auth/access-requests/route.ts` (014 approval template: reviewed_by/reviewed_at/approved_by)
- `docs/architecture/system-map/00-database-ledger.md` (document all THREE new tables — v1 dropped this)

**Depends_on.** `[B1a]`

**Acceptance criteria.**
1. `device_tokens` has: `user_id`, `workspace_id INTEGER NOT NULL` (REQUIRED at issuance, schema-enforced — Grill-2), `device_id`, `device_label`, `client_kind DEFAULT 'public'`, `scopes TEXT DEFAULT '[]'`, `access_token_hash`, `refresh_token_hash`, `refresh_token_prev_hash`, `rotation_chain_id`, `rotation_seq DEFAULT 1`, `access_expires_at`, `refresh_expires_at`, `rotated_at`, `last_seen_at`, `last_used_ip`, `revoked_at`, `revoke_reason`, `audience TEXT` (reserved per transport decision), `created_at`, `updated_at`; `UNIQUE(workspace_id, access_token_hash)`, `UNIQUE(workspace_id, refresh_token_hash)`; indexes on `rotation_chain_id`/`user_id`/`device_id`/`refresh_token_hash`/`access_expires_at`/`revoked_at`.
2. `oauth_device_sessions` has: `user_code_canonical UNIQUE`, `device_code_hash`, `status DEFAULT 'pending'` (pending|approved|denied|expired), `user_id`, `scopes`, `client_label`, `requested_by_ip`, `expires_at`, `approved_at`, `approved_by`; indexes on `status`/`expires_at`/`user_id`.
3. **`revoked_access_tokens` denylist (Grill-2):** `CREATE TABLE IF NOT EXISTS revoked_access_tokens (access_token_hash TEXT PRIMARY KEY, rotation_chain_id TEXT, workspace_id INTEGER NOT NULL, revoked_at INTEGER, revoke_reason TEXT)` — created in THIS migration so D2/D4 have a target.
4. **`workspace_id` is NOT NULL (Grill-2):** `INSERT` omitting it raises `SQLITE_CONSTRAINT_NOTNULL` — schema enforces the resolved decision, not just D2 code.
5. Migration id 058 is globally unique (governance test from A1, including runner ids).
6. `runMigrations` applies 058 atomically + idempotently; the `audience` column is reserved.
7. `00-database-ledger.md` documents all three tables.
8. Test: migration applies on fresh db, no-op on re-run; `UNIQUE` pairs reject duplicate hashes; `workspace_id NULL` insert rejected.

**Test.** Vitest: apply 058 to in-memory db, INSERT a duplicate `(workspace_id, access_token_hash)` → UNIQUE error; INSERT omitting `workspace_id` → NOTNULL error; re-run → no error. Confirm all three tables + indexes via `PRAGMA index_list`.

**Risk.** Three new tables on the SQLite spine; index count grows. The `rotation_chain_id` + `refresh_token_hash` indexes are required for the O(1) conditional UPDATE in D3. `device_tokens.workspace_id` NOT NULL prevents the cross-tenant trap at the schema layer.

**Rollback.** `DROP TABLE device_tokens, oauth_device_sessions, revoked_access_tokens; DELETE FROM schema_migrations WHERE id='058_device_tokens_oauth_sessions_denylist'`. All three are new with no inbound legacy refs.

---

#### D2 — `src/opzava/core/auth` module: contracts + token-service + device-code + crypto + MODULE.md + architecture guard (scope-capped, explicit-workspace, CHAIN-LEVEL revocation by default)

**Objective.** Create the deep module owning issuance/rotation/validation/revocation. Public surface: `resolveDeviceToken(bearer): User|null`, `issueForDevice` (REQUIRES explicit `workspace_id`, scope-capped to never admin), `rotate` (three-layer guard), `revoke` (family-wide). **RED-TEAM CRITICAL FIX (chain-level revocation by default):** `resolveDeviceToken` must reject ANY `access_token_hash` whose `rotation_chain_id` has ANY row with `revoked_at IS NOT NULL` (chain-level), NOT just the matched row's `revoked_at`. This closes the stolen-refresh-token-refreshed-before-revoke hole (the attacker's new-row token shares the chain). The `MC_DEVICE_INSTANT_REVOKE` denylist is a perf optimization, NOT the primary mechanism — correctness lives in the chain-level check.

**Files.**
- `src/opzava/core/auth/contracts.ts` (NEW — zod, mirror `core/secrets/contracts.ts`: `DEVICE_TOKEN_KIND`, `accessTokenSchema` 8h, `refreshTokenSchema` 30d, `deviceCodeSchema`, `userCodeSchema` base-20)
- `src/opzava/core/auth/token-service.ts` (NEW — `resolveDeviceToken`/`issueForDevice`/`rotate`/`revoke`)
- `src/opzava/core/auth/device-code.ts` (NEW — `issueDeviceCode`, `bindUserCode`, `canonicalizeUserCode`)
- `src/opzava/core/auth/crypto.ts` (NEW — `hashToken` sha256 mirroring `auth.ts:634`, `optionalEnvelopeEncrypt(OPZAVA_TOKEN_ENC_KEY||AUTH_SECRET)`)
- `src/opzava/core/auth/MODULE.md` (NEW)
- `src/opzava/architecture.test.ts` (`core/auth` layering + `resolveDeviceToken`-uniqueness guards)

**Depends_on.** `[D1]`

**Acceptance criteria.**
1. `resolveDeviceToken` looks up `device_tokens` by `access_token_hash` (sha256, never raw), validates `access_expires_at` with 60s skew grace, stamps `last_seen_at`, and **rejects if ANY row in the token's `rotation_chain_id` has `revoked_at IS NOT NULL`** (CHAIN-LEVEL, red-team) — returning a `User` with `role=deriveRoleFromScopes(scopes)` defaulting to viewer (never admin).
2. `issueForDevice` REQUIRES an explicit `workspace_id` parameter (no default; throws if missing — closes the cross-tenant trap) and REJECTS or DOWNGRADES any scope that `deriveRoleFromScopes` maps to admin (closes the D6 'never admin' gap) — device tokens are capped at operator/viewer regardless of approver.
3. `issueForDevice`: access=`mc_dt_`+`randomBytes(32).hex` 8h, refresh=`mc_rt_`+`randomBytes(32).hex` 30d, `rotation_chain_id=UUID`, `rotation_seq=1`; raw tokens returned once, hashes persisted.
4. `rotate`: three-layer guard (in-process single-flight optimization + SQLite conditional UPDATE as the lock + grace window); the SERVER-SAFE atomic disambiguation is specified in D3.
5. `revoke`: family-wide on rotation reuse (`UPDATE device_tokens SET revoked_at, revoke_reason='rotation_reuse' WHERE rotation_chain_id=? AND revoked_at IS NULL`) + `security.event` severity=critical.
6. When `MC_DEVICE_INSTANT_REVOKE=1`: `revoke` also writes the `access_token_hash` to the `revoked_access_tokens` denylist (created in D1) and `resolveDeviceToken` checks it per-request (perf optimization over the chain-join; correctness still lives in AC #1).
7. `architecture.test.ts`: `core/auth` imports no `platform/*` or `modules/*`; exactly one opzava file exports `resolveDeviceToken` (`token-service.ts`).
8. `MODULE.md` documents the invariants (hash-only-at-rest, `rotation_seq` monotonic, reuse→family-revocation, 8h/30d schema-pinned, scope-capped-never-admin, explicit-workspace-required, chain-level-revocation-by-default, `contracts.ts` `.strict()`).
9. `pnpm test:all` green.

**Test.** Vitest unit: `resolveDeviceToken` by-hash lookup; skew boundary (accept at `access_expires_at-1s` and `+59s`, reject at `+61s`); **chain-level revoke: steal token, attacker refreshes (new row, same chain), operator revokes the device → the attacker's NEW-row token is rejected because the chain is revoked** (red-team scenario). `issueForDevice` without `workspace_id` → throws; with an admin scope → downgraded/rejected. `last_seen_at` stamped. `crypto`: envelope encrypt round-trip with `OPZAVA_TOKEN_ENC_KEY` set and unset (fallback `AUTH_SECRET`). `architecture.test.ts` guards pass.

**Risk.** The rotation guard is the #1 subtle-bug surface — the SERVER-SAFE atomic `changes()===0` disambiguation lands in D3. Keep `resolveDeviceToken`'s cascade BRANCH ~15 lines (the deep logic lives in `token-service.resolveDeviceToken`). Chain-level revocation adds a join per validation request — the denylist is the perf escape hatch when `MC_DEVICE_INSTANT_REVOKE=1`.

**Rollback.** Delete `src/opzava/core/auth/`; revert `architecture.test.ts` guards; remove the B1b call site. The 058 tables remain (no inbound refs).

---

#### D3 — Token endpoints + SERVER-SAFE three-layer rotation guard + reuse detection (ATOMIC disambiguation — highest test investment)

**Objective.** `POST /api/auth/device/token` implements refresh with the three-layer guard and RFC 6749 §10.4 reuse→family-revocation. **RED-TEAM CRITICAL FIX (the disambiguation must be ATOMIC, not read-after-UPDATE):** v2's "changes()===0 then re-read the row and branch on `rotation_seq`" is NOT atomic — with sticky-session Traefik the re-read is a separate statement that may not observe the prior replica's commit, silently swallowing reuse. v3 embeds `MAX(rotation_seq)` INSIDE the conditional UPDATE predicate so SQLite serializes the UPDATE and the disambiguation as one atomic point.

**Files.**
- `src/app/api/auth/device/token/route.ts` (NEW — `grant_type=refresh_token` + `device_code`; grant-type-agnostic per transport decision)
- `src/app/api/auth/device/revoke/route.ts` (NEW)
- `src/opzava/core/auth/token-service.ts` (`rotate`/`revoke` from D2)
- `src/lib/rate-limit.ts` (DB-backed refresh limiter — see D3.5 below)

**Depends_on.** `[D2]`

**Acceptance criteria.**
1. `POST /api/auth/device/token` `grant_type=refresh_token`: the conditional UPDATE predicate embeds the chain-max: `WHERE rotation_chain_id=? AND refresh_token_hash=? AND revoked_at IS NULL AND rotated_at IS NULL AND rotation_seq = (SELECT MAX(rotation_seq) FROM device_tokens WHERE rotation_chain_id=?)`; `changes()===1` → new token pair. The MAX subquery runs INSIDE the UPDATE statement (atomic).
2. **SERVER-SAFE ATOMIC DISAMBIGUATION (red-team fix):** on `changes()===0`, re-read the row: if `revoked_at IS NOT NULL` → already-revoked, return 401 idempotent (safe). If `rotated_at IS NOT NULL` AND `rotation_seq == (the chain's persisted max)` → legit immediate-prior token (concurrent loser): return 409 `'already_rotated'` with the CURRENT valid token's metadata (NOT a new pair, NOT a revoke). Only if `rotated_at IS NOT NULL` AND `rotation_seq < chain_max` → genuine reuse → family revoke + `security.event` severity=critical.
3. The token endpoint accepts the `device_code` grant too (grant-type-agnostic for the additive HTTP-MCP future); `audience` populated but not enforced (reserved).
4. **CONCURRENCY TEST (v3 corrected):** two simultaneous refreshes of the SAME refresh_token → exactly ONE returns 200 + new tokens, the OTHER returns 409 `'already_rotated'`, ZERO family revocations.
5. **MULTI-PROCESS TEST (red-team):** two SEPARATE better-sqlite3 handles to the same file with `busy_timeout` simulating two replicas, replaying seq-1 after a concurrent rotation across all orderings, asserting exactly one revoke — NOT the single-connection in-memory test v2 specified.
6. **REUSE TEST:** re-presenting a rotated refresh_token whose `rotation_seq < chain_max` → entire `rotation_chain_id` revoked + `security.event` broadcast once; re-triggering revoke on an already-revoked chain is a safe no-op (idempotent).
7. **DB-BACKED refresh limiter (Grill-2 — was in-memory `createKeyedRateLimiter`, same cross-replica split as the device flow):** critical:true, keyed by IP + `refresh_token_hash` prefix, using the `dbRateLimiter` primitive (see D3.5).
8. `pnpm test:all` green.

**Test.** Vitest concurrency: two `Promise.all` refreshes with the same token against in-memory db with `busy_timeout` → exactly one 200, one 409-already_rotated, ZERO revocations. Multi-process: two handles, seq-1 replay after concurrent rotation → exactly one revoke. Reuse: rotate once, re-present an OLDER token (`seq < max`) → chain revoked + `security.event` spy fired once; re-revoke → no-op. Re-present the immediate-prior token (`seq == max`) → 409 not revoke.

**Risk.** THIS IS THE HIGHEST-RISK TASK. The disambiguation MUST be atomic (MAX inside the UPDATE predicate) and distinguish legit-concurrent-loser from reuse via `rotation_seq`. Sticky-session Traefik routes a refresh to replica B while replica A holds prior state — the embedded-MAX conditional UPDATE is the only correctness guarantee. The multi-process test is mandatory (the single-connection test cannot catch inter-replica skew).

**Rollback.** Return 501 from the refresh path (or restrict to `device_code` grant); the reuse-detection stays inert. The D2 module remains.

> **D3.5 — Shared `dbRateLimiter` primitive (Grill-2, split task).** Extract a DB-backed rate-limit counter (conditional UPDATE keyed on `(bucket, key, window)`, mirroring the A3 guarded-counter pattern) that BOTH D3 (refresh limiter) AND D4 (device-flow limiter) depend on. This fixes the cross-replica brute-force split for BOTH the refresh endpoint (the higher-value target — stolen refresh token) AND the user_code endpoint. **D3 depends_on D3.5; D4 depends_on D3.5.** D3.5 depends_on `[D2]` (it needs the db seam) and is the single home for `createKeyedRateLimiter`'s eventual replacement (existing in-memory limiters are documented as single-replica; a global sweep is out of scope but tracked).

---

#### D4 — Device-code endpoints + `/device` approval page + DB-BACKED rate limits + RFC 8628 anti-phishing

**Objective.** `POST /api/auth/device/code` (`device_code`+`user_code`, `expire_in=900s` per RFC 8628 §3.2), the polling token endpoint, `GET /api/auth/devices` admin list + `/[id]/revoke`, the browser `/device` approval page with anti-phishing controls. The device-flow rate limit is DB-BACKED via the D3.5 `dbRateLimiter` (replica-consistent).

**Files.**
- `src/app/api/auth/device/code/route.ts` (NEW — `issueDeviceCode`)
- `src/app/api/auth/devices/route.ts` (NEW — admin list, `requireRole('admin')`)
- `src/app/api/auth/devices/[id]/revoke/route.ts` (NEW — admin revoke, chain-level revoke via D2 + writes the D1 denylist when `MC_DEVICE_INSTANT_REVOKE=1`)
- `src/app/(app)/device/page.tsx` or `src/app/device/page.tsx` (NEW — `DeviceApprovalPanel`)
- `src/lib/rate-limit.ts` (DB-BACKED device-flow limiter via D3.5 `dbRateLimiter`, keyed by ip + `user_code_hash`, critical:true)

**Depends_on.** `[D3, D3.5]`

**Acceptance criteria.**
1. `POST /api/auth/device/code` returns `{device_code, user_code, verification_uri, expires_in:900, interval:5}` per RFC 8628 §3.2; `device_code` >=128 bits never displayed; `user_code` 8 base-20 chars formatted `XXXX-XXXX`.
2. The device-flow rate limit is DB-BACKED (D3.5 `dbRateLimiter` keyed on ip + `user_code_hash`), NOT an in-memory Map — replica-consistent; an attacker cannot split across N replicas. critical:true.
3. The polling endpoint returns `authorization_pending`/`slow_down`/`expired`/`denied` per RFC 8628 §3.5; `slow_down` permanently adds 5s.
4. `GET /api/auth/devices` (admin) lists active tokens with `last_seen_at`/`device_label`; `POST /[id]/revoke` revokes the CHAIN (D2 family-wide) and writes the denylist when `MC_DEVICE_INSTANT_REVOKE=1`.
5. The `/device` page displays the `user_code`, requires explicit confirm (no auto-approve on `verification_uri_complete`), shows `device_label`/`client_kind` (RFC 8628 §5.4 anti-phishing).
6. `userCodeVerifyLimiter` (DB-backed) keyed by ip + attempted user_code, 5/600s (tight given ~34.5 bits entropy), blocks brute-force consistently across replicas.
7. Test: full device flow — POST code → poll pending → approve at `/device` → poll returns tokens.
8. `pnpm test:all` green.

**Test.** Integration: POST `/api/auth/device/code` → poll `authorization_pending`; approve via `/device` → poll returns tokens; deny → `denied`. Rate-limit: 6 rapid wrong user_codes from one IP across two simulated replicas → 429 (DB-backed, not 10/600s). E2E (playwright) on local-docker-parity: `mc auth device` → user_code → approve → token stored.

**Risk.** Anti-phishing UX: enforce explicit confirm + display `user_code`. The DB-backed limiter is the device-flow's #1 exploit fix. **I1 dependency:** D4's `/device` page is cookie-authenticated and rides on the I1 cookie/TLS hardening — the TLS assumption is added to D4's risk (page works under both `__Host-` and legacy cookie names).

**Rollback.** Return 501 from the code/devices endpoints; `/device` returns 'feature disabled'. The D2/D3 token machinery remains testable via raw curl/Bearer.

---

#### D5 — Resilient-http + refresh-on-401 single-flight + SSE client-resume rewrite + honestly-scoped exactly-once idempotency

**Objective.** Build the shared resilient transport (in `scripts/lib/mc-client.cjs` from C0): refresh-on-401 with in-process single-flight, the `sseStream` Last-Event-ID rewrite (the genuine new client work), and exactly-once mutation retry HONESTLY SCOPED to routes that have an idempotency index (chat via 054, task capture via A1's `client_request_id`).

**Files.**
- `scripts/lib/mc-client.cjs` (from C0 — `sseStream`/`httpRequest` single home)
- `scripts/mc-cli.cjs:207`/`:252` (`sseStream` parses only `data:`, ignores `id:` → rewrite to track the last `id:` and resend `Last-Event-ID` on reconnect)
- `src/lib/realtime-events.ts:165` (`readServerEventsAfter` — server-side cursor, unchanged), `:202` (`parseLastEventId`)

**Depends_on.** `[D6, C0]`  *(C0 promoted to P0; D5 is P0 with no P1 prereq after the promotion.)*

**Acceptance criteria.**
1. `sseStream` tracks the last `id:` line and sends `Last-Event-ID` on reconnect; the server resume (`readServerEventsAfter`/`parseLastEventId`) is unchanged and correct.
2. refresh-on-401: a 401 triggers exactly one in-process refresh (single-flight — concurrent 401s share one refresh), retries the original call once with the new bearer; a 401 on the refresh call itself returns 401 without retrying (no deadlock).
3. Exactly-once mutation retry via `Idempotency-Key` is HONESTLY SCOPED: supported ONLY for routes with an existing idempotency index (chat messages via 054, task capture via A1's `client_request_id`); other routes fall back to single-attempt-no-retry and the transport surfaces a 5xx without retrying.
4. Resilient transport reuses the realtime SSE cursor (server-side already correct); the only new substrate is the client `sseStream` `id:` tracking.
5. **SSE HANDOFF-GAP HONESTY (red-team):** the AC is softened to reflect reality — "resumes without gaps for events persisted BEFORE the disconnect; during a leadership handoff the client may observe a silence gap of up to lock TTL (90s) for dispatch-generated events because only the leader emits them." Document the gap window in D5's risk note + ops-cheatsheet so an operator observing an SSE gap during redeploy does not chase a phantom bug.
6. Test: a server that drops mid-stream → `sseStream` reconnects with `Last-Event-ID` and resumes without gaps for persisted events; a retried POST with the same `Idempotency-Key` on an indexed route executes once (returns `idempotent:true` the second time).
7. `pnpm test:all` green.

**Test.** node:test: `sseStream` against a stubbed server emitting `id:1`/`data:A`, disconnect, reconnect with `Last-Event-ID:1` emitting `id:2`/`data:B` → client sees A then B (no gap, no dup for persisted events). Idempotency: POST twice with the same key on the chat route → executes once, `idempotent:true`. Non-indexed route POST → single attempt, no retry, 5xx surfaced.

**Risk.** The `sseStream` rewrite is genuinely new work. Single-flight refresh must not deadlock under recursive 401 (401 on refresh → no retry). The honest scope (indexed-routes-only) prevents a retry that silently double-writes. The SSE gap during leadership handoff is a real, documented limitation — not a bug to "fix" in this track (non-leader event relay is out of scope).

**Rollback.** Restore the `data:`-only `sseStream` (no `Last-Event-ID`); disable refresh-on-401; drop the `Idempotency-Key` header. The server resume path is unaffected.

---

#### D6 — Local client: stdio shim + CLI device flow + 0o600 atomic write + structured errors + cold-start no-TTY runtime invariant + .env.example docs

**Objective.** The stdio MCP shim and CLI gain device-flow bootstrap: `mc auth device` → `user_code` → approve → token stored at 0o600 via atomic temp+rename (same-dir). Structured `{error,message,action}` errors replace the raw throw at `mc-mcp-server.cjs:82`. Runtime-verified cold-start no-TTY invariant. `.env.example` documents `OPZAVA_TOKEN_ENC_KEY` + `OPZAVA_INSECURE_STORAGE`.

**Files.**
- `scripts/mc-mcp-server.cjs:82` (raw error throw → structured `{error,message,action}`), `:23` (`loadConfig` → device-flow bootstrap), `:60` (`api()` → stored device token + refresh-on-401)
- `scripts/mc-cli.cjs` (`mc auth device` command, XDG credentials path, atomic temp+rename 0o600 write in the SAME dir as the target)
- `scripts/lib/mc-client.cjs` (from C0 — the shared credential store)
- `.env.example` (append `OPZAVA_TOKEN_ENC_KEY` + `OPZAVA_INSECURE_STORAGE`)

**Depends_on.** `[D4, C0]`  *(Grill-2: C0 added — D6 edits `scripts/lib/mc-client.cjs` which C0 creates.)*

**Acceptance criteria.**
1. `mc auth device` prints `user_code` + `verification_uri`, polls, on approval stores the token pair in an XDG-respecting file written via atomic temp+rename (same dir as target) at 0o600 (no passphrase).
2. The stdio shim reads the stored token on spawn (no TTY prompt — cold-start-after-reboot works), refreshes on 401 via D5, never logs `mc_dt_`/`mc_rt_`/`device_code` (redaction).
3. **COLD-START NO-TTY RUNTIME INVARIANT:** spawn the shim with a piped (non-TTY) stdin and no credential file → exits non-zero within N seconds with a stderr line containing `'mc auth device'` (actionable), never blocks on `stdin.read`.
4. `mc-mcp-server.cjs` `tools/call` returns structured `{error:'unauthorized'|'forbidden'|'not_found'|'rate_limited'|'server_error', message, action}` preserving the HTTP status (replaces the collapsed text at `:82`).
5. Default scope is viewer/operator — the shim holds a non-admin token (`issueForDevice` caps scope per D2; an admin approving their own device still gets operator/viewer).
6. `.env.example` documents `OPZAVA_TOKEN_ENC_KEY` (optional, "envelope-encrypts rotation-chain columns; fallback `AUTH_SECRET`") and `OPZAVA_INSECURE_STORAGE` (default unset; set to 1 ONLY to opt into plaintext local token file, never default).
7. Test: `mc auth device` against a stubbed approval → token file at 0o600 with the correct shape, no passphrase; a 401 tool call triggers a refresh + retry.
8. `pnpm test:all` green.

**Test.** node:test: mock the device endpoints, run the bootstrap, assert the credentials file mode is 0o600, contains no passphrase. `tools/call` against a stubbed REST returning 403 → structured `{error:'forbidden', status:403}`. Redaction: no log line contains `mc_dt_`/`mc_rt_`. Cold-start: spawn with piped stdin + no cred file → non-zero exit with `'mc auth device'` on stderr within N seconds.

**Risk.** Atomic temp+rename across filesystems can fail; write the temp in the SAME dir as the target. The shim MUST fail loudly (not silently) if the credential file is missing AND no device flow is possible (no TTY). The cold-start invariant is load-bearing for every reboot.

**Rollback.** Remove `mc auth device`; revert `mc-mcp-server.cjs:82` to the raw throw; the shim falls back to `MC_API_KEY`. The D2–D5 server machinery remains.

---

#### D7 — Redaction governance test + openapi.json specs + 60-api-layer.md docs (regex covers the ACTUAL logging primitives)

**Objective.** Add a `test/*.test.mjs` redaction governance test (no raw tokens in logs/errors). openapi.json specs for the ~10 new device/auth endpoints (`api:parity` runs FIRST in `test:all` at `package.json:29` — every route needs a spec or the gate fails); `60-api-layer.md` documents the new routes. **Grill-2 FIX (medium gap):** the redaction regex anchors on `console.*` but the device-flow logging surface uses `logSecurityEvent`/`logAuditEvent`/`eventBus.broadcast` (`injection-guard.ts:540`), so a `logSecurityEvent({detail: JSON.stringify({token})})` leak PASSES the regex (false negative). The regex must cover the actual primitives.

**Files.**
- `test/device-auth-redaction.test.mjs` (NEW — mirror `test/status-healthcheck-contract.test.mjs`)
- `openapi.json` (NEW specs for `/api/auth/device/code`, `/token`, `/revoke`, `/api/auth/devices`, `/api/auth/devices/[id]/revoke`)
- `docs/architecture/system-map/60-api-layer.md` (document the new `/api/auth/device/*` routes)
- reads: `src/opzava/core/auth/**`, `src/app/api/auth/**`, `scripts/mc-cli.cjs`, `scripts/mc-mcp-server.cjs`, `scripts/lib/mc-client.cjs`

**Depends_on.** `[D6, D4]`

**Acceptance criteria.**
1. **The redaction regex covers the actual logging primitives (Grill-2):** assert no occurrence of `mc_dt_`/`mc_rt_`/`device_code=`/`refresh_token` in ANY source line that also contains `logSecurityEvent|logAuditEvent|broadcast|throw|Error(` (not just `console.*`).
2. **POSITIVE-CONTROL TEST (Grill-2):** temporarily inject `logSecurityEvent({detail: JSON.stringify({token:'mc_dt_xxx'})})` → the test FAILS; revert.
3. openapi.json contains a spec for every new device/auth path+method with request/response schemas; `api:parity` passes.
4. `60-api-layer.md` lists the new `/api/auth/device/*` and `/api/auth/devices/*` routes.
5. Wired into `test:governance` → `test:all`.
6. `pnpm test:all` green.

**Test.** node:test: the redaction test itself. `api:parity`: every new route has a spec. Negative control: add a `console.log(mc_dt_...)` AND a `logSecurityEvent({...mc_dt_...})` → both fail the redaction test; revert.

**Risk.** Regex redaction tests can be bypassed by string concatenation; anchor on the call sites and review in `/security-review`. The openapi specs are a hard `test:all` gate — missing one blocks the build.

**Rollback.** Delete `test/device-auth-redaction.test.mjs`; remove the openapi specs (`api:parity` reverts to the pre-device surface); no production code depends on these.

**End of Track D.**


### Track E — MCP server hardening

**Goal.** Convert the code-reading-only MCP findings to runtime-verified (spawn stdio, exercise real JSON-RPC), add a MCP-tools-vs-routes contract test, per-tool timeouts with route context (using the C0 shared `httpRequest`), preserve HTTP status in errors, handle `notifications/cancelled`, and fix the CLI cron verb mapping. **Priority band: P1.**

---

#### E1 — MCP stdio integration test harness (spawn + JSON-RPC initialize/tools.list/tools.call/notifications.cancelled)

**Objective.** Replace the static require()-only test (`mc-mcp-server.test.mjs:17` require()s, never spawns) with a harness that spawns the stdio server, pipes real JSON-RPC, and asserts runtime behavior.

**Files.**
- `scripts/mc-mcp-server.test.mjs:17` (currently require()s the module, never spawns stdio)
- `scripts/mc-mcp-server.cjs:917` (method switch), `:954-959` (tools/call catch), `:86` (AbortError → 'Request timeout (30s)'), `:896-898` (`CAPABILITIES={tools:{}}`)
- `NEW scripts/mc-mcp-server.spawn.test.mjs` (the harness)

**Depends_on.** `[D2]`

**Acceptance criteria.**
1. The harness spawns the server as a child, sends `initialize`, asserts a successful `InitializeResult` with `protocolVersion` + `capabilities.tools`.
2. Sends `tools/list` and asserts the TOOLS array; sends a `tools/call` with a stubbed fetch and asserts the result.
3. Sends `notifications/cancelled` for an in-flight `tools/call` and asserts the fetch aborts (AbortController keyed by request-id) — converts the code-reading-only abort claim to runtime-verified.
4. Probes an unimplemented method and asserts `-32601 Method not found` at runtime.
5. The 30s timeout is asserted via a fake clock / a tool with a 1ms timeout override.
6. `pnpm test:all` green.

**Test.** node:test: the harness itself. Assertions on the spawned child's stdout JSON-RPC responses.

**Risk.** Spawning a child in CI can be flaky on timing; use deterministic fake clocks for the timeout and a stubbed REST (no real network). Buffer stdout and parse line-by-line JSON-RPC.

**Rollback.** Delete the spawn harness; the static require()-only test remains (status quo).

---

#### E2 — MCP-tools-vs-routes contract test (resolve each TOOLS handler api() target to a route file)

**Objective.** The surviving sub-claim of the REFUTED 'api:parity not in test:all' finding: no test resolves each TOOLS handler's `api()` target to a route file. Build that contract test. (`api:parity` IS already in `test:all` at `package.json:29` — verified; `/api/v1/runs` is NOT ignore-listed — those halves are refuted.)

**Files.**
- `scripts/mc-mcp-server.cjs:95` (TOOLS array), `:101`/`:369`/`:572`/`:721` (pass-through GET `/api/agents`, POST `/api/tasks`, POST `/api/connect`, POST `/api/v1/runs`)
- `scripts/api-contract-parity.ignore` (confirmed: only comment lines, no route entries)
- `NEW scripts/mcp-tools-routes-contract.test.mjs`

**Depends_on.** `[E1]`

**Acceptance criteria.**
1. The test parses the TOOLS array, extracts each handler's `api()` target (method + URL), asserts a matching route file exists under `src/app/api/`.
2. Every TOOLS handler is mapped to a route; a handler whose target route is missing fails the test (prevents perma-ignored `/api/v1/runs` drift).
3. Dynamic URL templates (`/api/agents/${id}`) are normalized to the route folder pattern (`src/app/api/agents/[id]/route.ts`).
4. Confirms `api:parity` runs in `test:all` (`package.json:29`) and `api-contract-parity.ignore` has no route entries.
5. `pnpm test:all` green.

**Test.** node.test: the contract test itself. Negative control: add a TOOLS entry pointing at a non-existent route → test fails.

**Risk.** Dynamic URL templates must be normalized to the `[id]` bracket convention.

**Rollback.** Delete the contract test; the `api:parity` gate (already in `test:all`) continues to run.

---

#### E3 — Per-tool timeouts + route context + preserve HTTP status + notifications/cancelled AbortController map (uses C0 httpRequest)

**Objective.** Replace the 30s blanket timeout (`mc-mcp-server.cjs:74`) with per-tool/category timeouts carrying route context; preserve the HTTP status in the tool error (the collapsed-error at `:82`); implement `notifications/cancelled` via a request-id AbortController map. Uses the C0 shared `httpRequest(timeoutMs)`.

**Files.**
- `scripts/mc-mcp-server.cjs:74` (30000ms blanket timeout), `:82` (collapsed HTTP error), `:913` (notifications/initialized only — add notifications/cancelled)
- `scripts/lib/mc-client.cjs` (from C0 — `httpRequest(timeoutMs)` per call)

**Depends_on.** `[E1, C0]`

**Acceptance criteria.**
1. Each TOOLS entry declares a `timeoutMs` (run-reporting/session-continue get a longer budget than quick reads); the AbortController uses it.
2. `tools/call` errors include the HTTP status code and the route path (e.g. `{error:'server_error', status:502, route:'/api/v1/runs'}`) — no longer collapsed.
3. `notifications/cancelled` looks up the in-flight AbortController by request-id and aborts it; the aborted fetch surfaces as a cancelled result (not -32601).
4. The 30s blanket constant is removed; no tool inherits a hidden default.
5. Test: a slow tool (stubbed 5s) with a 1s timeout returns the timeout error with route context; a cancelled in-flight call aborts cleanly.
6. `pnpm test:all` green.

**Test.** node.test (via E1 harness): stub a tool route that sleeps 5s, set `timeoutMs=1000`, assert timeout error with `{route}`. `notifications/cancelled` mid-call → abort. Stub a 502 → status preserved.

**Risk.** Per-tool timeout values must be chosen carefully (too short aborts legitimate long runs). Start conservative and tune via the run-reporting/session-continue category.

**Rollback.** Restore the 30000ms blanket timeout + collapsed error + notifications/initialized-only handling.

---

#### E4 — Fix CLI cron verb mapping (create→add, pause/resume→toggle, run→trigger) + integration test

**Objective.** The CLI cron verbs (`mc-cli.cjs:540-547`) all POST to `/api/cron` with `bodyFromFlags` and no action field; the route action vocabulary is `{list,logs,history,toggle,trigger,remove,add,clone}`. Map CLI verbs to route actions; 'update' has no route action (map to add-with-id or remove). Add a CLI integration test.

**Files.**
- `scripts/mc-cli.cjs:540-547` (cron: create/update/pause/resume/remove/run all `body: bodyFromFlags||{}`, no action)
- `src/app/api/cron/route.ts` (action branches: `toggle:272`, `trigger:298`, `remove:342`, `add:367`, `clone:416`)
- `NEW scripts/mc-cli-cron.test.mjs`

**Depends_on.** `[]`

**Acceptance criteria.**
1. CLI cron create → action:'add'; pause/resume → action:'toggle'; run → action:'trigger'; remove → action:'remove'; list → GET; 'update' mapped to add-with-id (backward compat).
2. Each CLI cron verb produces the correct `{method, route, body:{action, ...}}` for the route's action switch.
3. Integration test: each CLI cron verb against a stubbed `/api/cron` returns the expected action-handled response (not a 400 from an unknown action).
4. `pnpm test:all` green.

**Test.** node.test: invoke each CLI cron verb with a stubbed `httpRequest`, assert the outgoing `body.action` matches. Negative: 'update' asserts mapped-to-add-with-id.

**Risk.** Removing/changing 'update' could break operator scripts; document the mapping in the CLI --help and ops-cheatsheet. Prefer update→add-with-id for backward compat.

**Rollback.** Restore the bodyFromFlags-only cron verbs (no action field).

**End of Track E.**

---

### Track F — Client-connectivity truthing + dead surface

**Goal.** Truth the client-connectivity surface: relabel Claude Desktop/Codex Desktop as planned, relabel `/api/adapters` as an event-ingest shim, pin `OPENCLAW_GATEWAY_IMAGE` to a digest + gateway-protocol contract test (across ALL THREE compose files — Grill-2), and gate/move the social+general-va scaffold. **Priority band: P2.**

---

#### F1 — Relabel desktop adapters + /api/adapters + gate social/general-va scaffold

**Objective.** Mark claude-desktop/codex-desktop as 'planned/not implemented' (or implement+test); relabel `/api/adapters` (`openclaw.ts` broadcasts `agent.created` at `:9`, `generic.ts` is event-only) as an event-ingest shim and document openclaw-adapter != openclaw-gateway; gate or move the social+general-va scaffold behind a feature flag.

**Files.**
- `src/lib/adapters/openclaw.ts:9` (broadcasts `agent.created`), `generic.ts` (event-only), `index.ts:18` (`getAdapter`)
- `src/app/api/adapters/route.ts:67` (`adapter.register`)
- `docs/architecture/system-map/51-inherited-integrations.md` (relabel)
- `src/opzava/modules/social`, `src/opzava/modules/general-va` (gate scaffold)

**Depends_on.** `[]`

**Acceptance criteria.**
1. claude-desktop/codex-desktop connectors labeled 'planned' in UI + docs (or implemented with a test) — no surface claims a working integration that does not exist.
2. `/api/adapters` documented as an event-ingest shim (broadcast-only, no real framework connect/invoke); the openclaw-adapter vs openclaw-gateway distinction is explicit in `51-inherited-integrations.md`.
3. social + general-va scaffold gated behind a feature flag (or moved to a stubs dir) so it does not appear as a shipped feature.
4. Test (governance): a docs/branding-style test asserts the 'planned' label where required.
5. `pnpm test:all` green.

**Test.** node.test governance: grep the integrations doc + UI strings for the desktop connectors, assert 'planned' (or a passing implementation test).

**Risk.** Relabeling may disappoint users; communicate clearly. Gating social/general-va must not break imports — use a feature flag read at the route layer.

**Rollback.** Restore the original labels; ungate the scaffold.

---

#### F2 — Pin `OPENCLAW_GATEWAY_IMAGE` to a digest + gateway-protocol contract test (ALL THREE compose files)

**Objective.** Pin the gateway container image to an immutable digest (not a moving tag) across ALL THREE compose files (Grill-2: `docker-compose-openclaw.yml:21` was missed) and add a contract test asserting the gateway protocol surface Opzava depends on (the two compatibility fallbacks at `spawn/route.ts:83` sessions_spawn, `:100` agent).

**Files.**
- `docker-compose.yml`, `docker-compose.dokploy.yml`, **`docker-compose-openclaw.yml:21`** (Grill-2 added — `OPENCLAW_GATEWAY_IMAGE` — pin the DEFAULT via `${OPENCLAW_GATEWAY_IMAGE:-...@sha256:...}`, not hardcode, so operators can override)
- `src/app/api/spawn/route.ts:83` (`callOpenClawGateway('sessions_spawn',...)`), `:100` (`callOpenClawGateway('agent',...)`)
- `src/lib/openclaw-gateway.ts:67` (`sessions_spawn` legacy-RPC note)
- `NEW test/gateway-protocol-contract.test.mjs`

**Depends_on.** `[F1]`

**Acceptance criteria.**
1. `OPENCLAW_GATEWAY_IMAGE` references a `sha256` digest in ALL THREE compose files (`docker-compose.yml`, `docker-compose.dokploy.yml`, `docker-compose-openclaw.yml`), pinned as the default in a `${VAR:-digest}` pattern (operator-overridable).
2. The contract test asserts the two gateway RPC methods Opzava calls (`sessions_spawn`, `agent`) are documented + the fallback paths at `spawn/route.ts:83`/`:100` match the documented protocol.
3. `test/gateway-protocol-contract.test.mjs` codifies the expected gateway surface so a moving-target upstream change fails CI.
4. `pnpm test:all` green.

**Test.** node.test: assert the image string matches `@sha256:[a-f0-9]{64}` in all three files; assert the spawn fallback method names match the contract doc.

**Risk.** Pinning to a digest blocks security updates until manually bumped; document the bump cadence in ops-cheatsheet. The contract test must not over-constrain (allow additive changes).

**Rollback.** Restore the mutable tag; delete the contract test.

**End of Track F.**

---

### Track G — Horizontal-scale honesty (single-active-writer + cross-tenant fix + workspace-iteration loop + correct TTL invariant)

**Goal.** Resolve the `CLAUDE.md`-mandate-vs-`deployment.md`-reality contradiction: adopt single-active-writer via a leader-election/advisory-lock seam so only one replica scheduler runs the dispatch chain; thread explicit `workspaceId` through `runAegisReviews` AND `requeueStaleTasks` AND add a **workspace-iteration loop** in the scheduler tick (the REAL multi-tenancy fix — Grill-2 critical catch); use the CORRECT invariant (lock TTL < lease TTL). **Priority band: P0.**

---

#### G1 — Leader-election/advisory-lock seam + workspace-iteration loop in the scheduler tick + thread explicit workspaceId + correct TTL invariant

**Objective.** v1 had THREE defects (named and addressed): (1) wrong-function target — `runAegisReviews` (`task-dispatch.ts:980`, takes NO `workspaceId`, SELECT at `:989` has NO `WHERE t.workspace_id` filter) scans ALL workspaces; (2) removing the `?? 1` default does NOT add the filter; (3) inverted invariant (v1 said lease < lock; correct is **lock < lease**). **v3 ADDS THE WORKSPACE-ITERATION LOOP (Grill-2 critical):** the global scheduler (`scheduler.ts:57` `runTaskDispatchChain`, `:172` `runAegisReviews(makeDefaultDeps())`, `:190` `requeueStaleTasks(makeDefaultDeps())`) has NO workspace-iteration loop today — threading a single `workspaceId` would only service ONE workspace. The loop iterates `listWorkspaces()`.

**Files.**
- `src/lib/scheduler.ts:57-67` (`runTaskDispatchChain` — wrap in `acquireLeadership()` + workspace loop), `:163` (dispatch chain handler), `:172` (`runAegisReviews` handler), `:190` (`requeueStaleTasks` handler)
- `src/lib/task-dispatch.ts:980-992` (`runAegisReviews` — thread `deps.workspaceId`, add `WHERE t.workspace_id = ?`, throw when unset)
- `src/lib/task-dispatch.ts:1162-1176` (`requeueStaleTasks` — thread `workspaceId`, add `WHERE t.workspace_id = ?`)
- `src/lib/task-dispatch.ts:399` (`reconcileDeferredTaskCompletions` `workspaceId ?? 1` — remove the default, require explicit)
- `NEW src/lib/leader-lock.ts` (advisory lock via a `leader_locks` table — single-active-writer)

**Depends_on.** `[A1]`

**Acceptance criteria.**
1. `acquireLeadership()` returns true on at most one replica; the tick runs the dispatch chain only when held; replicas without leadership skip dispatch (read-only).
2. **WORKSPACE-ITERATION LOOP (Grill-2 critical):** `runTaskDispatchChain` / the aegis handler / the requeue handler iterate `for (const ws of listWorkspaces()) { ...deps with workspaceId: ws.id }`. A task in workspace 2 is reviewed/requeued/reconciled by the scheduler. No throw on the scheduler path.
3. **CORRECT INVARIANT:** lock TTL < lease TTL (e.g. lock 90s, lease 10min) — a crashed leader's lock expires BEFORE any in-flight claimed task's lease. v1 stated the opposite. **CROSS-TASK INVARIANT (Grill-2):** a test asserts `LEASE_TTL_MS > LOCK_TTL_MS` reading both constants; lives here AND in A5 (AC #8).
4. `acquireLeadership()` is checked INSIDE the dispatch/aegis/requeue HANDLERS only — heartbeat/cleanup scheduled tasks still execute on non-leader replicas (assertion: a non-leader's heartbeat task fires within its interval).
5. **CROSS-TENANT FIX:** `runAegisReviews` (SELECT at `:989`) AND `requeueStaleTasks` (SELECT at `:1164`) BOTH filter `WHERE t.workspace_id = ?` bound from the loop's workspace context; a quality_review/stale task in workspace 2 is invisible to a workspace-1 writer.
6. `reconcileDeferredTaskCompletions` (`:399`) requires explicit `workspaceId` (no `?? 1` default).
7. Concurrency test: two simulated replica ticks with the lock → exactly one runs `dispatchAssignedTasks`, the other skips; simulate leader crash → the reclaiming replica waits until BOTH lock TTL AND lease TTL elapsed before acquiring.
8. `runAegisReviews`/`requeueStaleTasks` throw (or no-op) when `workspaceId` is unset — no silent default-to-1, no cross-workspace scan.
9. `pnpm test:all` green.

**Test.** Vitest: two `acquireLeadership()` calls → exactly one true; after lock TTL expires AND lease TTL elapses, the second acquires (NOT before lease expiry). `runAegisReviews` without `workspaceId` → throws. Cross-tenant: a quality_review row in workspace 2 → invisible to a workspace-1 writer. **Workspace loop: a task in workspace 2 IS reviewed/requeued** (the Grill-2 catch). Non-leader heartbeat still fires. Invariant test: `LEASE_TTL_MS > LOCK_TTL_MS`.

**Risk.** A leader-lock failure (crash without release) is recovered by the TTL; the CORRECT invariant (lock < lease) bounds double-dispatch to ZERO and failover downtime to lock TTL. The lock table is a new high-frequency write point (heartbeat every ~lock TTL/3) — counted in A0's checkpoint cadence. **The workspace loop is load-bearing for multi-tenancy** — without it only workspace 1 is serviced. **Existing in-memory rate limiters remain split across replicas (G1 does NOT close this generally) — documented; only D3.5's DB-backed limiters are replica-consistent.**

**Rollback.** Remove `acquireLeadership()` gating (all replicas dispatch again — the pre-fix state); restore `workspaceId ?? 1`; remove the workspace filters + the loop. The `leader_locks` table can remain unused.

---

#### G2 — Reframe CLAUDE.md + deployment.md + ops-cheatsheet single-active-writer honestly

**Objective.** Reframe the 'ENFORCE horizontal scalability' mandate to honestly describe single-active-writer over SQLite today, with Postgres (ARD 0006) as the path to true multi-writer scale. Update `deployment.md:625` (verified: 'SQLite uses WAL mode but does not support multiple writers').

**Files.**
- `CLAUDE.md` (Critical Constraints — reframe horizontal scalability)
- `docs/deployment.md:625` (SQLite single-writer — reconcile with the mandate)
- `docs/ops-cheatsheet.md` (single-active-writer + leader-lock behavior + lock/lease TTLs)

**Depends_on.** `[G1]`

**Acceptance criteria.**
1. CLAUDE.md 'ENFORCE horizontal scalability' reframed to 'single-active-writer over SQLite (leader-elected scheduler); Postgres (ARD 0006) is the path to true horizontal scale' — honest, not aspirational.
2. `deployment.md:625` consistent with the leader-lock seam (one active writer, N read replicas).
3. ops-cheatsheet documents the lock TTL (90s), lease TTL (10min), the lock<lease invariant, failover behavior, and that read replicas serve reads while the elected writer dispatches.
4. `pnpm test:all` green (governance tests pass).
5. Assert CLAUDE.md no longer contains the unqualified 'ENFORCE horizontal scalability' without the single-active-writer qualifier.

**Test.** Manual doc review + governance test pass. Assert CLAUDE.md no longer contains the unqualified mandate.

**Risk.** Softening a mandate can read as backsliding; frame it as honesty (code wins) and keep the Postgres path explicit so it is not abandoned.

**Rollback.** Restore the original CLAUDE.md/deployment.md wording.

**End of Track G.**


### Track H — SQLite durability & graceful drain (coordinated shutdown)

**Goal.** Decide synchronous level + wal_checkpoint policy (A0, front-loaded and HARD-GATING), make the graceful drain ACTUALLY await scheduler idle (v1 was self-contradictory — the drain explicitly did NOT await `stopBackgroundTimers`, and `stopScheduler` is a bare `clearInterval` that does not await the in-flight tick), coordinate the THREE conflicting SIGTERM handlers (`closeDatabase` LAST), and add MCP server signal handlers. **Priority band: P0.**

---

#### H2 — Graceful drain ACTUALLY awaits scheduler idle + coordinated SIGTERM ordering (closeDatabase LAST) + MCP signal handlers + bounded stopScheduler

**Objective.** v1 was self-contradictory and did NOT close the crash-window: the real drain (`mc-server.cjs:84`) explicitly does NOT await `stopBackgroundTimers` ('best-effort; do not await'), and `stopScheduler` (`scheduler.ts:593`) is a bare `clearInterval` that does NOT await the in-flight tick (`await spec.handler` at `:529`). **Verified double-close hazard:** `db.ts:709-710` registers `closeDatabase` on SIGINT/SIGTERM, AND `db.ts:266` `registerProcessShutdown` registers ANOTHER handler — a SIGTERM during an in-flight dispatch can close the DB handle BEFORE the dispatch finishes. v3: make the drain AWAIT `stopBackgroundTimers` (Promise.race with DRAIN_MS), make `stopScheduler` await the in-flight tick with the SAME DRAIN_MS bound, and establish ONE canonical ordering.

**Files.**
- `scripts/mc-server.cjs:80-95` (`performGracefulDrain` — change to AWAIT `stopBackgroundTimers` via `Promise.race([stopPromise, drainTimer])`; remove the 'do not await' comment at `:84`)
- `src/lib/scheduler.ts:593-597` (`stopScheduler` — track `activeTick: Promise<void>|null`, return `await Promise.race([activeTick, timeout(DRAIN_MS)])`; `:529` sets `activeTick = spec.handler(...)`)
- `src/lib/db.ts:709-710` (`closeDatabase` on SIGINT/SIGTERM — MOVE INSIDE the coordinated drain AFTER `awaitSchedulerIdle`, OR guard to run only on process `'exit'` which fires after async drains resolve)
- `src/lib/db.ts:266` (`registerProcessShutdown` — coordinate with the drain ordering; establish ONE canonical ordering)
- `scripts/mc-mcp-server.cjs` (add `process.on('SIGINT'/'SIGTERM')` that triggers the notifications/cancelled-style abort of in-flight fetches from E3)
- `test/mc-server-drain.test.mjs` (extend to scheduler-await)

**Depends_on.** `[G1, A0]`

**Acceptance criteria.**
1. The drain calls `awaitSchedulerIdle()` (awaits the in-flight dispatch tick to quiesce or a bounded DRAIN_MS timeout) via `Promise.race` BEFORE `server.close()`+exit — `mc-server.cjs:84` no longer says 'do not await'.
2. `stopScheduler` (`scheduler.ts:593`) tracks `activeTick` and awaits it with the SAME DRAIN_MS bound (`Promise.race([activeTick, timeout(DRAIN_MS)])`) — on timeout it logs the in-flight task ids (reclaimed by the A5 lease) and resolves (abandoning the promise, safe under single-writer). A hung tick does NOT delay process exit beyond DRAIN_MS + epsilon (Grill-2 low gap).
3. **COORDINATED SIGTERM ORDERING (closes the double-close hazard, verified at db.ts:709-710 vs :266):** (1) `stopScheduler`/abort in-flight dispatch FIRST (`awaitSchedulerIdle`), (2) `server.close()`, (3) `closeDatabase()` LAST. `db.ts:709-710`'s `closeDatabase`-on-SIGINT/SIGTERM is moved inside the coordinated drain OR guarded to run only on process `'exit'`. ONE canonical ordering — the three-way coordination (registerProcessShutdown, closeDatabase, the drain) is resolved.
4. A SIGTERM during an in-flight dispatch does NOT throw SQLITE on a closed handle — the dispatch completes or times out within DRAIN_MS before `closeDatabase` runs.
5. The drain timeout (DRAIN_MS) bounds the wait; after timeout it proceeds (logging the in-flight task ids — they will be reclaimed by the A5 lease on the next writer's startup sweep).
6. The MCP server installs SIGINT/SIGTERM handlers that abort in-flight `tools/call` fetches (via the E3 request-id AbortController map) and exit cleanly (idempotent dispose).
7. The 'drain doesn't await dispatch' claim is converted to runtime-verified.
8. `pnpm test:all` green.

**Test.** node.test: extend `test/mc-server-drain.test.mjs` — start a fake dispatch, trigger drain, assert it AWAITED the dispatch (not fire-and-forget) or timed out + logged the task id. SIGTERM during dispatch → no SQLITE error on a closed handle. A hung tick → process exit within DRAIN_MS + epsilon. MCP server: spawn, start a slow `tools/call`, send SIGTERM → fetch aborted, clean exit.

**Risk.** Awaiting scheduler idle can delay shutdown; bound it with DRAIN_MS and log in-flight tasks (reclaimed by the A5 lease). The signal handlers must be idempotent (no double-fire). The THREE-way SIGTERM coordination (`registerProcessShutdown`, `closeDatabase`, the drain — verified all three exist) is the subtle part — establish ONE canonical ordering.

**Rollback.** Remove `awaitSchedulerIdle` from the drain (restore 'do not await'); restore `db.ts:709-710` `closeDatabase`-on-SIGNAL; remove the MCP signal handlers. The A5 lease still reclaims abandoned tasks on the next startup.

**End of Track H.**

---

### Track I — Dokploy operability (cookie/TLS hardening + backup/restore)

**Goal.** Close the three live Dokploy hazards v1 was entirely silent on: (1) the sticky affinity cookie is httpOnly-only with no Secure/SameSite (verified `docker-compose.dokploy.yml:101-103`); (2) Traefik `forwardedHeaders.insecure=true` (`:20`) means `isRequestSecure` trusts a client-supplied `x-forwarded-proto`; (3) backup is default-off (`scheduler.ts:88`) and there is NO restore path. Plus the 8h-revoke operable kill-switch. **Priority band: P0.**

---

#### I1 — Cookie/TLS/forwarded-header hardening for Dokploy + the D4 approval page

**Objective.** Three verified live hazards: (1) the Traefik sticky cookie (`docker-compose.dokploy.yml:101-103`) is `httpOnly=true` only, no Secure/SameSite — rides every request unsecured on an HTTPS Dokploy deploy, a session-fixation/CSRF surface D4's `/device` approval rides on. (2) Traefik `forwardedHeaders.insecure=true` (`:20`) means `isRequestSecure` (`session-cookie.ts:12`) trusts a CLIENT-SUPPLIED `x-forwarded-proto` — an attacker sending `X-Forwarded-Proto: https` over plain HTTP forces `isRequestSecure()=true`, breaking the `__Host-` contract. (3) D4's `/device` page is cookie-authenticated so these issues gate whether device approval works behind a misconfigured proxy.

**Files.**
- `docker-compose.dokploy.yml:101-103` (sticky cookie — add Secure + SameSite=Lax via traefik labels: `loadbalancer.sticky.cookie.secure=true` + `.samesite=lax`)
- `docker-compose.yml` (mirror the sticky cookie Secure+SameSite labels)
- `docker-compose.dokploy.yml:20` (`forwardedHeaders.insecure=true` — document as dev/parity-only; in prod require `MC_TRUSTED_PROXY_CIDRS` or `MC_COOKIE_SECURE=1`)
- `src/lib/session-cookie.ts:11-14` (`isRequestSecure` trusts `x-forwarded-proto` — gate behind a trusted-proxy allowlist `MC_TRUSTED_PROXY_CIDRS`, OR require `MC_COOKIE_SECURE=1` in prod)
- `src/app/api/auth/login/route.ts` (cookie resolution — impacted)

**Depends_on.** `[]`

**Acceptance criteria.**
1. The Traefik sticky cookie is set Secure + SameSite=Lax via labels in `docker-compose.dokploy.yml` AND `docker-compose.yml`.
2. `isRequestSecure` does NOT flip to true on a spoofed `X-Forwarded-Proto` when `forwardedHeaders.insecure=true`, UNLESS the source IP is in `MC_TRUSTED_PROXY_CIDRS` (or `MC_COOKIE_SECURE=1` is set explicitly in prod).
3. D4's `/device` approval page explicitly works under both `__Host-` and legacy cookie names; the TLS assumption is added to D4's risk.
4. Test: behind the parity Traefik with insecure forwarded headers, `isRequestSecure` must NOT flip to true on a spoofed `X-Forwarded-Proto` unless the source IP is in the trusted set.
5. `pnpm test:all` green.

**Test.** node.test: send `X-Forwarded-Proto: https` from a non-trusted IP with insecure forwarded headers → `isRequestSecure` false. From a trusted CIDR → true. Assert the sticky cookie labels include secure + samesite.

**Risk.** Forcing Secure on the sticky cookie requires HTTPS end-to-end (correct for prod, but local HTTP dev needs the `MC_COOKIE_SECURE` override documented). The trusted-proxy allowlist must be operator-configured.

**Rollback.** Remove the Secure/SameSite labels; restore unconditional `x-forwarded-proto` trust; document `forwardedHeaders.insecure` as dev-only.

---

#### I2 — Backup default-on + restore path + restore test (WAL/SHM discard + leader_locks reset)

**Objective.** v1 had NO task for backup/restore despite it being the #1 ops recovery primitive. Current state: `runBackup` (`scheduler.ts:244`) uses the correct SQLite Online Backup API (WAL-safe) but is `defaultEnabled:false` (`:88`), writes to `.data/backups` (named volume `mc-dokploy-data`), prunes to 10 — but there is ZERO restore path. **Grill-2 + red-team additions:** (a) the `mc db restore` CLI verb MUST unlink `<db>-wal` and `<db>-shm` before/after replacing the main db (WAL files are database-specific and must not survive a restore); (b) after restoring, `DELETE FROM leader_locks` so the restarted replica acquires leadership cleanly, and rely on the A5 startup sweep to reclaim stale `claimed_at`.

**Files.**
- `src/lib/scheduler.ts` (`auto_backup` — flip `defaultEnabled` to true)
- `docs/deployment.md` (documented restore procedure: stop the writer, replace `.data/mission-control.db` with the backup, **DISCARD `-wal`/`-shm`**, `DELETE FROM leader_locks`, restart)
- `docs/ops-cheatsheet.md` (restore runbook)
- `scripts/mc-cli.cjs` (add `mc db restore <path>` — stop-the-writer + Online-Backup-in-reverse + `integrity_check` + **unlink `-wal`/`-shm`** + **`DELETE FROM leader_locks`**)

**Depends_on.** `[A0]`

**Acceptance criteria.**
1. `auto_backup` `defaultEnabled` flipped to true (retention 10).
2. A documented restore procedure in `docs/deployment.md` + ops-cheatsheet: stop the writer, replace the db with the backup (discard `-wal`/`-shm`), `DELETE FROM leader_locks`, restart.
3. `mc db restore <path>` CLI verb: stop-the-writer + `integrity_check` + **unlink `<db>-wal` and `<db>-shm`** (Grill-2) + **`DELETE FROM leader_locks`** (red-team).
4. Acceptance test: restore from a backup over a DB with a non-empty WAL, assert the post-restore WAL is empty + `integrity_check` ok + `leader_locks` is empty + the startup sweep reclaims stale `claimed_at`.
5. Tie to A0's durability decision (FULL reduces the need but does not eliminate restore).
6. `pnpm test:all` green.

**Test.** node.test: take a backup via `runBackup`, restore it (CLI verb), assert the row count matches + `integrity_check` ok + WAL empty + `leader_locks` empty.

**Risk.** A restore is a cold procedure (the writer must be stopped) — document it clearly. Restoring the wrong backup loses data written since; the runbook must emphasize verifying the backup timestamp. Restoring over a live WAL setup without removing the old `-wal`/`-shm` corrupts data — the CLI verb unlinks them.

**Rollback.** Flip `auto_backup` back to `defaultEnabled:false`; remove the restore CLI verb / runbook.

**End of Track I.**


---

## 4. Linearized Execution Order (the schedule)

A valid topological sort of the dependency DAG. P0 first, then P1, then P2 — **with the Grill-2 corrections baked in:** C0 is promoted to P0 (load-bearing for D5/D6, both P0); D3.5 is inserted between D3 and D4; D6 lists C0; A5 lists G1 (shared `requeueStaleTasks` edit). Within a band, order respects `depends_on`.

```
BAND P0 (safety + auth + scale + durability + dokploy) — order matters:
  1.  A0     (durability decision + wal_checkpoint; HARD GATE)
  2.  A1     (migration 055: counters/lease/idempotency; depends A0)
  3.  B1a    (principal-binding; depends [])
  4.  B3     (connect admin-gate + hygiene; depends B1a)
  5.  B4     (SSRF on webhooks; depends [])
  6.  C0     (minimal mc-client.cjs EARLY, PROMOTED to P0; depends [])
  7.  G1     (leader-lock + workspace loop + cross-tenant fix; depends A1)
  8.  A2     (transactional write spine + full idempotency; depends A1)
  9.  A3     (atomic counters + aegis_unavailable + ENFORCED audit; depends A1)
  10. A5     (ARM THE LEASE at 3 sites + guarded completion write; depends A1,A3,G1)
  11. B2     (migration 056: source discriminator + structural VERDICT; depends B1a)
  12. A4     (migration 057: token_usage idempotency_key ONLY; depends A2)
  13. A4b    (FIX cost attribution: real cost + backfill 060; depends A4)
  14. I1     (Dokploy cookie/TLS/forwarded-header hardening; depends [])
  15. I2     (backup default-on + restore path + WAL/SHM + leader_locks; depends A0)
  16. D1     (migration 058: device tables + denylist + workspace NOT NULL; depends B1a)
  17. D2     (core/auth module: chain-level revocation by default; depends D1)
  18. D3     (token endpoints + ATOMIC disambiguation; depends D2)
  19. D3.5   (shared dbRateLimiter primitive; depends D2)
  20. B1b    (FUSED resolveDeviceToken cascade branch; depends D2)
  21. D4     (device-code endpoints + /device + DB-backed limits; depends D3,D3.5)
  22. D6     (stdio shim + CLI device flow + 0o600 atomic + cold-start invariant; depends D4,C0)
  23. D5     (resilient transport + SSE resume + honest idempotency; depends D6,C0)
  24. D7     (redaction governance + openapi specs + docs; depends D6,D4)
  25. G2     (reframe CLAUDE.md/deployment single-active-writer; depends G1)
  26. H2     (graceful drain + coordinated SIGTERM + MCP signal handlers; depends G1,A0)

BAND P1 (deep refactors + MCP):
  27. E1     (MCP stdio spawn harness; depends D2)
  28. E2     (MCP-tools-vs-routes contract test; depends E1)
  29. E3     (per-tool timeouts + route context + cancelled; depends E1,C0)
  30. E4     (CLI cron verb mapping; depends [])
  31. C1     (extract Aegis to core/reviews; depends B2)
  32. C2     (split task-dispatch: dispatch enqueues, runner executes; depends C1,A1)
  33. C3     (runner canonical path + task_id FK + stuck-task detector + daemon gating; depends C2,A1,A5,G1)
  34. C4     (deep mc-client.cjs extraction; depends C0,C2)

BAND P2 (client truthing):
  35. F1     (relabel desktop adapters + /api/adapters + gate scaffold; depends [])
  36. F2     (pin gateway image digest x3 + contract test; depends F1)
```

**Critical path note (the single longest chain):** `A0 → A1 → G1 → A5 → C2 → C3` (durability → counters → leader-lock/lease → runner unification). This chain defines the P0+P1 critical path; everything else can parallelize around it. **A0 is the keystone** — nothing in A/G/H ships until its kill-test passes.

**Migration-application order (deterministic, enforced by `runMigrations`):** `055 → 056 → 057 → 060 → 058` (and `059` only if the denylist is split out — resolved: folded into 058) → `opzava_runner_004`. The `migration-ids-unique.test.mjs` (A1) guards all ids including runner ids.

---

## 5. Local-Docker-Parity Test Matrix

One row per reliability claim. The contract: **cloud (Dokploy) == local (docker-compose)** for every behavior the plan touches. Run via `pnpm test:docker:dokploy` (`package.json:25`, `bash scripts/dokploy-parity-test.sh`) and the local stack (`bash scripts/start-standalone.sh`).

| # | Reliability claim | Local test | Dokploy-parity test | Pass criterion (cloud == local) |
|---|---|---|---|---|
| 1 | **Lease is ARMED at all 3 claim sites** (A5) | `dispatchAssignedTasks`/Aegis/`tasks/queue` claim → `claimed_at` non-null (vitest) | Same assertions against the dokploy stack with sticky-session Traefik | `claimed_at` non-null + recent on both; no double-claim under 2-replica |
| 2 | **quality_review dead-zone CLOSED** (A5) | seed `quality_review claimed_at=now-20min` → sweep/requeue flips to `review` | Same seed against dokploy; restart the writer pod | task reclaimed on both; `listStuckTasks` (C3) populated |
| 3 | **Single-active-writer — no double-dispatch at 2 replicas** (G1) | two simulated replica ticks w/ leader-lock → exactly one dispatches | actually run 2 dokploy replicas, trigger a dispatch tick on both | exactly one `dispatchAssignedTasks` claim; the other skips |
| 4 | **Cross-tenant isolation** (G1) | `quality_review` row in ws 2 invisible to ws-1 writer | same against dokploy multi-workspace | ws-1 writer never sees/requeues/reviews ws-2 tasks |
| 5 | **Slow-tick split-brain guard** (A5) | 15s provider + 10s lease → deposed leader's late write is a no-op | simulate leader loss mid-dispatch on dokploy (pod kill) | reclaiming leader's task NOT clobbered; `changes===0` logged |
| 6 | **Cost attribution non-zero** (A4b) | priced-model dispatch → `token_usage.cost > 0` | same against dokploy with a real provider key | `GET /api/tokens` returns non-zero cost on both |
| 7 | **Token rotation SERVER-SAFE** (D3) | two `Promise.all` refreshes → one 200, one 409-already_rotated, ZERO revokes | sticky-session Traefik routing refreshes across 2 replicas | same outcome; multi-process test (two handles) passes |
| 8 | **Stolen-token chain-revocation** (D2) | steal → attacker refreshes (new row, same chain) → operator revokes → attacker token rejected | same against dokploy | attacker's NEW-row token rejected on both (chain-level) |
| 9 | **DB-backed brute-force limit (not split across replicas)** (D3.5/D4) | 6 wrong user_codes from one IP across 2 simulated replicas → 429 | same against 2 dokploy replicas behind NAT | 429 on both at the SAME threshold (not 2x) |
| 10 | **Graceful drain awaits dispatch** (H2) | start dispatch, trigger drain, assert AWAITED or timed-out+logged | `kubectl delete pod` / `docker stop` during dispatch | no SQLITE-on-closed-handle error on either; in-flight task reclaimed by lease |
| 11 | **Coordinated SIGTERM ordering (closeDatabase LAST)** (H2) | SIGTERM during dispatch → no closed-handle error | dokploy rolling-deploy mid-dispatch | dispatch completes or times out within DRAIN_MS before closeDatabase |
| 12 | **WAL bounded** (A0) | 24h soak w/ auto_backup off → WAL stays bounded | dokploy long-running pod → WAL bounded | `wal_checkpoint(TRUNCATE)` reduces `-wal` near-zero on both |
| 13 | **Restore path works (WAL/SHM discard + leader_locks reset)** (I2) | backup → restore → row count matches + `integrity_check` ok + WAL empty + `leader_locks` empty | restore the dokploy named-volume db | all assertions pass on both |
| 14 | **Dokploy cookie/TLS hardening** (I1) | spoofed `X-Forwarded-Proto: https` from non-trusted IP → `isRequestSecure` false | same against dokploy Traefik w/ `forwardedHeaders.insecure=true` | `isRequestSecure` false unless source in `MC_TRUSTED_PROXY_CIDRS` |
| 15 | **MCP stdio protocol runtime-verified** (E1) | spawn harness: initialize/tools.list/tools.call/cancelled | n/a (stdio is local-only) | runtime assertions pass (parity N/A — stdio has no dokploy surface) |
| 16 | **Idempotent task capture** (A1/A2) | capture twice same `client_request_id` → second returns first w/ `idempotent:true` | same against dokploy | no dup task, no 500 on either |

**Test runner expectation:** every row above is a `vitest`/`node:test` assertion (rows 1-13, 16) or an explicit 2-replica dokploy procedure (rows 3, 7, 9, 11). Rows 3/7/9/11 are the ones that ONLY catch defects at >1 replica — they are mandatory for the single-active-writer claim and cannot be substituted by single-replica tests.


---

## 6. Risk Register

Ordered by residual risk after the plan is executed (highest first). Each row names the risk, the tasks that mitigate it, and the residual exposure.

| # | Risk | Mitigated by | Residual exposure |
|---|---|---|---|
| R1 | **Token rotation false-revoke/false-allow under inter-replica skew** (the highest-value correctness surface). | D3 atomic MAX-in-UPDATE + multi-process test | Sticky-session Traefik edge orderings not covered by the 2-handle test; mitigate by running the multi-process test across ALL commit orderings. |
| R2 | **Lease/lock rows lost on OOM/redeploy** because `synchronous=NORMAL`. | A0 kill-test HARD GATE (force FULL if it fails) | If NORMAL passes the kill-test on the benchmark hardware but fails on a different disk/fsync contract, durability regresses. A0 records the test env. |
| R3 | **Stolen device token honored for up to 8h after revoke** (denylist is opt-in). | D2 chain-level revocation by DEFAULT | The chain-level check is correct but adds a join per request; if a future refactor reverts to row-level, the 8h window reopens. The denylist (`MC_DEVICE_INSTANT_REVOKE=1`) is the operable escape hatch. |
| R4 | **`aegis_unavailable` recreates theme-3** if a status query is added without handling it. | A3 ENFORCED governance test (`status-discriminating-query-audit.test.mjs`) | A developer could add the query AND update the allowlist in the same PR — the test cannot enforce intent, only presence. Code review + `/security-review` is the second layer. |
| R5 | **Cost attribution silent-zero** if `recordUsage` regresses to `cost=0`. | A4b writer fix + backfill 060 + API test | Unpriced models legitimately write 0; a future "optimization" could reintroduce the hardcoded 0 without the API test catching it for unpriced models. |
| R6 | **Runner-daemon split-brain post-C3** (the runner maintenance daemon is ungated by G1's leader-lock). | C3 AC #6 forces an explicit decision | The decision is documented but either option (gate it OR rely on `lease_expires_at`) has a failure mode if misconfigured; ARD 0007's "engines not merged" makes this latent. |
| R7 | **`requeueStaleTasks` merge conflict** (A3/A5/G1 all edit the same WHERE). | Linearized order (G1→A3→A5) + explicit shared-edit note | A developer parallelizing the tracks would conflict; the note + linearized order prevent it but only if followed. |
| R8 | **SSE gap during leadership handoff** (up to lock TTL = 90s silence). | D5 AC softened + ops-cheatsheet doc | An operator observing the gap may chase a phantom bug; the doc mitigates but the UX gap is real until non-leader event relay ships (out of scope). |
| R9 | **Tightening principal-binding breaks operator scripts** (B1a/B3). | Documented migration; admins exempt | Operator scripts assuming cross-agent access break on deploy; no automated migration for client scripts. |
| R10 | **Pin to digest blocks gateway security updates** (F2). | ops-cheatsheet bump cadence | A CVE in the gateway image is not auto-patched; the cadence is the mitigation. |
| R11 | **Existing in-memory rate limiters remain split across replicas** (G1 scopes only D3.5 to device flow). | G1 risk note documents the N-multiplier | Non-device-flow limiters (login, passwordChange) are still bypassable at >1 replica; tracked as future work. |
| R12 | **Restore over a live WAL corrupts data** if `-wal`/`-shm` survive. | I2 CLI verb unlinks them + test | A manual restore (not via the CLI verb) skipping the unlink corrupts; the runbook emphasizes the CLI verb. |

---

## 7. Rollback Runbook

Per-task one-line rollbacks live in each task. This is the **system-level** rollback for a partial deploy: if the plan ships track-by-track and a later track must be reverted, these are the order-preserving rollbacks.

**Order: revert in REVERSE linearized order** (P2 → P1 → P0), and within P0 revert the auth/device tracks (B/D) before the spine (A) so the authz layer does not reference reverted columns.

1. **Revert Track F (P2):** restore moving gateway tags; delete the contract test. No schema impact.
2. **Revert Track E + C (P1):** unregister the task-dispatch/content-step kinds (leave `CAMPAIGN_SEND_JOB_KIND`); restore inline dispatch execution; move Aegis back into `task-dispatch.ts`; restore the three inline `mc-client.cjs` copies. `opzava_runner_004_task_id` column stays nullable/ignored. No data loss.
3. **Revert Track D (device auth) — keep the tables, disable the routes:** return 501 from `/api/auth/device/*` and `/api/auth/devices/*`; `/device` returns 'feature disabled'; remove the B1b `resolveDeviceToken` call + the B1a principal-binding calls. The 058 tables + `core/auth` module remain (no inbound refs). Agent API keys continue to work.
4. **Revert Track I/H/G (dokploy/drain/scale):** remove `awaitSchedulerIdle` from the drain (restore 'do not await'); restore `db.ts:709-710` closeDatabase-on-SIGNAL; remove `acquireLeadership()` gating; restore `workspaceId ?? 1`; flip `auto_backup` back to `defaultEnabled:false`. The leader-lock seam stays inert.
5. **Revert Track A spine (LAST — columns are nullable so legacy reads keep working):** `DELETE FROM schema_migrations WHERE id IN ('060_token_usage_cost_backfill','058_...','057_...','056_...','055_...')`. Revert `recordUsage` to `cost=0` + autocommit + silent catch; revert the transactional write-spine; remove `claimed_at=clock.now()` from the three claim sites; flip `aegis_unavailable` rows back to `review`. Columns (`claimed_at`, `review_attempts`, etc.) are nullable and ignored by legacy code.
6. **NEVER revert a migration by dropping columns** — SQLite has limited `ALTER` support and the columns are nullable. Roll back at the APPLICATION layer (ignore the columns) and leave the schema forward-compatible. The only safe `DROP TABLE` is for brand-new tables with zero inbound refs (`device_tokens`, `oauth_device_sessions`, `revoked_access_tokens`, `leader_locks`).

**Detection of a bad deploy (signals to trigger rollback):**
- Dispatch double-claims at 2 replicas (G1 regression) → revert step 4.
- `GET /api/tokens` returns all zeros after A4b (cost regression) → revert step 5 (A4b only).
- `quality_review` tasks stranded past lease (A5 regression) → revert step 5 (A5 only).
- SQLITE-on-closed-handle errors on rolling-deploy (H2 regression) → revert step 4 (H2 only).

---

## 8. Glossary (codebase-design vocabulary, used precisely)

- **MODULE** — a unit of code with a defined purpose and boundary. A **deep module** has a small INTERFACE (the public surface) over a large IMPLEMENTATION (the behaviour behind it); a **shallow module** has an INTERFACE nearly as wide as its IMPLEMENTATION (e.g. the MCP server's 56 verb-for-verb handlers). *Track C deepens Aegis (`core/reviews`); Track E/MCP and the adapters are flagged shallow.*
- **INTERFACE** — the public surface a module exposes (functions, types, contracts). The `TaskDispatchDeps` literal is the INTERFACE isolating side effects across the dispatch seam.
- **IMPLEMENTATION** — the behaviour behind an interface. **DEPTH** = behaviour per unit of interface; the goal is high DEPTH (much behaviour, narrow surface).
- **SEAM** — a place where behaviour can be altered without editing in place (a dependency-injection point, a barrel re-export, a contract boundary). The `getUserFromRequest` cascade is the SEAM where B1a principal-binding + B1b device-token resolution land. The `registerMigrations` hook (`migrations.ts:13`) is the SEAM for runner migrations.
- **ADAPTER** — an implementation of an interface for a specific backend/context. **One adapter for an interface = a hypothetical seam (it might be over-engineered); two adapters = a real seam.** The three MCP/CLI/TUI clients were one-interface-three-adapters (real seam) but copy-pasted rather than extracted — Track C0/C4 fixes this.
- **GOD-MODULE** — a module holding many unrelated responsibilities behind one surface (`task-dispatch.ts` at 1756 lines: routing + scoring + 4 providers + Aegis + requeue + reconcile). Track C splits it.
- **DEAD SURFACE** — exported code with no production caller (`registerAuthResolver`; the 5 no-op framework adapters). Track B/F removes or relabels.
- **LEAKED IMPLEMENTATION** — when an implementation detail escapes its module boundary (operator-scoped keys carrying no resource-binding leaks the authz boundary; the shared `dispatch_attempts` counter leaks three state machines into one). Tracks A/B fix.
- **MISSING SEAM / MISSING PRIMITIVE** — a needed boundary or primitive that does not exist (no transactional write seam on the task spine; no lease primitive; no leader-election). Tracks A/G/H add them.
- **TOCTOU** — Time-Of-Check-To-Time-Of-Use race. The `dispatch_attempts` SELECT-then-UPDATE is a TOCTOU; at 2 replicas it becomes a GUARANTEED lost update. Track A3 fixes with atomic guarded UPDATEs.
- **FUSED CHANGE** — two concerns that MUST land in the same edit to stay coherent. The fusePoint: principal-binding (B1a) + device-token resolution (B1b) land in the SAME `getUserFromRequest` cascade so device tokens share the authz path from day one.
- **HARD GATE** — a task whose completion is a prerequisite for others, enforced (A0's kill-test gates A5/G1/H2; `migration-ids-unique.test.mjs` gates all migrations; `api:parity` gates `test:all`).

---

## 9. How to execute

**Discipline (non-negotiable).**
1. **TDD (red-green-refactor).** Every task writes the test FIRST (red), implements to green, then refactors. The status-discriminating-query-audit test (A3) and the multi-process rotation test (D3) are red-before-any-code.
2. **Tiny commits, Conventional Commits.** One logical change per commit (`feat(dispatch): arm claimed_at at 3 claim sites`, `fix(costs): record real cost in recordUsage + backfill`, `test(migrations): assert unique ids incl runner`). **Never** add `Co-Authored-By` or AI-attribution trailers (repo rule — `test/branding.test.mjs`-adjacent governance).
3. **`pnpm test:all` is the gate.** It runs `api:parity` (FIRST, `package.json:29`) → `lint` → `typecheck` → `test` → `test:governance` → `build` → `test:e2e`. A task is not done until this is green. `pnpm typecheck` (`tsc --noEmit`) and `pnpm lint` (eslint) must be 0 errors independently.
4. **Verify file:line before citing.** This plan's citations were verified against the repo on 2026-06-24, but line numbers drift as edits land. Re-read a file before editing it (the `MODULE.md` + `dependency-graph.md` + `92-stale-findings.md` orient for `src/opzava` edits).
5. **Code wins over docs.** Where this plan and the code disagree at execution time, the code is the source of truth and the plan/doc is the defect — file a follow-up to fix the doc.

**Branch strategy.** One branch per track (`hardening/track-a-write-spine`, `hardening/track-d-device-auth`, etc.), PR per task or small task-group against the track branch, track branch PR against `main` after the band's gate passes. P0 tracks land in linearized order; P1 tracks can parallelize once their P0 `depends_on` merge. Resolve the `requeueStaleTasks` shared-edit (A3/A5/G1) by merging in linearized order — do not rebase them across each other.

**Branch-context reminders.**
- Editing `src/opzava/**` → read the sibling `MODULE.md` + `docs/architecture/dependency-graph.md` + `docs/architecture/system-map/92-stale-findings.md` first (no blind edits; never regress a CONFIRMED stale-finding).
- New product code → `src/opzava/modules/<feature>/` (per `docs/architecture/folder-structure.md`); the new `src/opzava/core/auth` + `src/opzava/core/reviews` follow the `core/` convention.
- Layering is enforced by `test/folder-structure.test.mjs`, `src/opzava/architecture.test.ts`, `test/engine-boundary.test.mjs`, `test/stepid-coupling.test.mjs`. The new `core/auth` and `core/reviews` layering guards (D2/C1) MUST be added to `architecture.test.ts`.

**Open questions requiring a human sign-off (the plan ships safe defaults, but these benefit from confirmation — NOT blockers):**
1. **8h access-token revoke tolerance** — the engineering default (8h + near-real-time `security.event` + chain-level revoke) ships as decided; operators who demand instant kill have `MC_DEVICE_INSTANT_REVOKE=1`. The knob makes the trade-off explicit rather than hidden.
2. **`synchronous` level (A0)** — recommended FULL for a cost-recording control plane (low write volume absorbs the ~2x throughput cost); default if unconfirmed is NORMAL + the wal_checkpoint, gated by the kill-test. A0 runs FIRST so A2–A4/G1/H2 build against a known contract.
3. **Leader-lock + lease TTL values (G1)** — recommended lock 90s / lease 10min (lock < lease, the corrected invariant). Confirm the values fit the operator's deploy cadence (not too short = flapping; not too long = extended downtime after a crash).

---

## 10. ARD obligations (separate docs this plan requires)

These must be authored alongside the relevant tracks (they are the durable record of the decisions):

- **`docs/ard/0011-single-orchestrator-execution-model.md`** — the orchestrator ARD. Records: the A0 durability decision + kill-test result; the single-active-writer seam (G1); the workspace-iteration loop; the runner-as-canonical-path decision (C2/C3); the `aegis_unavailable` state + reclamation.
- **`docs/ard/0012-device-authorization.md`** — the device-auth ARD. Records: RFC 8628 device grant; Opzava as own OAuth AS+RS; 8h/30d rotating refresh; the three-layer atomic rotation guard (D3); chain-level revocation by default (D2); `MC_DEVICE_INSTANT_REVOKE` knob; stdio-only transport (HTTP-MCP deferred, additive); `OPZAVA_TOKEN_ENC_KEY`/`OPZAVA_INSECURE_STORAGE` storage decision.

Both ARDs supersede any conflicting guidance in `docs/architecture/system-map/91-remediation-plan.md` (this plan's `supersedes`).

---

*End of MASTER-PLAN.md. Status: Approved. This is the single source of truth for the orchestration-hardening effort.*

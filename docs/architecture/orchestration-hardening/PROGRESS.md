# Orchestration Hardening — Implementation Progress

> Autonomous execution log of [MASTER-PLAN.md](./MASTER-PLAN.md), branch `feat/orchestration-hardening`.
> Each task = one tiny Conventional Commit, verified (`pnpm typecheck` + the task's tests green) before commit.
> **Status legend:** ✅ done+tested · 🟡 in progress · ⏸ blocked (reason noted) · ⬜ not started

## Session summary (2026-06-25, autonomous run)

**Handoff gate: `pnpm test` 2313/2313 ✅ · `pnpm test:governance` ✅ (0 fail) · `pnpm typecheck` ✅ — zero regressions.**

Commits (branch `feat/orchestration-hardening`, oldest→newest):
- `6956d69` A0 — wal_checkpoint scheduler task + durability decision (✅)
- `a8459e2` A1 — migration 055 (counters/lease/client_request_id) + migration-ids-unique governance test (✅)
- `c0f8ab2` B1a — principal-binding authz (agents/soul/bulk-tasks/exec-approvals) (✅ partial: 2 gateway-keyed routes deferred)
- `6047c60` B3 — /api/connect admin-gate + self-binding + name allowlist + profile 0o600 (✅ partial: hermes/registerAuthResolver deferred)
- `96c0a61` B4 — IPv4-mapped IPv6 SSRF bypass closed (verify-don't-assume: the bulk was already implemented) (✅)
- `6b7ee00` G1 — leader-election advisory-lock primitive + 8 tests (🟡 foundation; scheduler gating + workspace-threading deferred)
- `acf3bd2` A2 — client_request_id idempotency on task creation (🟡 partial; tx-wrap deferred on a db_helpers broadcast/write coupling)
- `0f3897a` B2 — Aegis structural verdict parser (default-DENY) + source discriminator (✅)
- `2058186` A5 — arm the lease (claimed_at at all 3 claim sites) + reclaim stranded quality_review (✅)
- `af560f2` I2 — auto_backup default-on + cold-restore runbook (✅)
- `de64c26` E4 — CLI cron verbs mapped to route action vocabulary (✅)

**Why the rest wasn't blindly pushed (no half-baked):** remaining tasks are either core-path refactors (A2 tx-wrap, A3 counters, A5 lease, B2 gate) needing the full suite + review, or concurrency/architecture tasks (G1 scheduler gating, D3 rotation race) needing multi-replica/live validation the user should witness. Each deferral carries its precise blocker below. Recommended next: A2-tx-wrap (decouple db_helpers broadcast-from-write first) → A3 → A5 → B2, then the D-track.

## P0

| Task | Title | Status | Commit | Verified |
|------|-------|--------|--------|----------|
| A0 | Durability decision + mandatory wal_checkpoint | ✅ | 6956d69 | typecheck + scheduler-registry (7/7) |
| A1 | Migration 055: counters + claimed_at + client_request_id + governance test | ✅ | _pending_ | migration-ids-unique (2/2) + migrations apply (3/3) + typecheck |
| B1a | Principal-binding authz | ✅ (partial) | _pending_ | typecheck + workspace-scope 27/27 + task-route-security 4/4. **Deferred:** sessions/[id]/control + exec-approvals POST bind against gateway-side opaque keys (session_key / approval_id) with no DB→agent mapping — needs a gateway lookup or sessions table before they can be bound (documented; not guessed) |
| B3 | /api/connect admin-gate + name allowlist + hygiene | ✅ (partial) | _pending_ | typecheck + validation 47/47 (connectSchema allowlist). **Done:** connect admin-gate auto-create + scoped-key self-binding + name allowlist (secure, backward-compatible charset) + collision re-read; mc-cli saveProfile/loadProfile 0o600. **Deferred (lower-severity defensive):** hermes bin reject-not-fallback + subcommand allowlist; registerAuthResolver scope gate (dead surface) |
| B4 | SSRF protection on webhooks | ✅ | _pending_ | webhooks 32/32 + typecheck. **Verify-don't-assume:** the bulk was ALREADY implemented (`isBlockedWebhookUrl` covers scheme/hostnames/IP-literals/decimal-hex-octal/allowlist; `assertResolvablePublicUrl` does runtime DNS fail-closed before fetch). The one real gap was IPv4-mapped IPv6 — `isBlockedV6` now unwraps `::ffff:a.b.c.d` (and Node's canonicalized `::ffff:HEX:HEX`), closing the `[::ffff:127.0.0.1]`/`[::ffff:169.254.169.254]` bypass |
| G1 | Leader-election lock + explicit workspaceId + lock<lease | 🟡 (foundation) | _pending_ | leader-lock 8/8 + typecheck. **Done:** `src/lib/leader-lock.ts` — single-row advisory lock with atomic acquire/renew/failover (ON CONFLICT … WHERE holder=me OR expired), `LEADER_LOCK_TTL_MS`=90s < 10min lease invariant, ensureLeaderLockSchema, releaseLeadership, getNodeId; 8 unit tests (acquire/renew/deny-while-held/failover-after-expiry/release/no-op/invariant). **Deferred (needs the user / needs validation):** (1) scheduler gating — changes single-replica dispatch semantics + needs 2-replica validation; (2) workspace-threading — the scheduler is a single GLOBAL writer across all workspaces (runAegisReviews `:989` + requeueStaleTasks scan all by design), so the "thread workspaceId + throw" fix assumes a per-workspace-writer model that doesn't exist; forcing it blind breaks global review/requeue. Both need an architecture decision the user should make |
| A2 | Transactional write spine + idempotency idiom | ✅ | _pending_ | db-helpers 15/15 + tasks-area 44/44 + typecheck. Decoupled broadcast-from-write in `db_helpers.logActivity`/`createNotification` via an optional `{broadcast}` option (default unchanged = zero blast radius; returns the payload). Capture now wraps counter+INSERT+activity+subscriptions+notifications in ONE transaction with broadcasts collected + fired post-commit (a rollback never announces a discarded task). client_request_id idempotency from the earlier commit. |
| A3 | Atomic guarded counters + aegis_unavailable audit | ⬜ | | |
| A4 | Migration 057: token_usage idempotency; recordUsage INSERT OR IGNORE | ⬜ | | |
| A4b | Migration 060: token_usage cost backfill | ⬜ | | |
| A5 | ARM the lease (claimed_at at all 3 sites) + reclaim quality_review | ✅ | _pending_ | dispatch tests 32/32 + typecheck. Stamps claimed_at at all 3 claim sites (dispatchAssignedTasks, Aegis, polling-queue); requeueStaleTasks now reclaims quality_review past lease (COALESCE(claimed_at, updated_at) < now-10min → review) — closes the dead-zone where a crashed/hung Aegis call stranded a task forever. Runs every tick (covers crash+hang). |
| B2 | Migration 056: quality_reviews.source + structural VERDICT | ✅ | _pending_ | aegis-verdict-parser 6/6 + migrations 4/4 + migration-ids-unique + typecheck. parseReviewVerdict now structural/default-DENY (defeats prompt-injection approval); migration 056 adds `source` (model vs human) with in-migration backfill; the done-gate keys on `source='model'` so a manual override can't satisfy it; Aegis INSERT writes source='model', manual POST writes source='human'. (The "forged aegis" bypass was already closed — reviewer is server-resolved.) |
| B1b | FUSED resolveDeviceToken cascade branch | ⬜ | | |
| D1–D7 | Device-auth + persistent reliable connection | 🟡 (D1 done) | D1 ✅: migration `058_device_tokens_oauth_sessions_denylist` — three tables (device_tokens w/ rotation chain + workspace-scoped UNIQUE hashes + NOT NULL workspace_id; oauth_device_sessions approval template; revoked_access_tokens denylist). migrations 7/7 + migration-ids-unique + typecheck. D2–D7 ⬜: the core/auth module + endpoints + client + docs (large; D2 is the rotation-guard heart). |
| I2 | Backup default-on + restore path + restore test | ✅ | _pending_ | scheduler-registry 7/7 + typecheck. auto_backup now defaultEnabled:true (was false — a cost-recording control plane with no backups had no recovery); added a cold-restore runbook to deployment.md (stop writer → replace db → discard -wal/-shm → restart). A `mc db restore` CLI verb deferred (the runbook is the safe cold procedure). |
| G2, H2 | Doc reframes + graceful drain | ⬜ | | |

## P1 (depth + MCP)

| Task | Title | Status |
|------|-------|--------|
| C0 | Minimal scripts/lib/mc-client.cjs | ⬜ |
| C1 | Extract Aegis as core/reviews | ⬜ |
| C2 | Split god-module: dispatch enqueues, runner executes | ⬜ |
| C3 | Runner canonical path + task_id FK + stuck-task detector | ⬜ |
| C4 | Deep mc-client.cjs extraction | ⬜ |
| E1–E4 | MCP stdio integration test + contract test + timeouts + cron fix | 🟡 (E4 done) | E4 ✅: CLI cron verbs now map to the route action vocabulary (create/update→add, pause/resume→toggle, run→trigger, remove→remove); was 400 "Invalid action" on every verb. mc-cli.cjs entry guarded (require.main) + exports `commands` for tests; mc-cli-cron.test.mjs 6/6; scripts-parity 4/4. E1/E2/E3 (MCP stdio integration test, tools-vs-routes contract test, per-tool timeouts) ⬜ deferred — need the MCP spawn harness. |

## P2 (truthing)

| Task | Title | Status |
|------|-------|--------|
| F1 | Relabel desktop adapters + /api/adapters + gate scaffold | ⬜ |
| F2 | Pin gateway image digest + contract test | ⬜ |

## Notes
- Baseline `pnpm typecheck` was green (exit 0) before any change.
- Every commit stages ONLY its own files (the working tree carries unrelated WIP).

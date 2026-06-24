# Orchestration Hardening — Implementation Progress

> Autonomous execution log of [MASTER-PLAN.md](./MASTER-PLAN.md), branch `feat/orchestration-hardening`.
> Each task = one tiny Conventional Commit, verified (`pnpm typecheck` + the task's tests green) before commit.
> **Status legend:** ✅ done+tested · 🟡 in progress · ⏸ blocked (reason noted) · ⬜ not started

## P0

| Task | Title | Status | Commit | Verified |
|------|-------|--------|--------|----------|
| A0 | Durability decision + mandatory wal_checkpoint | ✅ | 6956d69 | typecheck + scheduler-registry (7/7) |
| A1 | Migration 055: counters + claimed_at + client_request_id + governance test | ✅ | _pending_ | migration-ids-unique (2/2) + migrations apply (3/3) + typecheck |
| B1a | Principal-binding authz | ✅ (partial) | _pending_ | typecheck + workspace-scope 27/27 + task-route-security 4/4. **Deferred:** sessions/[id]/control + exec-approvals POST bind against gateway-side opaque keys (session_key / approval_id) with no DB→agent mapping — needs a gateway lookup or sessions table before they can be bound (documented; not guessed) |
| B3 | /api/connect admin-gate + name allowlist + hygiene | ✅ (partial) | _pending_ | typecheck + validation 47/47 (connectSchema allowlist). **Done:** connect admin-gate auto-create + scoped-key self-binding + name allowlist (secure, backward-compatible charset) + collision re-read; mc-cli saveProfile/loadProfile 0o600. **Deferred (lower-severity defensive):** hermes bin reject-not-fallback + subcommand allowlist; registerAuthResolver scope gate (dead surface) |
| B4 | SSRF protection on webhooks | ✅ | _pending_ | webhooks 32/32 + typecheck. **Verify-don't-assume:** the bulk was ALREADY implemented (`isBlockedWebhookUrl` covers scheme/hostnames/IP-literals/decimal-hex-octal/allowlist; `assertResolvablePublicUrl` does runtime DNS fail-closed before fetch). The one real gap was IPv4-mapped IPv6 — `isBlockedV6` now unwraps `::ffff:a.b.c.d` (and Node's canonicalized `::ffff:HEX:HEX`), closing the `[::ffff:127.0.0.1]`/`[::ffff:169.254.169.254]` bypass |
| G1 | Leader-election lock + explicit workspaceId + lock<lease | 🟡 (foundation) | _pending_ | leader-lock 8/8 + typecheck. **Done:** `src/lib/leader-lock.ts` — single-row advisory lock with atomic acquire/renew/failover (ON CONFLICT … WHERE holder=me OR expired), `LEADER_LOCK_TTL_MS`=90s < 10min lease invariant, ensureLeaderLockSchema, releaseLeadership, getNodeId; 8 unit tests (acquire/renew/deny-while-held/failover-after-expiry/release/no-op/invariant). **Deferred (needs the user / needs validation):** (1) scheduler gating — changes single-replica dispatch semantics + needs 2-replica validation; (2) workspace-threading — the scheduler is a single GLOBAL writer across all workspaces (runAegisReviews `:989` + requeueStaleTasks scan all by design), so the "thread workspaceId + throw" fix assumes a per-workspace-writer model that doesn't exist; forcing it blind breaks global review/requeue. Both need an architecture decision the user should make |
| A2 | Transactional write spine + idempotency idiom | 🟡 (partial) | _pending_ | typecheck + tasks-area 51/51. **Done:** client_request_id idempotency — schema field + SELECT-first short-circuit + UNIQUE-race resolve-to-winner (prevents duplicate tasks on a retried POST). **Deferred (blocked):** the transaction-wrap (fold counter+INSERT+activity+notifications into one tx) — `db_helpers.logActivity` + `createNotification` broadcast synchronously on the same tick as their INSERT, so wrapping them pre-commits the broadcasts (survive rollback = inconsistent). Requires first decoupling broadcast-from-write in those shared helpers (app-wide blast radius) — not a blind change. Route-level idempotency integration test = follow-up |
| A3 | Atomic guarded counters + aegis_unavailable audit | ⬜ | | |
| A4 | Migration 057: token_usage idempotency; recordUsage INSERT OR IGNORE | ⬜ | | |
| A4b | Migration 060: token_usage cost backfill | ⬜ | | |
| A5 | ARM the lease (claimed_at at all 3 sites) + reclaim quality_review | ⬜ | | |
| B2 | Migration 056: quality_reviews.source + structural VERDICT | ⬜ | | |
| B1b | FUSED resolveDeviceToken cascade branch | ⬜ | | |
| D1–D7 | Device-auth + persistent reliable connection | ⬜ | | |
| I1, I2 | Dokploy cookie/TLS + backup/restore | ⬜ | | |
| G2, H2 | Doc reframes + graceful drain | ⬜ | | |

## P1 (depth + MCP)

| Task | Title | Status |
|------|-------|--------|
| C0 | Minimal scripts/lib/mc-client.cjs | ⬜ |
| C1 | Extract Aegis as core/reviews | ⬜ |
| C2 | Split god-module: dispatch enqueues, runner executes | ⬜ |
| C3 | Runner canonical path + task_id FK + stuck-task detector | ⬜ |
| C4 | Deep mc-client.cjs extraction | ⬜ |
| E1–E4 | MCP stdio integration test + contract test + timeouts + cron fix | ⬜ |

## P2 (truthing)

| Task | Title | Status |
|------|-------|--------|
| F1 | Relabel desktop adapters + /api/adapters + gate scaffold | ⬜ |
| F2 | Pin gateway image digest + contract test | ⬜ |

## Notes
- Baseline `pnpm typecheck` was green (exit 0) before any change.
- Every commit stages ONLY its own files (the working tree carries unrelated WIP).

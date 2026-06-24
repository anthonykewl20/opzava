# Orchestration Hardening — Implementation Progress

> Autonomous execution log of [MASTER-PLAN.md](./MASTER-PLAN.md), branch `feat/orchestration-hardening`.
> Each task = one tiny Conventional Commit, verified (`pnpm typecheck` + the task's tests green) before commit.
> **Status legend:** ✅ done+tested · 🟡 in progress · ⏸ blocked (reason noted) · ⬜ not started

## P0

| Task | Title | Status | Commit | Verified |
|------|-------|--------|--------|----------|
| A0 | Durability decision + mandatory wal_checkpoint | ✅ | _pending_ | typecheck + scheduler-registry (7/7) |
| A1 | Migration 055: counters + claimed_at + client_request_id + governance test | ⬜ | | |
| B1a | Principal-binding authz | ⬜ | | |
| B3 | /api/connect admin-gate + name allowlist + hygiene | ⬜ | | |
| B4 | SSRF protection on webhooks | ⬜ | | |
| G1 | Leader-election lock + explicit workspaceId + lock<lease | ⬜ | | |
| A2 | Transactional write spine + idempotency idiom | ⬜ | | |
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

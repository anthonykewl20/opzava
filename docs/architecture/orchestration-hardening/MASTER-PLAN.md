# Orchestration Hardening — Master Remediation Plan

**Status:** Approved · **Date:** 2026-06-24 · **Supersedes:** `docs/architecture/system-map/91-remediation-plan.md` · **ARD refs:** 0011 (orchestrator), 0012 (device-auth)

This is the single source of truth an engineer executes from. It fuses a 33-finding adversarial review with a hardened RFC 8628 device-authorization design, then closes every residual gap from a second-round completeness/integration/red-team grilling. Every task cites **file:line verified against the current repo** (code wins over docs), lists `depends_on`, measurable acceptance criteria, a test, a risk, and a one-line rollback.

Final artifact: `/home/anthony/devtony/anito-opzava/docs/architecture/orchestration-hardening/MASTER-PLAN.md` (1311 lines, 9 tracks, 35 tasks, 6 unique migrations, 16-row parity matrix).

---

## Architecture verdict (Executive Summary)

The orchestrator is **functionally coherent for a single-replica, single-writer deployment but structurally unsound as the "horizontally-scalable AI operations control plane" `CLAUDE.md` mandates.** Three load-bearing defects compound:

1. **The write spine is not transactional and not lease-governed.** Every status transition in `tasks/route.ts` (capture) and `task-dispatch.ts` (claim, promote, Aegis revert, stale-requeue) is an autocommit with side effects (broadcasts, notifications, `recordUsage`) firing as separate statements after the commit. `synchronous=NORMAL` (verified `db.ts:53`) means even committed autocommits may not survive a crash.
2. **A single `dispatch_attempts` column is shared across three state machines** (dispatch-fail cap 5, Aegis-reject cap 3, Aegis-error no-cap), mutated by a read-modify-write TOCTOU, never reset — and there is **no lease on `in_progress` or `quality_review`**, so claimed-but-abandoned tasks leak and `quality_review` is a dead-zone.
3. **The horizontal-scale mandate is structurally impossible** over single-writer SQLite with an in-process scheduler (`scheduler.ts:498` bare `setInterval`) and no leader election — at 2 replicas the dispatch TOCTOU becomes a GUARANTEED double-dispatch every tick.

**Cost attribution — the product's reason-to-exist — is structurally broken** (Grill-2 catch folded into Track A as A4b): `recordUsage` (`task-dispatch.ts:635`) writes `cost = 0` hardcoded, and the read API's `cost ?? calculateTokenCost(...)` fallback can never fire because `0` is not nullish, so every `token_usage` row reports $0.00.

---

## Resolved Decisions (FINAL — do not re-litigate)

| Decision | Resolution |
|---|---|
| **transport** | **stdio-only now.** MCP 2025-06-18. HTTP-MCP deferred as additive, future state, NOT P0. Token endpoint grant-type-agnostic from day one; `device_tokens.audience` column reserved. |
| **localTokenStore** | **0o600 plaintext local file** + OPTIONAL `OPZAVA_TOKEN_ENC_KEY` envelope encryption (fallback `AUTH_SECRET`). Explicit plaintext opt-in is `OPZAVA_INSECURE_STORAGE` (default unset). NO passphrase (no TTY). NO keytar/libsecret (Docker parity). |
| **accessTtl** | **8h access / 30d rotating refresh** (RFC 6749 §10.4). 60s server-skew grace on access; zero grace on 30d cap. OPTIONAL `MC_DEVICE_INSTANT_REVOKE=1` denylist (opt-in). **Chain-level revocation by default** (red-team). |
| **horizontalScale** | **Single-active-writer now** via leader-election/advisory-lock seam. Postgres (ARD 0006) future state, NOT P0. **Correct invariant: lock TTL < lease TTL** (v1 had it inverted). Thread explicit `workspaceId` + add a **workspace-iteration loop** in the scheduler (Grill-2). |
| **fusePoint** | principal-binding (B1a, `depends_on:[]`) + `resolveDeviceToken` (B1b, `depends_on:[D2]`) land in the SAME `getUserFromRequest` cascade. |
| **orchestratorUnification** | `src/opzava/platform/runner` becomes canonical for all 3 engines via `createJobKindExecutor`. Multi-phase Track C, gated BEHIND A/B, not P0. |
| **durability (A0, GATING)** | `synchronous` decided+locked before lease/lock armed. Default if unconfirmed: NORMAL + mandatory default-on `wal_checkpoint` — **but only after a documented kill-test proves lease/lock rows survive a crash; if it fails, force FULL.** |
| **multi-tenancy** | Scheduler iterates `listWorkspaces()`; `workspaceId` never defaulted on the scheduler path. |

---

## Tracks A–I (35 tasks)

Each task below has the full Objective / Files (file:line verified) / Depends_on / Acceptance criteria / Test / Risk / Rollback in the shipped doc. Abbreviated here.

### Track A — Orchestration correctness, write-spine safety & the ARMED lease (P0)
- **A0** — Durability decision + mandatory default-on `wal_checkpoint` (HARD GATE for A5/G1/H2). Verified `db.ts:53`. `depends_on:[]`. AC includes the kill-test.
- **A1** — Migration `055`: 3 counters + `claimed_at` + `client_request_id`. `depends_on:[A0]`. New `test/migration-ids-unique.test.mjs` imports `getOpzavaRunnerMigrations()` directly (Grill-2). Verified array closes at `:1501`.
- **A2** — Transactional write spine + FULL idempotency idiom (SELECT-first, return `idempotent:true`). `depends_on:[A1]`.
- **A3** — Atomic guarded counters + `aegis_unavailable` + **ENFORCED** `test/status-discriminating-query-audit.test.mjs` (red-team — not prose). `depends_on:[A1]`.
- **A4** — Migration `057`: `token_usage.idempotency_key` ONLY (**CORRECTED — `workspace_id` exists since migration 023, `:674`**). `depends_on:[A2]`.
- **A4b** — **FIX cost attribution**: `recordUsage` writes real cost via `token-pricing.ts` + backfill `060`. `depends_on:[A4]`. Verified `cost=0` at `:635`.
- **A5** — ARM THE LEASE at all 3 claim sites (`:1288`, `:1005`, `tasks/queue/route.ts:117`) + reclaim `quality_review` + **guarded completion write** (slow-tick split-brain fix). `depends_on:[A1,A3,G1]`. Cross-task `LEASE_TTL_MS > LOCK_TTL_MS` invariant test.

### Track B — Security, principal-binding authz & SSRF (P0)
- **B1a** — Principal-binding (`requireAgentSelfAccess`/`requireAgentTaskAccess`, verified at `workspace-scope.ts:74`/`:110`). `depends_on:[]`.
- **B1b** — FUSED `resolveDeviceToken` cascade branch (between agent_api_keys `:556` and plugin hook `:558`). `depends_on:[D2]`. `last_seen_at` parity + injection-guard pairing (Grill-2).
- **B2** — Migration `056`: `quality_reviews.source` discriminator WITH backfill INSIDE `up()` + structural VERDICT match. `depends_on:[B1a]`. Verified reviewer already server-resolved at `quality-review/route.ts:91-94`.
- **B3** — `/api/connect` admin-gate + name allowlist + collision check + 0o600/hermes/registerAuthResolver hygiene. `depends_on:[B1a]`.
- **B4** — SSRF protection on webhooks (runtime DNS check, IP pinning). `depends_on:[]`. Gateway path explicitly out of scope.

### Track C — Deep-module refactors (gated behind A/B; P1)
- **C0** — Extract minimal `scripts/lib/mc-client.cjs` EARLY (**promoted to P0** — load-bearing for D5/D6). `depends_on:[]`.
- **C1** — Extract Aegis to `src/opzava/core/reviews`. `depends_on:[B2]`.
- **C2** — Split task-dispatch: dispatch enqueues, runner executes. Golden fixture at `test/fixtures/dispatch-golden.json` (Grill-2). `depends_on:[C1,A1]`.
- **C3** — Runner canonical path + `task_id` FK (`opzava_runner_004`) + read-only `listStuckTasks` + **runner-daemon leader-gating decision** (red-team). `depends_on:[C2,A1,A5,G1]`. Live `WorkflowRun` surface preserved.
- **C4** — Deep `mc-client.cjs` extraction (dedupe timeout-drift + single `sseStream`). `depends_on:[C0,C2]`.

### Track D — Device-auth + persistent reliable connection (P0)
- **D1** — Migration `058`: `device_tokens` + `oauth_device_sessions` + **`revoked_access_tokens` denylist** (Grill-2) + **`workspace_id NOT NULL`** (Grill-2). `depends_on:[B1a]`.
- **D2** — `src/opzava/core/auth` module. **CHAIN-LEVEL revocation by default** (red-team) — reject any token whose `rotation_chain_id` has any `revoked_at IS NOT NULL` row. `depends_on:[D1]`.
- **D3** — Token endpoints + **ATOMIC SERVER-SAFE** disambiguation (MAX embedded INSIDE the UPDATE predicate, red-team) + multi-process test. `depends_on:[D2]`. DB-backed refresh limiter.
- **D3.5** — Shared `dbRateLimiter` primitive (both D3 refresh + D4 device-flow DB-backed, fixing the cross-replica split). `depends_on:[D2]`.
- **D4** — Device-code endpoints + `/device` approval + RFC 8628 anti-phishing. `depends_on:[D3,D3.5]`.
- **D5** — Resilient transport + refresh-on-401 single-flight + SSE Last-Event-ID rewrite + honestly-scoped idempotency. `depends_on:[D6,C0]`. SSE handoff-gap honesty (red-team).
- **D6** — stdio shim + CLI device flow + 0o600 atomic write + cold-start no-TTY invariant + `.env.example`. `depends_on:[D4,C0]` (Grill-2: C0 added).
- **D7** — Redaction governance (**regex covers `logSecurityEvent`/`broadcast`, not just console** — Grill-2) + openapi specs + `60-api-layer.md`. `depends_on:[D6,D4]`.

### Track E — MCP server hardening (P1)
- **E1** — MCP stdio spawn harness (initialize/tools.list/tools.call/notifications.cancelled runtime-verified). `depends_on:[D2]`.
- **E2** — MCP-tools-vs-routes contract test. `depends_on:[E1]`. Confirmed `api:parity` IS in `test:all` (`package.json:29`).
- **E3** — Per-tool timeouts + route context + preserve HTTP status + cancelled AbortController map (uses C0). `depends_on:[E1,C0]`.
- **E4** — Fix CLI cron verb mapping (create→add, pause/resume→toggle, run→trigger). `depends_on:[]`.

### Track F — Client-connectivity truthing + dead surface (P2)
- **F1** — Relabel desktop adapters + `/api/adapters` + gate social/general-va scaffold. `depends_on:[]`.
- **F2** — Pin `OPENCLAW_GATEWAY_IMAGE` to a digest across **ALL THREE compose files** (Grill-2: `docker-compose-openclaw.yml:21` added) + contract test. `depends_on:[F1]`.

### Track G — Horizontal-scale honesty (P0)
- **G1** — Leader-election seam + **workspace-iteration loop in the scheduler tick** (Grill-2 critical catch) + thread explicit `workspaceId` through `runAegisReviews` AND `requeueStaleTasks` + correct TTL invariant (lock < lease). `depends_on:[A1]`. Verified scheduler calls with `makeDefaultDeps()` at `:172`/`:190`.
- **G2** — Reframe CLAUDE.md/deployment.md single-active-writer honestly. `depends_on:[G1]`. Verified `deployment.md:625`.

### Track H — SQLite durability & graceful drain (P0)
- **H2** — Graceful drain AWAITs scheduler idle + **coordinated SIGTERM ordering (closeDatabase LAST)** (verified double-close at `db.ts:709-710` vs `registerProcessShutdown` `:266`) + bounded `stopScheduler` (Grill-2) + MCP signal handlers. `depends_on:[G1,A0]`.

### Track I — Dokploy operability (P0)
- **I1** — Cookie/TLS/forwarded-header hardening (verified sticky cookie `:101-103`, `forwardedHeaders.insecure=true` `:20`). `depends_on:[]`.
- **I2** — Backup default-on + restore path + **WAL/SHM unlink** (Grill-2) + **`leader_locks` reset** (red-team). `depends_on:[A0]`.

---

## Linearized Execution Order (the schedule)

```
BAND P0:  A0 → A1 → B1a → B3 → B4 → C0(promoted) → G1 → A2 → A3 → A5 → B2 → A4 → A4b →
          I1 → I2 → D1 → D2 → D3 → D3.5 → B1b → D4 → D6 → D5 → D7 → G2 → H2
BAND P1:  E1 → E2 → E3 → E4 → C1 → C2 → C3 → C4
BAND P2:  F1 → F2
```
**Critical path:** `A0 → A1 → G1 → A5 → C2 → C3` (durability → counters → leader-lock/lease → runner unification). **A0 is the keystone** — nothing in A/G/H ships until its kill-test passes.

**Migration-application order:** `055 → 056 → 057 → 060 → 058` → `opzava_runner_004` (denylist `059` folded into `058`). All 6 ids globally unique, guarded by `migration-ids-unique.test.mjs`.

---

## Local-Docker-Parity Test Matrix (16 rows; one per reliability claim, cloud==local)

Key rows (full table in doc): (1) lease armed at 3 sites; (2) `quality_review` dead-zone closed; (3) single-active-writer no double-dispatch at 2 replicas; (4) cross-tenant isolation; (5) slow-tick split-brain guard; (6) cost non-zero; (7) token rotation SERVER-SAFE; (8) stolen-token chain-revocation; (9) DB-backed brute-force not split across replicas; (10) drain awaits dispatch; (11) coordinated SIGTERM; (12) WAL bounded; (13) restore (WAL/SHM + leader_locks); (14) cookie/TLS; (15) MCP stdio; (16) idempotent capture. Rows 3/7/9/11 ONLY catch defects at >1 replica — mandatory for the single-active-writer claim.

---

## Risk Register (12 rows), Rollback Runbook (system-level, reverse-linearized), Glossary (codebase-design terms: MODULE/INTERFACE/IMPLEMENTATION/DEPTH/SEAM/ADAPTER/GOD-MODULE/DEAD SURFACE/LEAKED IMPLEMENTATION/TOCTOU/FUSED CHANGE/HARD GATE), How to Execute (TDD red-green-refactor, tiny Conventional Commits with NO Co-Authored-By/AI trailers, `pnpm test:all` gate, code-wins-over-docs, branch strategy), and ARD obligations (0011, 0012) — all in the shipped doc.

## How to execute (discipline)
1. **TDD** — test first (red), implement (green), refactor. The status-query-audit test (A3) and multi-process rotation test (D3) are red-before-any-code.
2. **Tiny Conventional Commits** — one logical change per commit. **Never** `Co-Authored-By` or AI trailers (repo rule).
3. **`pnpm test:all` is the gate** — runs `api:parity` (FIRST) → lint → typecheck → test → test:governance → build → test:e2e. Green = done.
4. **Verify file:line before citing** — line numbers drift; re-read before editing. For `src/opzava/**` edits read the sibling `MODULE.md` + `dependency-graph.md` + `92-stale-findings.md` first.
5. **Code wins over docs** — where plan and code disagree at execution time, code is truth; file a follow-up to fix the doc.

## Open questions requiring human sign-off (safe defaults ship, NOT blockers)
1. 8h access-token revoke tolerance (chain-level revoke default + `MC_DEVICE_INSTANT_REVOKE=1` knob).
2. `synchronous` level (A0) — recommended FULL; default NORMAL + wal_checkpoint gated by kill-test.
3. Leader-lock + lease TTL (G1) — recommended lock 90s / lease 10min (lock < lease).

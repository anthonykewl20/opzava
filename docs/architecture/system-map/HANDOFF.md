# Session Handoff — Remediation push (paused at Claude limits)

**Date paused:** 2026-06-22 · **Branch:** `docs/system-map-ledger` · **PR:** #8 (open, all commits pushed)
**Working tree:** clean. Resume by reading this file + `91-remediation-plan.md`.

## TL;DR
The system-map audit → ARDs → remediation is **complete for all 11 headline findings (F1–F13)**.
Every release gate is green. PR #8 is ready to merge; a few clearly-scoped sub-items are deferred
(non-blocking, listed below).

## Release gates — last run all GREEN
- `pnpm build` ✅ (exit 0) · `pnpm typecheck` ✅ · `pnpm lint` 0 errors (125 pre-existing warnings)
- `pnpm test` ✅ 255 files / 1832 tests · `pnpm test:governance` ✅ 275 · `pnpm api:parity` ✅
- Not run here (needs live server + browsers): `pnpm test:e2e` (Playwright) — will run on the PR.

### CI follow-up (2026-06-22): quality-gate is now GREEN (4 latent failures fixed)
The local gates were green, but PR #8's CI surfaced four latent failures (the first three
had never run in CI before, because the E2E job died on a missing fixture):
1. `test/project-directory-name.test.mjs` hard-coded the local clone dir `anito-opzava`;
   CI checks the `opzava` repo into a dir named `opzava` (sanctioned machine slug). Fixed
   to accept both (commit f4145e7).
2. `quality-gate.yml` ran `cp .env.test .env`, but `.env.test` is intentionally uncommitted —
   the E2E prep step failed on every run. Now falls back to the tracked `.env.example` (e723905).
3. `tests/mcp-server.spec.ts` still asserted the old MCP server name `mission-control`; F12
   had rebranded it to `opzava`. Updated the stale assertion (88b3aba).
4. `test/folder-structure.test.mjs` rejected the new top-level Stryker configs; allowlisted
   them alongside vitest/playwright configs (1980c29).
Lesson: run `pnpm test:governance` AND assume the CI checkout dir is `opzava`; the E2E job
now actually runs, so new E2E/governance assertions are enforced on every PR.

### Test-quality follow-up (2026-06-22): mutation testing of the new safety-critical units
Added a scoped Stryker harness (`stryker.conf.json` + `vitest.stryker.config.ts`, dev-only,
not in CI) over the 10 F-finding units. Baseline mutation score **69.18% → 96.66%** after
hardening tests (1832 → 1918 unit tests). 6/10 units now 100% (content-quality-gate,
env-secret-resolver, maintenance-daemon, campaign-send-approval, wordpress-draft-service,
model-config); schedule-parser 66%→98%. The 27 residual survivors are all **equivalent
mutants** (defensive guards unreachable given contracts — e.g. campaign total≥1; greedy
`(.+)$`; 1970-date dedupe) or **static module-load reference-constants** (the two provider
resolvers' `SecretReference` literals, guarded instead by direct field assertions). Notable
real fixes the mutants caught: the F1 send-approval guard didn't reject wrong-action/wrong-
target approvals, and the F5 retention cutoff sign (`now - retentionMs`) wasn't pinned.
Run: `pnpm exec stryker run`.

## What was delivered (17 commits on the branch)
- **Ledger:** `docs/architecture/system-map/` (16 docs) — second verification pass complete; all zones ✅.
- **Decisions:** `docs/ard/0007` (engine separation, Q1) · `docs/ard/0008` (env-based secrets, F4).
- **Findings F1–F13 all addressed** — see the table in `91-remediation-plan.md` (each entry marked ✅
  with files + done-gate). Highlights: real campaign-send Approval (F1), enforced content quality gates
  (F3), env-only secrets / no cleartext at rest (F4), runner maintenance daemon (F5), admin-settings
  route (F6), engine-boundary gate (F2), model-config centralization (F7), CI governance (F8), cron
  5-field fix (F11), openapi parity (F13).

## Deferred sub-items (NOT blocking release — all documented in 91-remediation-plan.md)
1. **F1b** — provider-level cost/external-call *receipt* + exactly-once via
   `guardLiveProviderExecutionAfterPreflight` on the campaign send. Needs a `RuntimeSettingsLoader`
   (default from `defaultOpzavaAdminSettings()`) + the Resend adapter to take its credential from the
   resolved secret. The send is already approval-gated; campaign send is post-milestone-1.
2. **F5b** — background *job execution* (draining the runner queue). Needs per-kind executor deps +
   resolved secrets. Today sends/content-runs execute inline in their request handlers.
3. **F6b** — *enforce* the rate/cost limits (`requestsPerMinute/burst/usd*Limit`) in the
   provider-execution layer + project them into `runtime-options.ts`. Operators can already *set* them.
4. **F2b** — project Engine A (inherited) cost/audit into the opzava read models (the "unified surfaces"
   half of ARD 0007). Noted in `docs/architecture/engine-boundary.md`.
5. **F14** — 8 other inherited model-id/pricing sites still inline literals (src/index.ts, src/lib/models.ts,
   claude-sessions.ts, framework-templates.ts, app/api/agents/route.ts, 3 components). Listed in
   `90-parity-findings.md` (F14). Fold into `src/lib/model-config.ts` + widen the F7 gate.
6. **Optional:** Understand-Anything tree-sitter cross-check of the ledger (needs interactive
   `/understand` — operator-only).

## To resume next session
1. `git checkout docs/system-map-ledger && git pull`.
2. Decide on **PR #8**: merge it (recommended — it's green) before or after tackling deferred items.
   `gh pr merge` or via GitHub. (User had asked to merge to main earlier — confirm before merging.)
3. Pick deferred work in priority order: **F1b** (finish the live-send safety boundary) is the highest
   value; then **F6b** (enforce limits), **F14** (model debt), **F2b** (cost/audit projection), **F5b**.
4. Re-verify gates with `pnpm typecheck && pnpm lint && pnpm test && pnpm test:governance && pnpm api:parity`
   before each commit; commit per-finding with Conventional Commits (no AI attribution — see CLAUDE.md).

## Notes / gotchas
- The campaign run route test sets `RESEND_API_KEY` via `vi.stubEnv`; provider secrets are env-only now.
- Adding any NEW `/api/...` route requires a matching `openapi.json` entry or `pnpm api:parity` goes red.
- Governance gates (`test/*.test.mjs`) now run in CI via `pnpm test:governance` (folded into `test:all`).
- Pre-existing inherited-layer complexity flags (mc-tui.cjs, task-dispatch.ts) are out of scope; not introduced here.

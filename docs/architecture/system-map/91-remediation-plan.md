# 91 — Remediation Plan (findings F1–F12)

> Turns the verified parity findings ([`90-parity-findings.md`](./90-parity-findings.md)) into a
> **sequenced, dependency-ordered** fix plan. Ordering is by *blast radius first, cost second*: the one
> live external path is made safe before anything else, then product-integrity gates, then the durable-runner
> architecture, then hygiene. Each item lists the **change**, **files**, rough **effort**, **risk**, and the
> **done-gate** (the test/observation that proves it fixed).
>
> Both formerly decision-gated items are now **resolved by accepted ARDs**: **Q1** (engine convergence) →
> [ARD 0007](../../ard/0007-engine-separation-and-surface-unification.md) *(separate engines, unified
> surfaces)*; the **secret-storage approach** (F4) → [ARD 0008](../../ard/0008-secret-storage-and-resolution.md)
> *(environment-provided secret references; no cleartext at rest)*. No item is decision-gated anymore.

## At a glance

| Phase | Findings | Theme | Gate before merge |
|------|----------|-------|-------------------|
| **0 — Guardrails** ✅ | F8, F11 | Cheap correctness + stop regressions | **DONE** — governance gates in CI; cron bug fixed |
| **1 — Make the live path safe** 🔴 🔄 | F4, F1 | The only live side effect (campaign send) is currently unsafe | live send is approval+idempotency+receipt gated; no cleartext secret on the wire |
| **2 — Enforce product-integrity gates** 🔴 | F10, F3, F9 | "Anti-slop / fact-check / approval before draft" is currently decorative | a failed quality verdict halts the run; one orchestrator |
| **3 — Make the durable runner real** 🟠 | F5, F6, F2 | Runner is built but never runs in background; admin config inert | daemon runs; retries/recovery/limits enforced; agent boundary defined |
| **4 — Hygiene / debt** 🟡 | F7, F12 | Hardcoded models + ungated brand residue | governance tests cover both |

> **Sequencing rationale.** F4+F1 are first because the campaign Resend send is the *one shipping live external
> side effect* and it is unsafe on two axes at once (reads cleartext secrets **and** bypasses the
> approval/idempotency/cost boundary). F10 precedes F3 so the quality-gate enforcement lands in the *single*
> orchestrator that actually runs, not one of two divergent copies. Phase 3 follows **ARD 0007** (Q1 resolved):
> the opzava daemon and settings are built opzava-side, *beside* the inherited scheduler — not merged.

---

## Phase 0 — Guardrails (do first; ~1 day total) — ✅ DONE

### F8 — Wire the governance gates into CI 🟡 (enabler) — ✅ DONE
- **Shipped:** added `test:governance` (`node --test test/*.test.mjs`) to `package.json`, folded it into
  `test:all`, and added a **Governance gates** step to `.github/workflows/quality-gate.yml` (after Unit
  tests). All 9 `test/*.test.mjs` gates (267 assertions) now run on every PR/push. Verified the step fails
  non-zero when a gate breaks. *Note:* the `scripts/` brand-residue scope gap is still open — that's F12.
- **Change:** add a `node --test` script (`package.json`) and a step in `.github/workflows/quality-gate.yml`
  that runs the 9 `test/*.test.mjs` gates; OR fold them into the vitest include. They pass today only when run
  by hand.
- **Files:** `package.json`, `.github/workflows/quality-gate.yml`, `vitest.config.ts`.
- **Effort:** S · **Risk:** low.
- **Done-gate:** CI fails if branding/folder-structure/ARD-presence gates fail; verified by a deliberately
  broken branch.
- **Why first:** every later phase adds invariants we want CI to defend (esp. F7, F12).

### F11 — Fix `isCronDue` to honour all five cron fields 🟡 (correctness bug) — ✅ DONE
- **Shipped:** `isCronDue` now parses all five fields — added the month check (`getMonth()+1`) and a
  `matchesCronDay` helper applying standard Vixie-cron day-of-month/day-of-week **OR** semantics, mirroring
  `matchesDay` in `cron-occurrences.ts` so the "is it due now" check and the occurrence enumerator agree.
- **Files:** `src/lib/schedule-parser.ts`, `src/lib/__tests__/schedule-parser.test.ts` (+4 tests).
- **Done-gate met (TDD):** added tests first (confirmed red), then fixed → green. `0 0 1 * *` now fires only
  on day-1; `0 0 1 1 *` only in January; `0 0 13 * 5` matches the 13th OR any Friday. Full suite 1791 ✓.

---

## Phase 1 — Make the one live path safe 🔴 (highest; ~3–5 days)

> The campaign Resend send (`POST /api/campaigns/[id]/run`) is the only live external side effect. Today it
> (a) reads `resend_api_key` cleartext from `settings` and (b) calls `adapter.execute()` directly, skipping the
> built-and-tested approval/reservation/idempotency/cost boundary. Fix both on this shared code path together.

### F4 — Real `SecretResolver` on the live path 🔴 🔄 (ARD 0008 accepted)
- **Decision:** ✅ [ARD 0008](../../ard/0008-secret-storage-and-resolution.md) — secrets resolve from the
  environment (`SecretReference.id` names an env var / Docker `_FILE` secret); the DB stores **only
  references**, never cleartext; resolver is an interface seam (encrypted-column / KMS reachable later).
- **Done so far:**
  1. The missing production resolver is built + tested — `createEnvSecretResolver({ readEnv })` in
     `platform/providers/env-secret-resolver.ts` (pure; the `process.env` touch stays at the app boundary).
     Fails closed (`not-found`) when the env secret is absent. 6 unit tests.
  2. **The live send path no longer reads the API key from cleartext settings.**
     `resolveResendCampaignConnection` (5 tests, incl. an assertion it never reads `resend_api_key`) sources
     `from address`/`from name` from settings and the **key from the env-backed resolver**; the campaign run
     route resolves it and fails closed (`503`) when the secret is absent. Strengthened the governance test to
     assert the route contains **no** cleartext `resend_api_key` read.
- **Remaining:**
  - **F1's guard wiring (the larger half):** route the send through `guardLiveProviderExecutionAfterPreflight`
    so it is approval-gated, reserve-before-execute / exactly-once, and emits redacted cost + audit + external-
    call receipts. ⚠️ *Discovered coupling:* the guard's preflight needs a `RuntimeSettingsLoader` (F6 territory
    — satisfiable now with a default loader from `defaultOpzavaAdminSettings()`) **and** a real `Approval`
    record (the campaign approve flow currently flips only the campaign row status and the send hardcodes
    `approvalGranted:true` at `run-approved-campaign.ts:45`). So F1 = default-loader + campaign→Approval mapping
    + guard wiring + adapter credential threading — a small feature, not a one-line rewire.
  - ✅ **Full ARD 0008 rollout (cleartext-at-rest) — DONE:** `resend_api_key` and `wordpress_app_password`
    are removed from the settings route `settingDefinitions` (nothing secret is persisted), the connections UI
    shows an `EnvSecretNote` instead of secret inputs, and `connections/test` resolves both providers' secrets
    from the environment via the `SecretReference` boundary (new `resolveWordpressDraftConnection` mirrors the
    resend one). The DB now stores **no** provider secrets at rest.
- **Done-gate (live send path met; full F4 pending the rollout above):** ✅ fails closed when the ref can't
  resolve; ✅ key no longer read cleartext on the send path. Pending: redacted audit/cost receipt (lands with
  F1), and removing the key from settings storage.

### F1 — Approval-gate the live send + receipts 🔴 🔄
- **Done (core safety):** the hardcoded `approvalGranted: true` is **gone**. Approving a campaign now mints a
  real, persisted `Approval` (status `approved`, target `external-action:<campaignId>`, action `campaign.send`)
  **atomically** with the campaign transition; `runApprovedCampaign` loads it and **refuses to send unless it is
  granted and targets this campaign** (`isCampaignSendApproved`). The run route returns **403** when no granted
  approval exists. New `campaign-send-approval.ts` (+5 tests) and a `run-approved-campaign` test proving an
  approved campaign with **no** approval record sends nothing and stays `approved`. So a send can no longer
  happen without an explicit, recorded human approval.
- **Files:** `campaign-send-approval.ts` (new), `run-approved-campaign.ts`, `campaigns/[id]/approve/route.ts`,
  `campaigns/[id]/run/route.ts`.
- **F1b — receipts / provider-level exactly-once: boundary built ✅ (2026-06-22).**
  New `createGuardedCampaignSendExecutor` (`workflow/guarded-campaign-send-executor.ts`, +5 tests) routes a
  per-message send through `guardLiveProviderExecutionAfterPreflight`: given a granted approval it runs the
  live Resend adapter through the idempotent boundary, emitting an **external-call receipt + redacted audit**,
  and **refuses to run the adapter a second time** when a succeeded external call already exists for the job's
  idempotency key. A denied/absent approval surfaces a `permission-error` and the adapter never runs (F1 holds
  at the provider layer too); a rejected provider send is a retryable `provider-error`. It composes the existing
  `RuntimeSettingsLoader` + `SecretResolver` + the secret-resolved Resend connection (credential never read from
  the DB). Atomic reserve-before-execute remains a documented follow-up (the runner's atomic job lease keeps
  same-job execution sequential until then).
- **Composition DONE + ENABLED (milestone 2, 2026-06-22):** `createGuardedCampaignSendExecutorForCampaign`
  assembles the guarded executor (defaulting runtime loader + env secret resolver + repository event sink +
  `createExternalCallIdempotencyLookup`) and `run-approved-campaign` drains through it (new optional
  `sendExecutor`). `POST /api/campaigns/[id]/run` now routes every live send through the guard — receipt +
  redacted audit + provider-level exactly-once. The campaign send approval now carries a bounded expiry
  (the guard requires it). End-to-end integration test proves an approved campaign drains to `sent` with a
  receipt per send and that no approval ⇒ no adapter call. Still human-gated (admin trigger + granted approval
  + configured Resend secret); the system never sends on its own.
- **Done-gate:** ✅ an unapproved campaign cannot send (recorded approval required); ✅ the guarded executor
  emits an external-call receipt per send and a duplicate (prior succeeded external call) does **not** re-send
  — provider-level exactly-once, proven by `guarded-campaign-send-executor.test.ts`.
- **Depends on:** F4 (same code path; do in one change set).

---

## Phase 2 — Enforce product-integrity gates 🔴 (~3–4 days)

### F10 — Single enforcement chokepoint (drift risk eliminated) ✅
- **Done (intent met):** rather than merge the two orchestrators (a risky refactor — the sync/mock executor
  is the simple test path, the recording executor is the wired path), F3's enforcement was placed in the
  **single chokepoint both call**: the wordpress-draft step service. So the quality gate **cannot be missed by
  either path** — which was F10's only real purpose. A full structural merge of the two executors is deferred
  as low-value (no remaining drift risk for the gate).

### F3 — Quality verdicts now halt the pipeline ✅
- **Done:** new `content-quality-gate.ts` (`assertContentQualityGatesPassed`, +5 tests) turns the three
  recorded verdicts into a hard stop (a gate passes iff `status === 'passed'`). Enforced in **three** places:
  the wordpress-draft step service `run()` (the chokepoint — a draft cannot be produced on a failed verdict),
  `parseWordpressDraftStepInput` (durable path), and the recording executor **before human approval**
  (fail-fast). A service-level test proves a failed fact-check makes the draft step throw
  (`quality gates not passed`). All 322 content tests green.
- **Files:** `content-quality-gate.ts` (new), `wordpress-draft-service.ts`, `content-workflow-recording-executor.ts`.
- **Effort:** M · **Risk:** low (draft-only, no external blast radius) · **Done-gate:** a run with a `failed`
  fact-check produces **no** WordPress draft and surfaces the halt reason.

### F9 — Resolve the orphaned `va-task-review` step ✅
- **Done:** the General VA role now owns the step — `team/agent-role.ts:154` lists
  `ownedStepIds: ['va-task-intake', 'va-task-draft', 'va-task-review']`, so `va-task-review` renders with
  `agentId:'general-va'`, not null.
- **Files:** `modules/team/agent-role.ts`. **Done-gate:** ✅ met — `department-pipeline.test.ts` asserts
  *"every step in every department pipeline is owned by a default role (no orphans)"* across all departments
  (plus a `va-task-review → general-va` case). Suite green.

---

## Phase 3 — Make the durable runner real 🟠 (Q1 resolved → ARD 0007; ~4–6 days)

> **Q1 is resolved** ([ARD 0007](../../ard/0007-engine-separation-and-surface-unification.md): *separate
> engines, unified surfaces*). The opzava runner daemon and admin settings are built **opzava-side, beside the
> inherited 60s scheduler — the two timers coexist, nothing merges.** F2 is now scoped to a boundary + a
> one-way agent mapping, not a migration.

### F5 — Background runner maintenance now runs on a timer ✅
- **Done:** new `createRunnerMaintenanceDaemon` (`platform/runner/maintenance-daemon.ts`) runs
  `executeExpiredLeaseRecovery` + `pruneRunnerData` on an interval; `startRunnerMaintenance`
  (`maintenance-boot.ts`) is booted in `db.ts` **beside the inherited scheduler**, guarded by
  `!isBuildPhase && !isTestMode` (ARD 0007 — the two timers coexist). So crashed leases are recovered and old
  rows pruned without a manual call. 6 unit tests (recovery+retention wiring, loop/maxCycles, abort, error
  counting). Full suite 253 files / 1823 green.
- **Files:** `platform/runner/maintenance-daemon.ts` (+test), `maintenance-boot.ts`, `src/lib/db.ts`.
- **F5b — queue-drain primitives built ✅ (2026-06-22).** The drain loop (`createCampaignWorkerDaemon`),
  the single-executor worker (`createRunnerWorker`), and the **per-kind executor router**
  (`createJobKindExecutor` — routes a leased job to the executor registered for its kind, else a
  `validation-error`) all exist and are wired by `createCampaignRunnerWorker`. The router is now in the scoped
  Stryker harness at **100% mutation** (9/9). So background job execution is real for the campaign-send kind.
- **Composition DONE (milestone 2, 2026-06-22):** the routed campaign worker now takes the guarded executor
  (via `createCampaignRunnerWorker`'s optional `sendExecutor`), so background job execution drains the campaign
  queue **through the receipt + exactly-once boundary**. The drain runs synchronously in the run request (the
  admin sees the result); a standalone background daemon was intentionally NOT booted to avoid double-processing
  the same queue. Content runs still execute inline today.

### F2 — Engine boundary guarded + documented ✅
- **Done:** governance gate `test/engine-boundary.test.mjs` (3 assertions) statically enforces the one-way
  boundary — `src/opzava/modules/team` never imports `src/lib` or references the `agents` table; `src/lib`
  never imports `@/opzava/modules/team` or references `opzava_agent_roles`. `docs/architecture/engine-boundary.md`
  documents the engines, the role→runtime direction, ownership, and the rule. Negative-controlled.
- **F2b — cost projection built ✅ (2026-06-22):** `platform/costs/unified-cost-summary.ts` merges the opzava
  `CostSummary` with a normalised Engine-A contribution into one `UnifiedCostSummary` — a pure projection fed by
  both engines at the composition layer, so neither engine imports the other (ARD 0007: separate engines,
  unified surfaces). 100% mutation (8/8). **Composition DONE (2026-06-22):** `unified-cost-reader.ts` reads
  Engine A's `token_usage` total + opzava cost events and the unified summary is exposed on `GET /api/ops/costs`
  (`unified` field; openapi + api:parity green; reader 100% mutation). **Audit half DONE too:**
  `unified-audit.ts` merges opzava audit operational events + Engine A `audit_log` on `GET /api/audit`
  (100% mutation). **F2b is fully complete** — both unified surfaces (cost + audit) ship.

### F6 — `OpzavaAdminSettings` is now reachable over HTTP ✅
- **Done:** new admin-only `GET/PUT /api/ops/admin-settings` route reads/writes the `opzava_admin_settings`
  singleton via the (previously zero-caller) `createAdminSettingsRepository` — validates with
  `parseOpzavaAdminSettings`, bumps the version, records an audit event, and returns defaults at version 0 when
  none persisted. The settings store SecretReferences (never secret values), so the payload is safe. Documented
  in `openapi.json` (parity green) with 4 route tests.
- **Files:** `app/api/ops/admin-settings/route.ts` (+test), `openapi.json`.
- **F6b — limits projection + enforcement: built ✅ (2026-06-22).** `projectProviderLimits`
  (`runtime-options.ts`) projects `requestsPerMinute/burst/usdPerHourLimit/usdPerDayLimit` into the loaded
  runtime options, and the pure `evaluateProviderLimits` (`platform/providers/limit-enforcement.ts`) turns them
  into a fail-closed pre-execution gate: it denies as soon as a window is at/over its ceiling, first breach
  wins (rate → hourly → daily), returning the breached `limit` + `observed`. **100% mutation score**
  (limit-enforcement 24/24, runtime-options 11/11); both added to the scoped Stryker harness. `burst` is
  projected for the sub-minute token-bucket (composition layer).
- **Composition DONE (milestone 2, 2026-06-22):** `createProviderUsageReader` reads the live
  `ProviderUsageSnapshot` (external calls in the trailing minute + USD spent this hour/day) from the
  operational-event store, and `createProviderLimitExecutor` decorates the guarded send executor — each live
  send first runs `evaluateProviderLimits` and a breach throws a `permission-error` (no send). Limits come from
  the same defaulting runtime loader. The decorator is 100% mutation; the reader is integration-tested. So the
  operator's rate/cost ceilings are now **enforced**, not merely settable.

---

## Phase 4 — Hygiene / debt 🟡 (~2–3 days)

### F7 — Centralize model ids + pricing out of `src/lib`
- **Change:** move the hardcoded model literals/pricing (`agent-templates.ts`, `task-dispatch.ts:479-523`,
  `token-pricing.ts:13-55`, `agent-runtimes.ts:122`) into admin-config; add a governance test banning
  `claude-<family>-<version>` literals in source (the opzava namespace already complies).
- **Files:** the four `src/lib` sites + a new `test/no-hardcoded-models.test.mjs`.
- **Effort:** M · **Risk:** low-med · **Done-gate:** the new gate fails on a hardcoded id; runtime reads models
  from config.

### F12 — Extend the branding gate to `scripts/` and fix residue
- **Change:** widen `test/branding.test.mjs:75-91` to scan `scripts/`; fix `mc-mcp-server.cjs:734`
  (`serverInfo.name='mission-control'`) and the other `mission-control` residue in shell/TS scripts.
- **Files:** `test/branding.test.mjs`, `scripts/*`. **Effort:** M · **Risk:** low · **Done-gate:** branding gate
  (now in CI via F8) passes with `scripts/` in scope.

---

## Dependency graph (what blocks what)

```
F8 ─┐ (enables CI enforcement for F7, F12)
F11 ┘ (independent quick fix)

ARD: secret-storage ──► F4 ──► F1            (Phase 1, one change set)
ARD 0007 (Q1 ✓) ──────► F5, F6, F2           (Phase 3; engines stay separate)

F10 ──► F3 ──► (F9 alongside)                (Phase 2)
F8 ──────────► F7, F12                        (Phase 4)
```

## Suggested first PR
**Phase 0 (F8 + F11)** — small, low-risk, and it arms CI to defend every later invariant. Then open the
**Phase 1 (F4 + F1)** change set behind its ARD, because that is the only finding with live external blast
radius today.

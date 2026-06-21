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
- **Done so far:** the missing production resolver is built + tested — `createEnvSecretResolver({ readEnv })`
  in `platform/providers/env-secret-resolver.ts` (pure; the `process.env` touch stays at the app boundary).
  Fails closed (`not-found`) when the env secret is absent. 6 unit tests.
- **Remaining (the route rewire — next change set, paired with F1):** route the campaign send through
  `createProviderExecutionPreflight({ resolver })` so the Resend API key resolves via the reference; change
  the Resend adapter to take its credential from the **resolved** secret instead of a cleartext `connection`;
  stop `campaigns/[id]/run/route.ts:34` / `connection-settings-resolver.ts` from reading `resend_api_key`
  cleartext (`fromAddress`/`fromName` stay as non-secret settings).
- **Done-gate:** secret-redaction test + a test proving the live path fails closed when the ref can't
  resolve; no cleartext key in logs/artifacts.

### F1 — Route the live send through the approval+idempotency+receipt boundary 🔴
- **Change:** replace the direct `adapter.execute()` call in the campaign sender with
  `guardLiveProviderExecutionAfterPreflight → evaluateProviderExecutionApproval →
  executeApprovedLiveProviderActionOnce → createExternalCallReservation` (all built/tested, zero callers
  today). Emit `ExternalCallRecord` + `CostEvent` + `AuditEvent`. Replace the hardcoded `approvalGranted:true`
  (`run-approved-campaign.ts:45`) with a real approval check.
- **Files:** `campaign-send-executor.ts`, `resend-campaign-sender.ts`, `run-approved-campaign.ts`,
  `platform/providers/live-approval-runtime.ts`.
- **Effort:** M · **Risk:** med · **Done-gate:** duplicate-send test proves exactly-once (reservation blocks
  the second); a `cost` and `external-call` event appear per send; an unapproved campaign cannot send.
- **Depends on:** F4 (same code path; do in one change set).

---

## Phase 2 — Enforce product-integrity gates 🔴 (~3–4 days)

### F10 — Collapse the two content orchestrators into one (prerequisite for F3)
- **Change:** `content-workflow-executor.ts` (sync/mock) and `content-workflow-recording-executor.ts` (wired)
  duplicate the 11-step sequence. Keep the recording one (it's what `POST /api/ops/runs` calls); delete/retire
  the other or make it a thin wrapper. One sequence = the F3 fix can't miss a path.
- **Files:** `modules/content/workflow/*`. **Effort:** M · **Risk:** med (test both before deleting) ·
  **Done-gate:** one orchestrator referenced by the route; tests green.

### F3 — Make quality verdicts actually halt the pipeline 🔴
- **Change:** the orchestrator must read fact-check / brand-review / anti-slop `status` and halt/requeue on
  `failed|changes-requested|rejected` (today the verdicts are recorded and never read —
  `content-workflow-executor.ts:151-181`). `wordpress-draft-service.ts:45-55` must require the three verdicts
  to be **passed**, not merely **present and correctly typed**.
- **Files:** the surviving orchestrator (from F10), `wordpress-draft-service.ts`.
- **Effort:** M · **Risk:** low (draft-only, no external blast radius) · **Done-gate:** a run with a `failed`
  fact-check produces **no** WordPress draft and surfaces the halt reason.

### F9 — Resolve the orphaned `va-task-review` step 🟡
- **Change:** either give an owning role the `va-task-review` step id (`team/agent-role.ts:154`) or remove it
  from `GENERAL_VA_PIPELINE_ORDER` (`team/department-pipeline.ts:21`). Today it renders with `agentId:null`.
- **Files:** `modules/team/*`, `modules/general-va/*`. **Effort:** S · **Done-gate:** no pipeline step has a
  null owner (assert in a module test).

---

## Phase 3 — Make the durable runner real 🟠 (Q1 resolved → ARD 0007; ~4–6 days)

> **Q1 is resolved** ([ARD 0007](../../ard/0007-engine-separation-and-surface-unification.md): *separate
> engines, unified surfaces*). The opzava runner daemon and admin settings are built **opzava-side, beside the
> inherited 60s scheduler — the two timers coexist, nothing merges.** F2 is now scoped to a boundary + a
> one-way agent mapping, not a migration.

### F5 — Boot the runner daemon so background work actually progresses
- **Change:** start `createRuntimeRunnerDaemon` at process boot (e.g. `instrumentation.ts` or alongside the
  scheduler in `db.ts:84-89`) so `executeExpiredLeaseRecovery`, `pruneRunnerData`, backoff-retry, and drip
  scheduling run on a timer — today they only run synchronously inside request handlers.
- **Files:** `instrumentation.ts` (new) or `db.ts`, `platform/runner/*-daemon.ts`.
- **Effort:** M · **Risk:** med (background loop lifecycle, shutdown) · **Done-gate:** a failed job retries
  after backoff with no HTTP request in flight; a future-scheduled campaign step (`offsetHours>0`) eventually
  runs instead of reporting `failed`.

### F2 — Define the engine boundary + a one-way agent mapping (per ARD 0007)
- **Change:** do **not** merge `agents` and `opzava_agent_roles`. Document the boundary and add a one-way
  mapping (opzava role → inherited runtime identity) at the single integration point; keep status vocabularies
  separate. Begin projecting Engine A cost/audit into the opzava read models (the "unified surfaces" half of
  ARD 0007) so the dashboard reads one source.
- **Files:** `modules/team/*` (mapping), a new read-model projection for cost/audit.
- **Effort:** M · **Risk:** low-med · **Done-gate:** a documented boundary + a test asserting the role→runtime
  mapping is one-way (no opzava code writes `agents`, no `src/lib` writes `opzava_agent_roles`).

### F6 — Wire `OpzavaAdminSettings` + enforce rate/cost limits
- **Change:** add an HTTP route that reads/writes the `opzava_admin_settings` singleton via
  `createAdminSettingsRepository` + `createRuntimeSettingsLoader` (zero callers today); project
  `requestsPerMinute/burst/usdPerHourLimit/usdPerDayLimit` into `runtime-options.ts:46` and enforce them in the
  provider-execution layer.
- **Files:** `app/api/ops/admin-settings/route.ts` (new), `platform/admin-config/*`, `runtime-options.ts`.
- **Effort:** M-L · **Risk:** med · **Done-gate:** an operator can set a provider timeout/limit from the UI and
  a run is throttled/blocked when the cost limit is exceeded.

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

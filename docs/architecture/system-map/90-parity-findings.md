# 90 — Parity Findings & Audit Checklist

> The cross-cutting architectural findings — the things that matter when measuring this codebase
> against the external repos. **Every finding here is double-verified:** pass 1 (zone research)
> and pass 2 (a *fresh, independent* agent with no prior context that adversarially tried to
> refute the claim). Both passes agreed. Marked ✅✅.
>
> Each finding ends with an **Audit question** — the thing to check in the shared repos to
> establish parity (does the other codebase do this better, worse, or the same?).

**Severity key:** 🔴 correctness/security gap · 🟠 architectural debt / divergence ·
🟡 hygiene / enforcement gap.

---

## F1 🔴 The full live-provider safety guard is built, tested, and **unreachable**; the one live side effect bypasses it ✅✅

Opzava's platform implements a complete live-provider boundary —
`guardLiveProviderExecutionAfterPreflight` → `evaluateProviderExecutionApproval` →
`executeApprovedLiveProviderActionOnce` → `createExternalCallReservation` (reserve-before-execute)
→ `createExternalCallIdempotencyLookup` (exactly-once) → external-call/cost/audit events.

**None of these four functions has a non-test, non-platform caller.** The only shipping live
external side effect — the campaign Resend email send via `POST /api/campaigns/[id]/run` —
reaches the provider adapter's `execute()` **directly** through the campaign sender:

```
route.ts:65  runApprovedCampaign
 → campaign-runner-worker.ts:31  createCampaignSendExecutor
 → campaign-send-executor.ts:30  await deps.sender(message)
 → resend-campaign-sender.ts:40  await deps.adapter.execute(request, signal)   ← provider hit
 → resend-live-adapter.ts:55     sendResendEmail(...)                          ← real HTTP send
```

So the live send is **not approval-gated** (the "approval" is only the campaign row's own
`status==='approved'` lifecycle; `approvalGranted:true` is then hardcoded into the plan at
`run-approved-campaign.ts:45`), **not reservation-protected**, **not exactly-once at the
provider layer**, and emits **no provider cost or external-call event**.

> Precision (pass 2): the generic runner *does* emit job-lifecycle `audit` events
> (`runner.attempt.succeeded`, etc.) and there *is* job-level enqueue idempotency
> (`getJobByIdempotencyKey`). But there is genuinely **no `cost` event of any kind** on the
> live send path and no `external-call` record — so even if the idempotency lookup were wired,
> there'd be nothing for it to find.

**Audit question:** In the shared repos, are live external side effects routed through a single
approval+idempotency+receipt boundary, or can a sender call the provider transport directly?

---

## F2 🟠 Two unreconciled agent models ✅✅

| | Engine A (inherited) | Engine B (opzava) |
|---|---|---|
| Table | `agents` | `opzava_agent_roles` |
| PK | `id INTEGER AUTOINCREMENT` (`schema.sql:24`) | `agent_id TEXT` slug `/^[a-z0-9-]+$/` (`agent-role.ts:11`) |
| Status enum | `offline\|idle\|busy\|error` (`schema.sql:29`) | `active\|planned\|paused` (`agent-role.ts:5`) |
| State machine | none (free string) | `active↔paused`, `planned` inert (`agent-status.ts:3-7`) |
| Managed by | `src/lib/agent-*.ts`, gateway/runtime-coupled | `src/opzava/modules/team/` |

**No code path reads or writes both tables.** `src/opzava/modules/team/**` never touches `agents`;
`src/lib/**` never references `opzava_agent_roles` or `@/opzava/modules/team`. No migration, sync,
or shared status update bridges them. They share only the SQLite *connection* (the `/api/team/agents`
route passes `getDatabase()` into the opzava repo, but that repo reads only `opzava_agent_roles` +
`opzava_content_artifacts`, never `agents`).

**Audit question:** Do the shared repos maintain one agent identity/registry, or also carry a
split between an "operator/runtime" model and a "role/org-chart" model?

---

## F3 🔴 Content quality gates (fact-check, brand-review, anti-slop) are **recorded but not enforced** ✅✅

The three review steps persist their verdict as an artifact, but **no orchestrator inspects the
status to halt progression**. `failed` / `changes-requested` / `rejected` are first-class valid
enum values that parse cleanly and flow straight through:

```
content-workflow-executor.ts:151-181   ← fact-check, brand-review, anti-slop run in sequence;
                                          each .record is captured but no status is ever read
```

The **only** hard stop is the human-approval gate, enforced in two places:
```
content-workflow-executor.ts:194   if (!isApprovalGranted(approval)) throw "...external action refused"
wordpress-draft-service.ts:60      if (!isApprovalGranted(approval)) throw "...requires a granted approval"
```
And `wordpress-draft` requires the three review artifacts only to **exist and be correctly typed**,
never to be *passed* (`wordpress-draft-service.ts:45-55` checks `artifactType`, not `status`).

> Pass-2 stronger finding: the wired orchestrators don't even call `parseWordpressDraftStepInput`,
> so the type-only re-check is also skipped on the live path — review verdicts are read in
> **zero** places.

**Audit question:** In the shared repos, do quality-gate failures block the pipeline (halt /
requeue / feedback loop), or are they advisory artifacts like here?

---

## F4 🔴 `SecretReference` is decorative on the live path; secrets are read cleartext ✅✅

There is **no concrete production `SecretResolver`** — it's an interface with only test doubles
(`credentials-runtime.ts:16`). The actual live secrets come from
`connection-settings-resolver.ts`, which reads cleartext strings (`resend_api_key`,
`wordpress_app_password`) **directly from the inherited `settings` SQLite table**:

```
campaigns/[id]/run/route.ts:29  read = (key) => db.prepare('SELECT value FROM settings WHERE key=?')...
                          :34   connection = resolveResendLiveConnection(read)   ← cleartext apiKey
                          :53   createLiveResendProviderProfile('resend_api_key') ← credentialRef is a
                                                                                    literal string, never resolved
resend-live-sender.ts:55        Authorization: `Bearer ${connection.apiKey}`     ← cleartext to the wire
```

`resolveProviderCredentialForRequest` is never called on any wired path (only in tests). The
golden principle (`docs/golden-principles.md:31`) forbids exactly this: *"No hard-coded secrets…
provider URLs, model names… in source code… credentials belong in admin settings backed by safe
secret storage or environment-provided secret references."* The `settings` table stores the value
as plaintext; `sensitive:true` only redacts it from GET responses, it does not encrypt at rest.

**Audit question:** Do the shared repos resolve credentials through a real secret-resolution
boundary, or also read provider secrets cleartext from a general key/value store?

---

## F5 🟠 Engine B has **no autonomous background loop** — the durable runner daemon is never booted ✅✅

This is the sharpest divergence, and pass 2 made it stronger than pass 1. The durable runner's
whole point is crash-safe, retryable, *background* execution. But:

- `db.ts:84-89` starts **only** the inherited scheduler at boot.
- `createRuntimeRunnerDaemon` / `createRunnerDaemon` / `runCampaignDaemon` have **no non-test
  callers** anywhere. No API route, no `scripts/*`, no `instrumentation.ts`, no `next.config.js`
  hook starts them.
- Therefore Engine B's `Job`/`Attempt`/`DeadLetter` machinery is exercised **only synchronously,
  inside request handlers** (`/api/ops/runs` runs the workflow inline; `/api/campaigns/[id]/run`
  drives `worker.runNext()` in a bounded inline loop and blocks the HTTP request until done).

Consequence: the runner's recovery (`executeExpiredLeaseRecovery`), retention (`pruneRunnerData`),
retry-after-backoff, and drip scheduling cannot make progress on their own — there's no timer
calling them. A campaign step with `offsetHours>0` is scheduled in the future but the inline run
loop won't wait, so it reports `failed` (`run-approved-campaign.ts` finalize logic).

**Audit question:** Do the shared repos actually *run* their durable worker as a background
process/daemon, or also collapse it into synchronous request handling?

---

## F6 🟠 `OpzavaAdminSettings` is unwired; provider rate/cost limits are inert ✅✅

`createAdminSettingsRepository` and `createRuntimeSettingsLoader` have **zero non-test callers**.
No HTTP route reads or writes the `opzava_admin_settings` singleton (the inherited `/api/settings`
route operates on a *different* `settings` key/value table). So operators have no product-UI path
to set runner delays / retry policy / provider timeouts / provider selection / credentials.

The rate/cost limits (`requestsPerMinute`, `burst`, `usdPerHourLimit`, `usdPerDayLimit`) are
validated and stored but **not even projected** into the runtime options (`runtime-options.ts:46`
emits only runner delays + retry + provider timeout) — so no consumer could enforce them even if
the loader were wired.

**Audit question:** In the shared repos, are operator-tunable runtime settings (and budget/rate
limits) actually loaded and enforced at runtime, or defined-but-dormant?

---

## F7 🟡 Inherited `src/lib` hardcodes model IDs and pricing (violates the project's own golden principle) ✅✅

The golden principle bans hardcoded model names/pricing in source. `src/opzava/**` complies
(models/timeouts come from admin-config; zero `claude-<family>-<version>` literals). The inherited
layer does not:

| Location | Hardcode |
|---|---|
| `agent-templates.ts:138,180,224,266,…` | `'anthropic/claude-opus-4-5'`, `'…sonnet-4-20250514'`, `'…haiku-4-5'` + fallback arrays |
| `task-dispatch.ts:500,509,518,522` | `classifyDirectModel()` returns literal `claude-opus-4-6` / `…haiku-4-5-20251001` / `…sonnet-4-6` |
| `token-pricing.ts:13-55` | `MODEL_PRICING` table of model IDs + USD/MTok prices |
| `agent-runtimes.ts:122` | AI script-review pinned to `'claude-sonnet-4-20250514'` |

No governance test bans hardcoded models anywhere — so the inherited layer violates the documented
principle and simply isn't covered by any check. (`task-dispatch` has an optional per-agent
`dispatchModel` override, but the hardcoded IDs are the operative default.)

**Audit question:** Do the shared repos centralize model/pricing config, or scatter model IDs
through source like the inherited layer here?

---

## F8 🟡 The governance gates are not enforced on merge ✅✅

The 9 `test/*.test.mjs` "golden-principles-as-tests" gates (branding recursive scan,
folder-structure live check, project-dir-name, doc-presence, content-step roadmap) run under
`node:test`. But:
- `vitest.config.ts:15` includes only `src/**/*.test.ts(x)` — it does not pick up `test/*.test.mjs`.
- No `package.json` script runs `node --test`.
- `.github/workflows/quality-gate.yml` runs `api:parity → lint → typecheck → vitest → build →
  e2e` — **no governance step**.

So the brand scan and folder-structure guards pass only when run manually, never on merge. (The
*architecture entropy guard* `src/opzava/architecture.test.ts` is a vitest test and **does** run.)

**Audit question:** Do the shared repos wire their architectural/governance checks into CI, or
also leave them as manually-run gates?

---

## Cross-cutting themes for the repo comparison

1. **"Built but not wired"** is the dominant pattern in the opzava layer: the durable runner
   daemon (F5), the live-provider guard (F1), admin-config (F6), reserve-before-execute, and a
   production SecretResolver (F4) are all implemented and tested but have no production caller.
   The product currently runs on the *synchronous, mock-first* slice of a much larger designed
   system. **When auditing the shared repos, the key question is "designed vs wired"** — match
   capability to actual call-path, not to file presence.
2. **Two engines, one DB** (F2, F5): the inherited operator/task board and the opzava
   worker/workflow engine coexist without integration. **Resolved (Q1 → [ARD 0007](../../ard/0007-engine-separation-and-surface-unification.md)):**
   keep the engines *separate* (opzava engine canonical), unify the cross-cutting *surfaces*
   (cost/audit/dashboard) via projection, and *bridge* the agent models rather than merging them — so
   the duplication is intentional, not debt.
3. **Enforcement gaps** (F3, F4, F7, F8): several of the project's own stated invariants
   (quality gates block, secrets are references, no hardcoded models, governance in CI) are
   documented but not mechanically enforced.

> All findings F1–F8 are ✅✅ double-verified. The four lower-confidence single-pass observations have now
> been **confirmed by an independent second verification pass** (with file:line evidence) and are promoted to
> findings F9–F12 below.

---

## F9 🟠 Orphaned `va-task-review` step — no role owns it ✅

`va-task-review` is an artifact type (`general-va/artifacts/general-va-artifact.ts:3`), a step service
(`general-va/steps/va-task-review-service.ts`), and sits in `GENERAL_VA_PIPELINE_ORDER`
(`team/department-pipeline.ts:21`). But the General VA role owns only `['va-task-intake','va-task-draft']`
(`team/agent-role.ts:154`) — no default role owns `va-task-review`. `buildDepartmentPipeline('General VA')`
yields it with `agentId:null`; its artifacts are attributed to no one.

> **✅ Resolved (post-audit):** remediation added the ownership entry — `agent-role.ts:154` now reads
> `['va-task-intake','va-task-draft','va-task-review']`, so `general-va` owns the step,
> `buildDepartmentPipeline('General VA')` yields `agentId:'general-va'`, and a no-orphans test guards it
> (`department-pipeline.test.ts:73`). The paragraph above is the as-found finding (the cited line has since changed).

**Audit question:** Do the shared repos have pipeline steps with no owning role/agent?

---

## F10 🟠 Two divergent content orchestrators ✅

`content/workflow/content-workflow-executor.ts` (sync, mock) and `content-workflow-recording-executor.ts`
(async; provider-call steps emit events) **fully duplicate** the 11-step sequence. `run-and-record-content-workflow.ts:18`
wraps the **recording** one — which is what `POST /api/ops/runs` (`route.ts:109`) actually calls. Two code paths,
one workflow definition, easy to drift.

**Audit question:** Do the shared repos keep a single orchestrator per workflow, or fork sync/async variants?

---

## F11 🟡 `isCronDue` checks only 3 of 5 cron fields ✅

`src/lib/schedule-parser.ts:166` destructures `[minExpr, hourExpr, , , dowExpr]` — positions 2 (day-of-month)
and 3 (month) are discarded; lines 169–173 match only minute/hour/day-of-week. So a cron with a day-of-month or
month constraint **over-fires**. `cron-occurrences.ts` is a separate, full 5-field parser → the two disagree.

**Audit question:** Do the shared repos parse all five cron fields consistently in one place?

---

## F12 🟡 Inherited-brand residue in `scripts/` is ungated ✅

`scripts/mc-mcp-server.cjs:734` sets `serverInfo.name = 'mission-control'`; `mission-control` is pervasive across
`scripts/` (station-doctor.sh, security-audit.sh, deploy-standalone.sh, take-screenshots.ts, mc-cli.cjs, …). The
branding gate (`test/branding.test.mjs:75-91`) scans only `src/app`, `src/components`, `messages/` — never
`scripts/`. Compounds **F8**: the gate is both unwired in CI *and* scoped to miss this residue.

**Audit question:** Do the shared repos scope their brand checks to cover ops/CLI tooling, not just app source?

---

## F14 ✅ Hardcoded model ids/pricing scattered across other inherited sites (follow-up to F7) — DONE

F7's four core dispatch/pricing sites were centralized into `src/lib/model-config.ts` first. **F14 (2026-06-22) folded the remaining eight inherited sites** into the same SoT and **widened** the governance gate `test/no-hardcoded-models.test.mjs` to enforce all twelve files (no Claude model-id literal may remain in their executable code):

- `src/index.ts` (CLI model catalog)
- `src/lib/models.ts` (`MODEL_CATALOG`)
- `src/lib/claude-sessions.ts` (per-token session pricing keys → computed from model-config ids)
- `src/lib/framework-templates.ts` (the Claude-SDK example snippet model, interpolated)
- `src/app/api/agents/route.ts` (agent-profile default model)
- `src/components/onboarding/runtime-setup-modal.tsx` (provider/model picker)
- `src/components/panels/agent-detail-tabs.tsx` (`DEFAULT_MODEL_BY_TIER` + placeholder)
- `src/components/panels/cron-management-panel.tsx` (model-input placeholder)

Five new id constants were added to `model-config.ts` (`MODEL_CLAUDE_HAIKU_4_5`, `MODEL_CLAUDE_SONNET_4_5`, `MODEL_ANTHROPIC_SONNET_4_6`, `MODEL_ANTHROPIC_OPUS_4_6`, `MODEL_ANTHROPIC_HAIKU_3_5_LATEST`) for ids the catalogs/UI use that differ in version from the dispatch/template ids; values were preserved byte-identical (centralization, not a version bump). **Done-gate:** ✅ the widened gate is green (283 governance tests); build + 1919 unit tests pass.

**Answer to the original audit question:** the inherited sites carried the same scatter (UI pickers, route handlers, session/template helpers each inlined ids); they now all route through the one config module.

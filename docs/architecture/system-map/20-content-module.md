# 20 — Content Module (deep)

> Zone: `src/opzava/modules/content/` — the flagship workflow: a human idea → a human-approved,
> draft-only WordPress request, plus the email-campaign send engine. Marks: ✅✅ = double-verified
> (F1/F3 had fresh-agent passes); 🔎→✅ = pass-1 research **re-checked & confirmed in the second pass**
> (contracts, steps/workflow, providers/campaign) but not yet a dedicated second pass; ⚠️ = nuance.

## Shape

```
modules/content/
  contracts/   10 artifact value-objects (Zod, .strict(), schemaVersion:1)
  artifacts/   content-artifact wrapper + opzava_content_artifacts repository
  steps/       11 step services (pure, DI: {provider, newId, now})
  workflow/    content-workflow definition + 2 orchestrators + record + campaign send engine
  providers/   mock adapters (keyword/source/article/fact-check) + LIVE adapters (wordpress/resend)
  campaign/    campaign aggregate + repository + scheduler + runner worker
```

## The pipeline (11 steps, linear DAG) ✅

Definition `workflow/content-workflow.ts` (`CONTENT_WORKFLOW_ID='content-workflow'`, version 1,
`entryStepId:'idea-intake'`), validated acyclic by `parseWorkflowDefinition` (core).

```
idea-intake ─manual─► keyword-research ─PROVIDER─► source-capture ─PROVIDER─►
  seo-brief ─transform─► outline ─transform─► article-draft ─PROVIDER─►
    fact-check ─PROVIDER─► brand-review ─transform─► anti-slop-review ─transform─►
      human-approval ─approval-gate─► wordpress-draft ─external-action (terminal)
```

| step | file | input(s) | output | provider? | gate? |
|------|------|----------|--------|-----------|-------|
| idea-intake | `steps/idea-intake-service.ts` | rawIdea | `IdeaIntake` (root record, **not** an Artifact) | no | no |
| keyword-research | `steps/keyword-research-service.ts` | idea | Artifact `keyword-research` | mock | no |
| source-capture | `steps/source-capture-service.ts` | idea | Artifact `source-capture` | mock | no |
| seo-brief | `steps/seo-brief-service.ts` | idea + kw + source | Artifact `seo-brief` | transform | no |
| outline | `steps/outline-service.ts` | idea + brief | Artifact `outline` | transform | no |
| article-draft | `steps/article-draft-service.ts` | idea + outline + source | Artifact `article-draft` | mock | no |
| fact-check | `steps/fact-check-service.ts` | draft + source | Artifact `fact-check-report` (passed\|failed) | mock | ⚠️ recorded-only |
| brand-review | `steps/brand-review-service.ts` | draft | Artifact `brand-review` (passed\|changes-requested) | transform | ⚠️ recorded-only |
| anti-slop-review | `steps/anti-slop-review-service.ts` | draft | Artifact `anti-slop-review` (passed\|rejected) | transform | ⚠️ recorded-only |
| human-approval | `steps/human-approval-service.ts` | draft + requesterId | `Approval` (approved\|rejected) | decision | **HARD GATE** |
| wordpress-draft | `steps/wordpress-draft-service.ts` | draft + 4 gate artifacts + granted Approval | `WordpressDraftRequest` (status literal `draft`) | render | enforces approval |

## Quality encoded in the *types* ✅

The 10 contracts (`contracts/`) put quality guarantees in the schema, not just runtime logic:
- **Provenance is structural**: `ArticleDraft` section requires `supportingSourceIds.min(1)`
  ("a section with no source ids is an unsupported claim"); every derived `Artifact` requires
  non-empty `lineage.inputArtifactIds` (core).
- **Verdict integrity**: a `passed` `FactCheckReport` only parses if every check is `supported`;
  a `passed` `BrandReview` cannot contain a `fail`; an `AntiSlopReview` `passed` ⇒ zero
  `detectedPatterns`, `rejected` ⇒ ≥1 (each naming pattern+severity+excerpt+`requiredFix`).
- **No-auto-publish is structural**: `WordpressDraftRequest.status` is a **literal `'draft'`**, and the
  request cannot be constructed without an `approvalId` + all **four** gate-artifact ids
  (`sourceCaptureId`, `factCheckReportId`, `brandReviewId`, `antiSlopReviewId`).
- `schemaVersion` is pinned literal `1` everywhere with **no migration machinery** — a future bump
  would break reads of stored `record_json` (🔎).

## The two enforcement realities ⚠️

✅✅ **F3 — review gates are RECORDED, not ENFORCED.** The orchestrators capture the fact-check /
brand-review / anti-slop artifacts but **never read their `status` to halt**
(`content-workflow-executor.ts:151-181`). `failed`/`changes-requested`/`rejected` are valid enum
values that flow straight through. The **only** hard stop is human-approval:
```ts
if (!isApprovalGranted(approval)) throw new Error('content workflow halted: human approval not granted, external action refused')  // content-workflow-executor.ts:194
```
enforced again defensively in `wordpress-draft-service.ts:60`. And `wordpress-draft` requires the three
review artifacts only to **exist and be correctly typed** (`artifactType` check, `:45-55`), never to be
*passed*. So today a `failed` review does not stop a run.

## The provider edge ✅ / ✅✅

- **Mock-first**: the wired content route (`POST /api/ops/runs`) assembles **mock** adapters
  (`createMockContentWorkflowProviderAdapters`) and an auto-approving mock human-approval — so a run
  always reaches a draft `WordpressDraftRequest` and never performs a real publish.
- **Live adapters exist but**: `wordpress-live-adapter.ts` (real `POST /wp-json/wp/v2/posts`, status
  `draft`) has **no route caller** (reachable only via barrel re-export). `resend-live-adapter.ts` is the
  one live path that ships — via the campaign engine.
- ✅✅ **F1 — the live Resend send bypasses the provider guard.** `POST /api/campaigns/[id]/run` →
  `runApprovedCampaign` → campaign runner worker → `resend-campaign-sender.ts:40 adapter.execute()` →
  `sendResendEmail` (real HTTP). No approval guard, no reservation, no exactly-once at the provider layer,
  no provider cost/external-call event. The "approval" is only the campaign row's `status==='approved'`,
  then `approvalGranted:true` is hardcoded (`run-approved-campaign.ts:45`). See [F1](./90-parity-findings.md).
- ⚠️ **Provider-level idempotency keys are set but never enforced** for the mock content steps and the live
  adapters — the keys exist on requests but nothing looks them up before executing (🔎).

## Orchestration ✅

⚠️ **Two divergent orchestrators** duplicate the entire step-sequencing logic:
- `content-workflow-executor.ts` — synchronous, mock providers.
- `content-workflow-recording-executor.ts` — async; the four `provider-call` steps go through the
  durable provider-execution layer (`runXProviderCall`) to emit operational events, then feed the result
  into the same step service.
- `run-and-record-content-workflow.ts` wraps the recording executor and persists artifacts. This is what
  `POST /api/ops/runs` calls.

⚠️ **The durable per-step runner is built but UNUSED for content** (🔎): `createContentStepExecutor` +
`job-kind-executor` exist and are tested (they map a step to a `RunnerExecutor` and verify the output kind
against `CONTENT_STEP_OUTPUTS`), but **no content route constructs a runner worker**. The wired path is the
all-in-one in-process executor — so there is **no durable pause/resume**; a non-granted approval throws
synchronously and 500s the request. Real `blocked→running` workflow pausing is not exercised in production.
(Theme of [F5](./90-parity-findings.md).)

## Persistence ✅

Table `opzava_content_artifacts` (`artifacts/artifact-repository.ts`): `artifact_id` PK · `artifact_type`
· `source_step_run_id` · `workflow_run_id` · `validation_status` · `record_json` · `created_at`;
indexes on type/run/created. UPSERT by `artifact_id`; reads re-`parseArtifact` (drift throws).

- **Run identity**: `workflow_run_id = content-workflow:${ideaId}` — one logical run **per idea**.
  Re-running the same idea upserts/accumulates under the same run (no per-execution run id). ⚠️
- ⚠️ **Only 8 of the artifacts are persisted** (`recordContentWorkflowArtifacts` iterates
  `[keywordResearch, sourceCapture, seoBrief, outline, articleDraft, factCheckReport, brandReview,
  antiSlopReview]`). The **`Approval` and the final `WordpressDraftRequest` are NOT written** to the table —
  they're returned in memory only. Confirm whether the ledger is meant to be complete (🔎).
- Each artifact's `sourceStepRunId = content-run:<stepId>`; lineage = upstream artifact ids (the
  artifact-to-artifact DAG).

## Campaign send engine ✅

`campaign/` — an email-drip system distinct from the article pipeline:
- **Aggregate** `Campaign` (`campaignId, name, status, startAt, steps[{subject,html,offsetHours}],
  audience{recipients[]}`). Status machine: `draft → approved → sending → sent|failed`, `failed → sending`
  (retry edge unused), `transitionCampaign` throws on illegal edges.
- **Run** (`runApprovedCampaign`): asserts `status==='approved'` → `sending` → plan per (step × recipient)
  with `idempotencyKey = campaign:{id}:{stepId}:{to}` → enqueue runner jobs (read-then-insert dedup) →
  drive a `RunnerWorker` **synchronously inline** (`total+2` `runNext()` calls) → each send executor calls
  the Resend sender → finalize `sent` if all sent else `failed`.
- Table `opzava_campaigns` (`campaign_id` PK, `name`, `status`, `start_at`, `record_json`, timestamps);
  send jobs are generic `opzava_runner_jobs`.
- ⚠️ **Inline run can't honor scheduled drip offsets** (🔎): a step with `offsetHours>0` is scheduled in the
  future, the runner only leases `scheduled_at<=now`, and the inline loop won't wait → the campaign reports
  `failed` even though those jobs are correctly queued. The async daemon would drain them, but no route
  starts it (F5).
- ⚠️ **Live Resend send emits no cost/audit operational event** (the campaign sender bypasses the
  `*-execution.ts` wrappers that emit them) — real outbound email is unmetered/unaudited at the provider
  layer (F1).

## Dependencies

**Inbound**: `POST/GET /api/ops/runs` (content runs, mock, draft-only), `GET /api/ops/artifacts[/:id]`,
`/api/campaigns/*` (CRUD/approve/run), `/api/connections/test`. **Outbound**: core (workflows/artifacts/
approvals), platform runner + providers + admin-config (secrets), the content contracts.

## Subtleties for parity comparison

1. Quality is enforced **in the type system** (provenance, verdict integrity, no-auto-publish) — strong.
2. But the three **review gates don't block** the pipeline (only human-approval does) — F3.
3. The durable, resumable execution model is **designed but unwired** for content; runs are synchronous.
4. The one live side effect (campaign email) **bypasses** the provider safety boundary — F1.
5. Run identity is per-idea (upsert), not per-execution — historical runs of the same idea aren't tracked.
6. Approval + final publish request are **not persisted** — the artifact ledger is intentionally partial.

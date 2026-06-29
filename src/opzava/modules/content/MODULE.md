<!-- agent-context: read this before editing the module -->

# modules/content

## Purpose

The SEO content production pipeline (idea → keyword → source → SEO brief → outline → draft → fact-check → brand review → anti-slop → human approval → WordPress draft) plus the email-campaign send engine that lives behind it. It is the largest feature module and the only module that consumes the `platform` layer (`runner`, `providers`, `admin-config`).

## Public surface

Consumers import **only** from `index.ts` (the barrel). Narrowed in issue #65 from 77
re-exports to **15** — the true public surface (verified: 8 production + 2 test barrel consumers
import exactly these 15). Anything not re-exported here is internal — still reachable from
its concrete file, but no longer advertised, so internal refactors no longer ripple through
the barrel.

- **Campaign domain** (`campaign/*`): status machine + repository + approval + run —
  `parseCampaign`/`transitionCampaign`; `createCampaignRepository`;
  `CAMPAIGN_SEND_REQUESTED_ACTION`/`campaignSendApprovalId`/`createCampaignSendApproval`;
  `runApprovedCampaign`; `createGuardedCampaignSendExecutorForCampaign`.
- **Artifacts** (`artifacts/*`): `createArtifactRepository`.
- **Content workflow — recorded run** (`workflow/*`): `runAndRecordContentWorkflow`.
- **Live send — Resend + WordPress** (`providers/*`): connection resolution
  `resolveResendCampaignConnection`/`RESEND_API_KEY_SECRET_REFERENCE`/`resolveWordpressDraftConnection`;
  Resend live adapter `createLiveResendProviderAdapter`/`createLiveResendProviderProfile`.

**Mock surface** (`mocks.ts` — NOT the public barrel): the `createMock*` providers used to run
the content workflow on mock providers (draft-only). Consumed by the `ops/runs` dev endpoint
+ tests. Import from `@/opzava/modules/content/mocks`.

> The internals no longer re-exported here — artifact contracts (`contracts/*`), step-service
> factories + the rest of the mock providers (`steps/*`), provider adapters/execution
> (`providers/*`), the email-campaign send subsystem internals (`workflow/campaign-*.ts`),
> the workflow definition/executor (`workflow/content-workflow*`) — are still exported by
> their concrete files; the module's own code + tests import them directly (relative paths),
> never via the barrel. The `campaign/` subsystem is a large, conceptually-separate capability
> (a durable email-send engine + approval gate) that happens to live inside this module.

## Dependencies

- **Outbound** (what this imports): core `{approvals (contracts, approval-repository), artifacts/contracts, workflows/contracts}` and platform `{runner (contracts, worker, repository, migrations, retry-policy), providers (contracts, execution, live-approval-runtime, live-execution-runtime, external-call-reservation, credentials-runtime, etc.), admin-config (contracts, repository, runtime-loader, runtime-options)}`. No cross-module imports outbound — `team` imports **into** `content`, not the reverse (the only cross-module import edge; see ARD 0010).
- **Layering rule**: inverted pyramid. `modules` may import `core` (inward) and the approved `platform` interfaces (`runner`/`providers`/`admin-config`); it must not import other `modules` directly, and `core` may not import back into it. Enforced by `src/opzava/architecture.test.ts`.
- **Inbound** (callers an editor must not silently break — import the public barrel only): `src/app/api/campaigns/route.ts`, `src/app/api/campaigns/[id]/run/route.ts`, `src/app/api/campaigns/[id]/approve/route.ts`, `src/app/api/connections/test/route.ts`, `src/app/api/ops/runs/route.ts`, `src/app/api/_composition/post-approval-dispatcher.ts`, `src/lib/status-actions.ts`, and `src/opzava/modules/team/agent-activity.ts` (the single cross-module consumer; uses `createArtifactRepository` via this barrel).

## Invariants

1. **The pipeline graph is structurally approval-gated.** In `workflow/content-workflow.ts` the `human-approval` step (`kind: 'approval-gate'`) is the sole predecessor of `wordpress-draft` (`kind: 'external-action')` — you cannot reach the WordPress draft node without traversing human approval. The whole definition is validated by `parseWorkflowDefinition` (acyclic, all edges resolve, unique ids) at `getContentWorkflowDefinition()`. Do not reorder these two steps.
2. **Campaign state machine is closed and throws on illegal transitions.** `CAMPAIGN_TRANSITIONS` (`campaign/campaign.ts`) is the only legal path set: `draft → approved`; `approved → {sending, draft}`; `sending → {sent, failed}`; `sent → {}` (terminal); `failed → sending` (retry). `transitionCampaign` throws `"illegal campaign transition: X -> Y"` for anything else, and step ids must be unique (`campaignSchema` superRefine rejects duplicates). `campaignSchema` is `.strict()` — unknown keys are rejected.
3. **Exactly 8 content artifact fields are persisted — never 9 or 11.** `CONTENT_WORKFLOW_ARTIFACT_FIELDS` in `workflow/record-workflow-artifacts.ts` is a `const` tuple of exactly `keywordResearch, sourceCapture, seoBrief, outline, articleDraft, factCheckReport, brandReview, antiSlopReview`. `recordContentWorkflowArtifacts` sinks only those that carry an `artifactId`. `human-approval` is a gate and `wordpress-draft` is an external action — neither is an artifact and neither belongs here.
4. **There is exactly one live provider send path, and it is guarded.** `createGuardedCampaignSendExecutor` (`workflow/guarded-campaign-send-executor.ts`) routes each campaign-send job through `guardLiveProviderExecutionAfterPreflight` from `platform/providers/live-approval-runtime`. It mints an external-call receipt, emits a redacted audit event, and refuses to re-run the adapter when a succeeded external call already exists for the job's idempotency key (provider-level exactly-once). The adapter receives a secret-resolved connection, never a cleartext key; the request summary stored on the receipt is the routing field (`{ to }`), never the body. A denied/absent approval surfaces as a `permission-error` `RunnerExecutionError`; `reserved-elsewhere` is conservatively thrown as a retryable `provider-error` rather than silent success.

## Harmony rules

- **Which engine**: opzava canonical (`src/opzava`). All product logic lives under `src/opzava/modules/content`; the module crosses to the inherited `src/lib` engine **only** through the sanctioned read-seams (`audit`/`costs` reading `audit_log`/`token_usage`) at the platform layer — never directly. See ARD 0007 (engine separation) and `test/engine-boundary.test.mjs`. The durable runner used by the campaign-send subsystem (`createRunnerWorker` → `run-approved-campaign.ts`) is the only place the opzava runner backs this module.
- **Dead-surface / dead-wired**: (1) The core `WorkflowRun`/`StepRun` run/step-run transition machinery is dead surface — this module uses only `parseWorkflowDefinition` from `core/workflows`, never `parseWorkflowRun`/`transitionStepRunStatus` etc. Do not assume the per-step run model drives execution; the runner's `Job`/`Attempt` does. (2) The durable runner backs **only** the campaign-send subsystem, not the broader content workflow steps — do not assume every workflow step is durable. See copied guardrails below.

## Editor guardrails

Copied verbatim from `docs/architecture/system-map/92-stale-findings.md` (verified 2026-06-24). Code wins where this and the code disagree.

> **❌ REFUTED — "the provider live-execution guard is bypassed / mock-first only"**
>
> An older system-map finding asserted the live send path bypasses the safety guard and only the mock path was wired. **No longer true.** The guarded send path is wired into production:
>
> - `src/app/api/campaigns/[id]/run/route.ts` → `createGuardedCampaignSendExecutorForCampaign`
> - → `src/opzava/modules/content/campaign/guarded-campaign-send-runtime.ts`
> - → `src/opzava/modules/content/workflow/guarded-campaign-send-executor.ts` → `guardLiveProviderExecutionAfterPreflight`
>
> **Guardrail (content / providers MODULE.md):** the live boundary *is* the production send path. Do not add a second, parallel live-execution route; all live provider calls go through the guarded executor.

> **⚠️ PARTIAL — "the durable runner was built but is unused"**
>
> The durable runner IS used — but only by the **campaign-send subsystem**, not as a general per-step runner across the whole content workflow.
>
> - `createRunnerRepository` → `src/opzava/modules/content/campaign/guarded-campaign-send-runtime.ts`
> - `createRunnerWorker` → `src/opzava/modules/content/campaign/run-approved-campaign.ts`
>
> **Guardrail (runner MODULE.md):** `Job`/`Attempt` is the real durable-execution model for campaign sends; the broader workflow steps do not yet run through it. Do not assume every workflow step is durable.

> **✅ CONFIRMED — only 8 content artifact fields are persisted**
>
> `src/opzava/modules/content/workflow/record-workflow-artifacts.ts` persists 8 artifact fields (`CONTENT_WORKFLOW_ARTIFACT_FIELDS`: keywordResearch, sourceCapture, seoBrief, outline, articleDraft, factCheckReport, brandReview, antiSlopReview). The `human-approval` step is an **approval gate** and the final `wordpress-draft` is an **external action** — neither is persisted as a content artifact.
>
> **Guardrail (content MODULE.md):** `human-approval` is a gate, not an artifact type; do not expect it in the artifact store.

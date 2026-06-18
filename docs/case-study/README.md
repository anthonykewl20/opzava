# Opzava Case Study

This folder is the Build-in-public source of truth for how Opzava is being built.

Opzava is not just another automation dashboard. The story is the build method: turn an inherited AI-operations base into a serious automation tool by refusing shortcuts that usually make agent systems collapse later.

## Purpose

The case study exists to make the build visible, credible, and interesting while the product is still under construction.

Each entry should help a reader understand:

- What high-leverage product decision was made.
- What engineering risk it removed.
- What proof exists in the repo.
- What we refused to fake.
- Why this makes Opzava more trustworthy as an automation tool.

## Content Promise

- Show the real build, not a polished myth.
- Turn engineering receipts into a narrative people want to follow.
- Explain why each boring-looking foundation matters later.
- No invented outcomes, metrics, users, revenue, integrations, or capabilities.
- No screenshots, benchmarks, or product claims without matching repo evidence.
- No secret values, private credentials, tokens, or environment-specific details.

## Entry Format

Use `000N-short-topic.md`.

Each entry must include:

- A strong narrative hook.
- The product stakes.
- The engineering move.
- Evidence from files, tests, commands, or docs.
- A “what we refused to fake” section.
- Validation results.
- A next thread for the following case-study entry.

## Current Entries

- `0001-foundation-contracts.md`: foundation contracts before runner code.
- `0002-durable-runner-contracts.md`: durable runner contracts before execution.
- `0003-operational-observability-contracts.md`: external call, cost, and audit contracts before live providers.
- `0004-durable-runner-repository.md`: SQLite-backed runner repository before worker execution.
- `0005-runner-migration-integration.md`: repository schema registered through application startup migrations.
- `0006-atomic-lease-acquisition.md`: queued jobs become leased only with durable attempt records.
- `0007-transactional-attempt-outcomes.md`: leased attempts close as success, retry, or dead letter.
- `0008-expired-lease-recovery-execution.md`: expired leases recover into retryable failures or dead letters.
- `0009-worker-boundary-before-live-providers.md`: one-job worker execution boundary before live provider adapters.
- `0010-retry-policy-before-provider-adapters.md`: retry timing becomes an injected policy before live adapters.
- `0011-runner-operational-events.md`: worker and recovery decisions become durable operational events.
- `0012-provider-adapter-contracts.md`: provider adapter inputs, outputs, and external call records are typed before live calls.
- `0013-provider-execution-events.md`: provider execution emits redacted external-call operational events before live providers.
- `0014-runner-daemon-loop.md`: the one-job worker gains bounded polling and graceful shutdown before process wiring.
- `0015-admin-settings-contracts.md`: runner and provider operator settings become typed, bounded, redacted value objects before runtime wiring.
- `0016-admin-settings-persistence.md`: validated operator settings persist with value-free audit events before runtime wiring.
- `0017-runtime-settings-projections.md`: validated settings project into narrow runner, retry, and provider runtime option shapes.
- `0018-runtime-settings-loader.md`: persisted settings load into runtime projections with explicit unavailable behavior.
- `0019-runtime-runner-daemon-construction.md`: loaded runtime settings construct the runner daemon without starting execution or inventing defaults.
- `0020-provider-request-runtime-defaults.md`: provider adapter requests use loaded runtime timeout and retry defaults before live execution.
- `0021-provider-credential-resolution-boundary.md`: live provider credentials resolve only through an injected resolver before adapter execution.
- `0022-provider-execution-preflight.md`: runtime request defaults and credential resolution compose into preflight before adapter calls.
- `0023-preflight-failure-operational-events.md`: blocked preflight failures become redacted audit operational events before adapter execution.
- `0024-mock-only-provider-execution.md`: successful preflight can execute mock adapters while live profiles remain blocked before approvals.
- `0025-provider-execution-approval-guard.md`: live provider actions get explicit approval allow/deny semantics before live adapters are enabled.
- `0026-provider-approval-operational-events.md`: provider approval allow and deny decisions become redacted audit operational events before live execution.
- `0027-live-provider-approval-guard.md`: live-profile preflight success evaluates approval and records the decision, then refuses execution while live adapters stay disabled.
- `0028-live-provider-execution-boundary.md`: approved live actions execute exactly once, refusing duplicates via an injected idempotency lookup, before cost and audit wiring.
- `0029-provider-execution-cost-events.md`: an executed live provider action becomes a redacted cost operational event from caller-measured units, before any cost wiring touches the execution boundary.
- `0030-provider-execution-audit-events.md`: an executed live action becomes a redacted `provider.execution.recorded` audit receipt, before the execution path is wired in.
- `0031-live-provider-execution-wiring.md`: a granted approval hands off to the idempotent execution boundary via an optional, backward-compatible dependency; council-reviewed.
- `0032-executed-action-audit-receipt.md`: a freshly executed live action emits its redacted `provider.execution.recorded` audit receipt; cost emission deferred until usage/pricing are modeled.
- `0033-external-call-idempotency-lookup.md`: the injected idempotency port gets a real query over stored external-call records (read half); council-reviewed, atomic reserve deferred to 0034.
- `0034-atomic-idempotency-reservation.md`: a unique-constraint INSERT...ON CONFLICT reservation makes a concurrent double-win impossible; council-unanimous SOUND.
- `0035-reserve-before-execute.md`: the execution boundary reserves the idempotency key before running the adapter; a lost reservation never executes; council-unanimous SOUND.
- `0036-reservation-lifecycle-on-failure.md`: a non-succeeded or thrown action releases its reservation so a retry can win; success keeps it; council caught and fixed the throw-path leak.
- `0037-lookup-ignores-failed-calls.md`: the idempotency lookup counts only succeeded external calls, so a failed action retries; completes the exactly-once substrate (0027-0037).
- `0038-content-module-idea-intake.md`: opens `src/opzava/modules/content/` with the first content artifact contract (Idea Intake) — the start of Layer 6.
- `0039-content-keyword-research-contract.md`: the second content artifact (Keyword Research), linked by lineage to its idea, with a primary-keyword consistency rule.
- `0040-content-source-capture-contract.md`: the source-capture provenance artifact — traceable sources with unique ids, linked to its idea.
- `0041-content-seo-brief-contract.md`: the SEO brief artifact, the first to carry three lineage links (idea + keyword research + sources).
- `0042-content-outline-contract.md`: the outline artifact — uniquely-headed sections with key points, linked to its SEO brief.
- `0043-content-article-draft-contract.md`: the article draft — every section must cite at least one captured source (provenance baked into the schema).
- `0044-content-fact-check-report-contract.md`: the fact-check report — a "passed" verdict structurally requires every claim supported and sourced.
- `0045-content-brand-review-contract.md`: the brand/style review across explicit dimensions; a passed review cannot hide a failing check.
- `0046-content-anti-slop-review-contract.md`: the anti-slop review — passed means zero detected patterns; a rejection must name each slop pattern and its fix.
- `0047-content-wordpress-draft-request-contract.md`: the terminal draft-only artifact — publishing is structurally impossible, and an approval id + all four quality-gate ids are required.
- `0048-content-workflow-definition.md`: the 10 content artifacts wired into one acyclic, validated step graph; approval-gate precedes the external action by construction.
- `0049-content-artifact-envelope.md`: the typed bridge that wraps each derived content payload as a lineage-bearing generic Artifact (per ARD 0003).
- `0049-content-artifact-envelope.md`: the typed bridge that wraps each derived content payload as a lineage-bearing generic Artifact (per ARD 0003).
- `0050-content-step-outputs.md`: every workflow step bound to its declared output type (record/artifact/approval/external-action), proven exhaustive against the graph.
- `0051-content-idea-intake-step-service.md`: the first content step service — `idea-intake` runs through the durable runner, producing a validated `IdeaIntake` record whose declared output the runner verifies; failures normalize to one bounded `RunnerExecutionError`.
- `0052-content-keyword-research-step-service.md`: the first derived, provider-backed step — `keyword-research` turns an untrusted mock-provider draft into a schema-validated, lineage-bearing `keyword-research` Artifact envelope, verified as an `artifact` output through the durable runner.
- `0053-content-source-capture-step-service.md`: the provenance step — `source-capture` turns a mock-provider draft into a `source-capture` Artifact with unique-keyed sources traced to the idea, the second derived step to reuse the runner bridge unchanged.
- `0054-content-seo-brief-step-service.md`: the first multi-input step — `seo-brief` validates and composes the idea + keyword-research artifact + source-capture artifact into an `seo-brief` Artifact whose lineage carries all three upstream ids.
- `0055-content-outline-step-service.md`: structure before prose — `outline` turns the brief's recommended headings into a unique-headed `outline` Artifact with lineage to the idea and brief; review caught and removed dead counter-guard slop.
- `0056-content-article-draft-step-service.md`: provenance as a schema invariant — `article-draft` composes idea + outline + source-capture into an `article-draft` Artifact where every section must cite a captured source id.
- `0057-content-fact-check-step-service.md`: the first quality gate — `fact-check` emits a `fact-check-report` Artifact whose `passed` verdict structurally requires every claim supported and every supported claim sourced.
- `0058-content-brand-review-step-service.md`: the second quality gate — `brand-review` judges five explicit dimensions; a `passed` review cannot hide a failing dimension, and every failure must carry a note.
- `0059-content-anti-slop-review-step-service.md`: the third quality gate — `anti-slop-review` screens for AI slop; `passed` means zero detected patterns and a rejection must name each pattern with a required fix.
- `0060-content-human-approval-step-service.md`: the accountable human gate — `human-approval` records a validated `Approval` (named approver, reason, target) over the draft; the first step whose output is an approval, not an artifact.
- `0061-content-wordpress-draft-step-service.md`: the terminal publishing step — `wordpress-draft` produces a structurally draft-only `wordpress-draft-request` gated by a granted approval and all four quality artifacts; completes the eleven-step content workflow.
- `0062-content-workflow-executor.md`: the orchestrator — `runContentWorkflow` runs all eleven steps end-to-end on mock providers, threading records into inputs, and halts before the external action on a rejected approval; completes Layer 6 (one content workflow runs locally in draft-only mode).
- `0063-content-keyword-research-provider-adapter.md`: opens Layer 7 — binds the content keyword-research provider to the existing platform `ProviderAdapter` contract; a mock provider call now yields a validated result and a real `ExternalCallRecord`, reusing `platform/providers` with no duplication.
- `0064-content-keyword-research-execution.md`: routes the keyword-research provider call through the platform execution path so it emits external-call, cost, and audit operational events to a sink — Layer 7's per-call recording requirement, on a mock.
- `0065-content-source-capture-provider-integration.md`: generalizes the Layer 7 pattern — source-capture gets the same adapter + execution treatment, proving the integration is a repeatable template, not a one-off; a second provider call emits the full three-event footprint.
- `0066-content-article-draft-provider-integration.md`: carries the pattern to a multi-input (`{idea, outline, sourceCapture}`), `llm`-kind provider — the richer input is just a validated structured request value; the boundary and three-event recording are unchanged.
- `0067-content-fact-check-provider-integration.md`: the final provider-call integration — fact-check (`{articleDraft, sourceCapture}`) joins the boundary; all four content provider-call steps now emit external-call/cost/audit through the platform path.
- `0068-content-workflow-recording-executor.md`: wires the provider boundary into the run — `runContentWorkflowWithRecording` routes the four provider-call steps through the recording adapters, so a full content WorkflowRun emits a complete 12-event (4 external-call + 4 cost + 4 audit) operational trail.
- `0069-content-wordpress-publishing-adapter.md`: the first non-generation provider — a mock WordPress `publishing` adapter that turns a `WordpressDraftRequest` into a draft-only receipt through the platform boundary; publishing is structurally impossible (`status` literal `'draft'`).
- `0070-wordpress-connection-admin-config.md`: opens admin settings — the WordPress-connection operator config (`siteUrl` + credential as a `SecretReference`, draft-only), with audit redaction so the secret never appears in cleartext; the editable config the live adapter and setup wizard will use.
- `0071-resend-connection-admin-config.md`: the sibling Resend (email) operator config — API key as a `SecretReference` + validated default from-address, same audit redaction; the chosen managed email-provider path (a fleet consensus rejected self-hosting Plunk).
- `0072-provider-connection-settings-and-wizard.md`: makes WordPress + Resend connections editable in admin settings (secret fields write-only, never returned) and captured in the setup wizard as an optional step; the wizard renders (Next build verified). Backend by the fleet; UI/UX by Opus.
- `0073-connection-settings-resolver.md`: the bridge from saved connection settings to the live adapters — resolves WordPress/Resend live connections (with the secret) or null when not configured; pure + dependency-injected.
- `0074-connection-verifier.md`: a pure, fetch-injected verifier that checks saved WordPress/Resend credentials (reachable / rejected / unreachable) without real network in tests; powers a Test-connection button.
- `0075-live-wordpress-draft-publisher.md`: the first live external publisher — creates a WordPress draft via the REST API (status hard-coded `draft`, can never publish); http injected so it is unit-testable, never throws.
- `0076-live-resend-email-sender.md`: the live email counterpart — sends via the Resend API (Bearer key, injected http so unit-testable), never throws, returns a typed result; consumes the resolved Resend connection.
- `0077-live-provider-adapters.md`: wraps the live WordPress/Resend callers as platform `ProviderAdapter`s (mode `live`) so they plug into the existing exactly-once + approval boundary; live kill-switch stays off, WordPress stays draft-only.
- `0078-email-campaign-workflow.md`: realizes ARD 0004 — Opzava owns email campaign automation with an approval gate before any send (no auto-send); the email provider is an injected worker, not a second orchestration engine.
- `0079-resend-campaign-sender.md`: closes the email loop — bridges the live Resend adapter into the campaign sender (per-recipient idempotency); an approved campaign now sends real email exactly-once via the platform boundary.
- `0080-campaign-scheduler.md`: Opzava owns the send schedule — deterministic per-step `sendAt` from hour offsets + a start time; the runner enqueues a send job at each time.
- `0081-campaign-audience.md`: a validated, case-insensitively deduped recipient audience — Opzava owns the list so no one is emailed twice.
- `0082-campaign-run-plan.md`: the capstone — composes schedule + audience into an approval-gated, exactly-once-keyed plan of per-recipient sends; completes the email automation on Opzava's own orchestration (ARD 0004).
- `0083-campaign-send-jobs.md`: maps the approval-gated run plan into durable-runner jobs — one queued, leasable, retryable job per planned send at its `sendAt`, idempotency-keyed for exactly-once enqueue; the runner now owns campaign delivery.
- `0084-enqueue-campaign-send-jobs.md`: persists campaign jobs into the durable runner store, deduped by idempotency key — exactly-once enqueue owned by the system, so re-running a campaign never double-sends.
- `0085-run-campaign-send.md`: the campaign entry point — one call composes plan -> build durable jobs -> idempotency-deduped enqueue against the runner store; approval-gated and exactly-once, so re-running a campaign enqueues nothing new.
- `0086-run-campaign-send-with-repository.md`: binds the campaign entry point to the real durable runner repository inside one DB transaction — atomic, exactly-once enqueue against SQLite; refusal/error rolls back with nothing persisted.
- `0087-campaign-send-executor.md`: the consume side — a RunnerExecutor that sends a leased campaign-send job's email via the injected sender; success resolves, a failed send is a retryable provider-error, a malformed payload is a validation-error that never calls the sender.
- `0088-job-kind-executor.md`: a routing RunnerExecutor that dispatches each leased job to its per-kind handler (content step vs campaign send); unknown kinds fail closed to a validation-error dead-letter rather than silently dropping.
- `0089-campaign-runner-worker.md`: the email-campaign capstone — a factory that assembles repository + dispatcher + send executor into a ready durable worker, proven end-to-end by producing a campaign and draining all sends through the real runner against SQLite.
- `0090-campaign-aggregate.md`: the persistable Campaign entity with an explicit status state machine (draft->approved->sending->sent/failed) — sending is unreachable from draft, so approval is a mandatory auditable edge; reuses the existing audience/step contracts.
- `0091-campaign-repository.md`: the SQLite repository for campaigns (upsert/get/list-by-status/delete), validating via parseCampaign on every read and write so malformed rows fail closed; mirrors the runner-repository idiom.
- `0092-campaign-api-routes.md`: admin-only HTTP routes to list, create-draft, and approve campaigns; approval is server-enforced through transitionCampaign so the browser can never skip the approved edge or illegally re-transition.
- `0093-campaigns-ui.md`: the operator Campaigns panel (Opus-designed) — compose a draft, list with status pills, approve; every action calls the admin-only routes and the browser holds no transition logic (approval is server-enforced by the aggregate).
- `0094-run-approved-campaign.md`: the RUN action — drives an approved campaign approved->sending, enqueues+drains its sends through the durable worker, then sending->sent or failed; only an approved campaign can run.
- `0095-campaign-run-route.md`: the admin-only POST /api/campaigns/[id]/run route — resolves the saved Resend connection into a live sender and drives an approved campaign to delivery via runApprovedCampaign; 400/404/409 guards, fully network-mocked tests.
- `0096-campaign-worker-daemon.md`: the continuous background drain — loops runNext, processing as work appears and sleeping a backoff only when idle, until a stop signal; sleep + stop are injected so it is timer-free and deterministic in tests.
- `0097-architecture-entropy-guard.md`: a pure static-analysis test (Layer 10) over ~105 opzava files / ~421 edges — asserts no import cycles, platform never imports modules/content, and content contracts stays a leaf; fails CI on structural decay.
- `0098-dead-letter-read-model.md`: a focused global read query (listRecentDeadLetters) over the dead-letter table — newest-first, limit-clamped, re-validated on read; a new module that keeps the big repository file untouched, backing an operator failures panel.
- `0099-ops-dead-letters-route.md`: admin-only GET /api/ops/dead-letters wrapping the read model — newest-first, limit-clamped, read-only; backs the operator failures panel.
- `0100-ops-failures-panel.md`: the operator Failures/Dead-Letters panel (Opus UI) — read-only list of exhausted-retry jobs with error class/message, run, replay metadata, and time; wired into nav OBSERVE + router.
- `0101-cost-read-model.md`: a global cost-event read model (listRecentCostEvents + summarizeCostEvents) over kind='cost' operational events — newest-first, limit-clamped, re-validated on read; backs the operator costs panel.
- `0102-ops-costs-route.md`: admin-only GET /api/ops/costs returning recent cost events + a {count,estimated,actual} summary; read-only, limit-clamped; backs the operator costs panel.
- `0103-ops-costs-panel.md`: the operator Costs panel (Opus UI) — summary totals (count/estimated/actual) + a per-event breakdown (provider/operation/units/cents/time); read-only, wired into nav OBSERVE + router.
- `0104-approval-repository.md`: the SQLite repository for approvals (upsert/get/list-by-status), validating via parseApproval on read+write so an approval can never persist in an inconsistent decided/undecided state; backs the operator approval queue.
- `0105-ops-approvals-route.md`: admin-only GET /api/ops/approvals listing persisted approvals newest-first with an optional ?status filter (invalid status ignored); read-only, backs the operator approval queue.
- `0106-approval-queue-panel.md`: the operator Approval Queue panel (Opus UI) — read-only list of persisted approvals with status filter chips, target/requester/decision metadata; deciding stays a server action.
- `0107-run-read-model.md`: a derived recent-runs view (listRecentWorkflowRuns) aggregating opzava_runner_operational_events into one summary row per workflow run (event counts by kind + last activity); pure aggregate, no payload read; backs the content runs panel.
- `0108-ops-runs-route.md`: admin-only GET /api/ops/runs returning recent run summaries (per-kind event counts + last activity); read-only, limit-clamped; backs the content runs panel.
- `0109-content-runs-panel.md`: the operator Content Runs panel (Opus UI) — read-only list of recent runs with per-kind event-count chips and last activity; run orchestration stays server-side.
- `0110-approval-decide-route.md`: the first interactive ops action — admin-only POST /api/ops/approvals/[id]/decide that approves/rejects a requested approval through the transitionApprovalStatus state machine; 404/409/400 guards, rate-limited.
- `0111-approval-decide-ui.md`: makes the Approval Queue interactive — Approve/Reject buttons on requested rows (Opus UI) POST to the guarded decide route with an optional reason; the decision stays server-enforced (a double-click gets 409).
- `0112-campaign-daemon-runtime.md`: the production daemon entrypoint — wires the campaign worker + drain daemon with a real timer sleep and a flag-based stop signal, both injectable so tests use no real timers; runCampaignDaemon returns the drain report.
- `0113-runner-retention.md`: Layer-12 GC — pruneRunnerData deletes old operational events, dead letters, and only succeeded jobs past a caller cutoff in one transaction, idempotent; never touches in-flight work or record_json.
- `0114-maintenance-prune-route.md`: admin-only POST /api/ops/maintenance/prune wrapping pruneRunnerData with a retention window (explicit olderThan or default 90 days); rate-limited, returns delete counts + cutoff.
- `0115-maintenance-panel.md`: the admin Maintenance panel (Opus UI) — retention-days input + confirm-guarded Run-cleanup button POSTing the prune route, with a last-report display; deletion policy stays server-side.
- `0116-artifact-repository.md`: the SQLite repository for content artifacts (upsert/get/list-by-type-and-run), validating via parseArtifact on read+write (rejects secret-bearing or unlineaged artifacts); first persistence for the operator artifact-detail views.
- `0117-ops-artifacts-route.md`: admin-only GET /api/ops/artifacts returning lightweight artifact summaries (no content payload) newest-first with ?type/?run filters; backs the operator artifacts list.
- `0118-ops-artifact-detail-route.md`: admin-only GET /api/ops/artifacts/[id] returning the full artifact (content+lineage+validation), re-validated on read (rejects secret-bearing content); 404 when absent; backs the artifact drill-in.
- `0119-artifacts-panel.md`: the operator Artifacts panel (Opus UI) — master/detail browser listing artifact summaries with type filter chips and drilling into one to show validation, lineage, and pretty-printed content; closes the main Layer-9 gap.
- `0120-record-workflow-artifacts.md`: a pure post-process extractor (scout-confirmed seam) that forwards each artifact a content run produces to a sink wired to the repository — no executor change; populates the Artifacts panel with real run output.
- `0121-run-and-record-content-workflow.md`: the thin orchestrator that runs a content workflow and records its 8 produced artifacts into an injected repository (run id derived from the idea); executor untouched, so a real run now populates the Artifacts panel.
- `0122-agent-role-contract.md`: the AgentRole contract + DEFAULT_AGENT_ROLES seed roster — Opzava modeled as a virtual company of AI-agent personas (Copywriter/SEO/Email Specialist/…) grouped by department, each owning real workflow steps; the org-chart foundation for the Team Dashboard.
- `0123-agent-role-repository.md`: the SQLite repository for agent roles (upsert/get/list-by-dept-and-status) with an idempotent seedDefaults() that loads the roster on first run; validates parseAgentRole on read+write.
- `0124-team-agents-route.md`: admin-only GET /api/team/agents that seeds the default roster on first run and returns it grouped by department with ?dept/?status filters; backs the Team Dashboard.
- `0125-team-dashboard-panel.md`: the Team Dashboard (Opus UI) — the virtual-company staff roster: department sections of agent cards with status pills, owned-step chips, and responsibilities; planned agents dimmed. Makes the agent-team vision visible.
- `0126-agent-activity.md`: per-agent activity attribution — summarizeAgentActivity counts each agent's produced artifacts via the scout-confirmed artifactType join (fact-check->fact-check-report); the basis for showing each agent's output on the dashboard.
- `0127-team-agents-activity.md`: enriches GET /api/team/agents so each agent carries an artifactCount (from summarizeAgentActivity), carried through the byDepartment grouping; feeds the dashboard's per-agent output.
- `0129-agent-status-transition.md`: a status state machine for agents (active<->paused; planned not toggleable) — transitionAgentStatus re-validates via parseAgentRole; the basis for operator pause/activate.
- `0130-agent-status-route.md`: admin-only PATCH /api/team/agents/[id] that pauses/re-activates an agent through transitionAgentStatus (404 missing, 409 illegal e.g. planned, 400 bad status), rate-limited.
- `0132-department-pipeline.md`: buildDepartmentPipeline renders a department's workflow as an ordered step pipeline, each step attributed to its owning agent (unowned -> null); the basis for the department project view.
- `0133-team-pipelines-route.md`: enriches GET /api/team/agents to also return per-department `pipelines` (ordered steps with owning agents) alongside the roster + artifactCount; feeds the department project view.
- `0134-department-pipeline-view.md`: renders each department's workflow as a connected step pipeline on the Team Dashboard (step id + owning agent, unassigned dimmed); makes the virtual company's per-department flow visible.
- `0135-complexity-ratchet.md`: Layer-10 eslint complexity ratchet scoped to src/opzava (complexity 20 / max-depth 4 / max-nested-callbacks 5, tests exempt) at thresholds the code already passes — locks in quality, gates future decay; max-lines-per-function omitted (factory-of-closures false positive).
- `0137-social-artifact-envelope.md`: opens the Social Media department — createSocialArtifact + SOCIAL_ARTIFACT_TYPES mirror the content envelope but produce core Artifacts, so social artifacts flow through the existing repo/panel/activity; isolated new src/opzava/modules/social module.
- `0138-social-post-draft-step.md`: the Social department's first step service — turns a brief into a 'social-post-draft' Artifact via an injected mock provider (dumb worker), mirroring the content step pattern with the social envelope.
- `0139-social-department-activation.md`: activates the Social Media department on the org chart — the Social Media Manager becomes active owning social-post-draft, and a Social Media pipeline is registered so the Team Dashboard renders it; per-agent activity attributes social-post-draft artifacts to it automatically.
- `0140-social-review-step.md`: the Social department's quality gate — social-review wraps a pass/reject verdict as a 'social-review' Artifact; a passed review must have zero issues, a rejected one must list issues with reasons (structural invariant).
- `0141-social-approval-step.md`: the Social department's human gate — produces a validated Approval (not an artifact) targeting the post draft, requestedAction 'social-publish'; the mandatory human decision before scheduling.
- `0142-social-schedule-request-step.md`: the Social department's terminal step — schedule/draft-only, never auto-publishes (no 'published' status by construction), requires a granted approval, lineage [post-draft, review, approval]; completes the social workflow.
- `0143-social-pipeline-ownership.md`: assigns an owning agent to every social pipeline step — the Social Media Manager owns brief/post-draft/schedule, and a new Social Reviewer agent owns review; the Social dept now has two agents and a fully-owned pipeline.
- `0144-general-va-department.md`: opens the General VA department (4th dept) — createGeneralVaArtifact + GENERAL_VA_ARTIFACT_TYPES and the va-task-draft step, mirroring the social pattern and producing core Artifacts; new isolated src/opzava/modules/general-va module.
- `0146-general-va-activation.md`: activates the General VA department on the org chart — the General VA agent becomes active owning the VA steps and the General VA pipeline is registered; all four named departments (Content/Email/Social/General VA) are now live on the Team Dashboard.
- `0147-agent-profiles.md`: gives every agent a persona identity — AgentProfile (displayName, avatarEmoji, charter, preferredModel) + DEFAULT_AGENT_PROFILES covering all twelve agents; the basis for a real staff directory on the dashboard.
- `0150-artifact-summaries.md`: adds listArtifactSummaries to the artifact repository — a column-only read ({artifactId,artifactType,workflowRunId,createdAt}, newest-first, no record_json) so per-agent last-active can be computed cheaply.
- `0151-agent-last-active.md`: summarizeAgentActivity now also computes lastActiveAt per agent (newest createdAt among owned artifacts, via listArtifactSummaries); AgentActivity gains lastActiveAt:string|null, artifactCount unchanged.
- `0153-va-task-review.md`: the General VA department's quality gate (pass/reject verdict as a 'va-task-review' Artifact), matching the other departments; shipped alongside ARD 0006 confirming Postgres-compatibility of the schema.
- `0154-va-approval-step.md`: the General VA department's human approval gate (an Approval, requestedAction 'va-task-complete') — completing the dept's intake->draft->review->approval workflow so all four departments share the same approval discipline.
- `0152-agent-last-active-ui.md`: surfaces last-active on the dashboard — the route merges lastActiveAt onto each agent and the AgentCard shows 'active <date>' beside the output count; the roster becomes a living staff directory.

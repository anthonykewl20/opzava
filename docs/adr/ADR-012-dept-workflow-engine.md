# ADR-012: Department workflow engine, approvals, and content pipeline

Status: Accepted

Opzava defines department work as versioned `Workflow`/`Playbook` policy, and OpenClaw executes that work through provisioned standing orders, cron, TaskFlow, task-ledger state, sessions, channels, and runtime approvals. The same engine powers Marketing content, Finance events, Support SLA handling, CRM-sensitive actions, send-on-behalf work, and scheduled reports while keeping business approvals in Opzava and exec/plugin gates in OpenClaw.

## Context

ADR-003 puts OpenClaw behind the `gateway-broker` ACL and splits normal runtime authority from admin/provisioning authority. ADR-004 keeps Opzava Postgres as the source of truth for business state, policy, audit, outbox, and projections while OpenClaw remains the owner of runtime sessions, runs, Gateway-local config, task-ledger state, channel runtime, cron, TaskFlow, and streaming events. ADR-005 makes tool policy and approval gates the enforcement layer for side effects. ADR-008 defines AI employees as OpenClaw delegate agents with persona files, workspaces, `AGENTS.md`, channel bindings, autonomy tiers, assignments, and `AgentDispatch`. ADR-009 gives approval prompts and workflow notifications one chat/inbox surface. ADR-010 makes knowledge and report inputs available through Opzava-owned sources and ACL-mediated OpenClaw reads.

Q11 locks the department workflow principle: Opzava defines, OpenClaw executes. Opzava needs durable product truth for what work is allowed, who approved it, which department owns it, what budgets and concurrency limits apply, and what business lifecycle state users see. OpenClaw already has the native execution mechanisms: `AGENTS.md` standing-order authority, cron, managed TaskFlow, tasks, runs, channels, sessions, exec/plugin approvals, and runtime snapshots. Reimplementing those mechanisms in Opzava would duplicate OpenClaw; making OpenClaw config the product source of truth would bypass Opzava's RBAC, audit, approvals, tenant ceilings, and UI lifecycle.

Marketing is the first full department workflow. A tenant needs campaigns, content calendars, AI-generated drafts, human review, approval gates, scheduled publishing, channel refs, metrics, and recurring reports. Finance, Support, CRM, and send-on-behalf need the same workflow spine with different policies: Finance stays T1 for money-moving and reconciliation work; Support uses SLA clocks and escalation; CRM-sensitive imports, merges, exports, contracts, and record mutations stay approval-first; send-on-behalf can be T2 only inside approved channel and policy boundaries.

There are two approval concepts that must not collapse. Opzava `Approval` is the source of truth for business decisions such as content approval, finance approval, CRM merge/export approval, and send-on-behalf authority. OpenClaw `operator.approvals` is the runtime truth for exec/plugin gates while an agent is trying to use a tool or plugin. They can mirror refs into one user inbox, but they do not own the same decision.

The largest sad path is runaway standing-order or cron fan-out: duplicate triggers burn tenant quota, flood the approval inbox, and create pressure to bypass review. The engine must therefore make budget, concurrency, idempotency, approval policy, and runtime limiting part of the definition, not an afterthought.

## Decision

Create a Department Workflow bounded context. Its load-bearing principle is: Opzava defines, OpenClaw executes.

`Workflow`, also called `Playbook` in product language, is the definition aggregate and Opzava source of truth. A workflow records tenant, department, owner, autonomy tier, trigger policy, schedule policy, steps, approval policy, budget, concurrency, timeout, retry policy, failure destination, freshness SLA, projection keys, and version. Publishing a workflow creates provisionable runtime intent; it does not make the browser, broker hot path, or OpenClaw config the authoring surface.

A workflow owns three `Mechanism` children:

- `StandingOrderBlock`: persistent authority rendered into the target `AgentEmployee` `AGENTS.md` standing-order section.
- `CronSpec`: one-shot or recurring schedule rendered into OpenClaw cron.
- `TaskFlowSpec`: managed multi-step runtime definition rendered into OpenClaw TaskFlow for durable steps, waits, branches, resume, and cancel.

`Workflow.Publish` runs through `WorkflowProvisioner` in the admin/provisioning context. The provisioner uses the short-lived ADR-003 admin credential, writes the OpenClaw artifacts, records a `ProvisionReceipt`, and emits events for projections and drift detection. Normal request handlers and broker runtime commands continue to use the scoped hot-path credential. Direct Gateway-side edits are drift; they are detected, surfaced, and either overwritten from Opzava truth or imported through an audited admin repair flow.

Runtime state projects back into Opzava as `WorkflowRun` and `RunStep` write models. OpenClaw task-ledger state, cron firings, TaskFlow runs, sessions, tool calls, approval prompts, channel sends, artifacts, and runtime errors arrive through broker polling, webhooks, and event ingestion. Opzava writes idempotent projections for product lifecycle, reporting, audit correlation, and chat/card status. Runtime refs remain opaque; Opzava does not store OpenClaw rows or Gateway-local config shapes as domain identity.

Use one unified Opzava `Approval` aggregate for business approvals. It supports `Pending`, `Approved`, `Rejected`, and `Expired`, and records requester, optional `requesterAgentId`, approver policy, `policyRef`, `payloadRef`, target aggregate refs, content hash where applicable, expiry/SLA, decision metadata, mirrored OpenClaw refs where applicable, and audit. Business approvals block broker commands until the Opzava approval is `Approved`.

Keep OpenClaw `operator.approvals` as the runtime truth for exec/plugin gates. The broker mirrors exec/plugin prompts into the same chat approval inbox with `openclawApprovalRef`, writes decisions back through the OpenClaw approvals channel, and reconciles by events or polling. If a mirrored business approval and runtime approval disagree, the business conflict resolves to Opzava and execution fails closed as blocked by policy or external runtime state. A runtime exec/plugin approval cannot approve a business decision that Opzava has not approved.

Marketing content uses the workflow engine, not a separate scheduler. `Campaign` defines objective, budget, segment refs, channels, window, and reporting period. `ContentCalendar` owns slots and channel timing. `ContentItem` is the content root with lifecycle `Idea -> Draft -> InReview -> Approved -> Scheduled -> Published -> Archived`. `ContentPipeline` is a process manager that asks a Marketing `AgentEmployee` to draft under T2 policy, routes review through chat/card surfaces, gates approval through Opzava `Approval`, schedules or publishes only after approval, stores channel refs, and records provenance.

No `ContentItem` reaches `Published` without an Opzava `Approval` in `Approved` state for the exact item version or matching content hash. The invariant is enforced at both the gateway command path and the UI. The gateway rejects schedule/publish commands without an approved business approval; the UI does not offer schedule/publish actions for unapproved content and must re-check after edits. Editing approved content invalidates the approval unless policy explicitly permits a non-material change with a recorded hash match.

Reports are workflow runs that produce versioned artifacts. A scheduled or event trigger starts a `ReportJob`, dispatches an agent run, reads data through the ACL from channels, CRM, usage/cost, ledger, campaign, workflow, and runtime projections, then writes a versioned `ReportArtifact` with `tenantId`, `reportType`, period, period hash, `asOf`, source cursors, freshness SLA, metrics, narrative, generated-by run refs, provenance, and artifact storage refs. Reports are cached by `(tenant, reportType, periodHash)`. Stale inputs produce a visible stale report; the agent must not fabricate freshness.

Finance, Support, CRM, and send-on-behalf instantiate the same engine:

- `FinanceEventWorkflow` is T1 by default for invoice, renewal, reconciliation, payment, refund, bank, tax, and external financial mutation work. It can draft recommendations and reports, but mutations require business approval.
- `SupportSlaWorkflow` uses support triggers, T1 acknowledgment where required, tiered escalation, queue policy, and `SLAClock`. Ordinary replies can remain T2 only when ADR-008 support channel bindings allow them; refunds, account changes, PII export, legal language, and escalations require approval.
- CRM-sensitive workflows use T1 for imports, merges, exports, contracts, consent changes, and record mutations, preserving ADR-011 contact identity and merge-audit invariants.
- `SendOnBehalfWorkflow` is T2 only for approved channels, approved actors, approved payload classes, and current consent/policy checks. It uses the same `Workflow`, `Mechanism`, `Approval`, `WorkflowRun`, `RunStep`, and `RunLimiter` machinery rather than a special-case sender.

Every mechanism carries `costBudgetPerHour`, `maxConcurrentRuns`, `requiresApprovalPolicy`, idempotency key shape, timeout, retry cap, failure destination, and freshness SLA where applicable. `WorkflowProvisioner` rejects publish when the workflow would breach tenant, department, employee, plan, or mechanism ceilings. A runtime `RunLimiter` enforces tenant and employee concurrency, fan-out, and cost ceilings before dispatch and during retries. Duplicate scheduled trigger keys collapse. Approval backlog auto-escalates at more than 50 percent of SLA consumption.

## Aggregates

Department Workflow owns these aggregates, process managers, and value objects:

- `Workflow`: the definition aggregate and source of truth for a department playbook. Fields include `tenantId`, `departmentId`, name, version, status, autonomy tier, trigger/schedule policy, steps, approval policy, budget, concurrency, timeout, retry policy, failure destination, freshness SLA, projection keys, mechanism ids, and lifecycle/audit metadata.
- `Mechanism`: a child specification on `Workflow` with kind `StandingOrderBlock`, `CronSpec`, or `TaskFlowSpec`. It records target employee/department refs, rendered artifact refs, budget, concurrency, idempotency, approval policy, retry/timeout settings, and provision state.
- `ProvisionReceipt`: the immutable receipt for an admin provisioning attempt. It records workflow version, mechanism version, target Gateway, rendered artifact refs, content hashes, admin actor/job ref, OpenClaw refs, result, drift metadata, and timestamps.
- `WorkflowRun`: the Opzava run write model projected from OpenClaw runtime state plus business lifecycle events. It records workflow version, trigger key, assignment/dispatch refs, runtime refs, status, cost, approvals, freshness, started/completed timestamps, and failure reason.
- `RunStep`: the step-level write model for TaskFlow steps, standing-order matches, cron firings, approvals, agent runs, sends, report generation, waits, retries, and failures. It stores opaque runtime refs and projection state without becoming the OpenClaw task ledger.
- `RunLimiter`: the policy component that evaluates and records tenant, department, employee, mechanism, plan, cost, concurrency, fan-out, retry, and approval-backlog limits before and during runtime dispatch.
- `Approval`: the Opzava business approval aggregate for content, finance, CRM, send-on-behalf, and other product decisions. It records requester, approver policy, `requesterAgentId`, `policyRef`, `payloadRef`, target refs, decision state, expiry, mirrored runtime refs, and audit.
- `Campaign`: the Marketing aggregate for objective, budget, segment refs, channels, window, owner, status, reporting policy, and linked content/calendar refs.
- `ContentCalendar`: the Marketing calendar aggregate for slots, channel timing, campaign refs, scheduling conflicts, publishing windows, and lifecycle/audit metadata.
- `ContentItem`: the Marketing content root with lifecycle `Idea`, `Draft`, `InReview`, `Approved`, `Scheduled`, `Published`, and `Archived`; versioned body/assets, channel targets, content hash, approval ref, schedule ref, publish refs, and provenance.
- `ContentPipeline`: the process manager that coordinates AI draft, review, approval, schedule, publish, channel refs, and report inputs for `ContentItem`.
- `ReportJob`: the workflow-triggered job for report generation. It records report type, period, source requirements, ACL read cursors, triggering workflow/run, status, freshness SLA, and artifact refs.
- `ReportArtifact`: the versioned report output with metrics, narrative, source cursors, `asOf`, period hash, generated-by run refs, provenance, storage refs, and stale/fresh state.
- `SLAClock`: the Support value object/process state for SLA start, pause, resume, warning, breach, escalation, and acknowledgement deadlines.

`AgentDispatch`, `Assignment`, `AgentEmployee`, `ChannelBinding`, CRM `Contact`, Support `Ticket`, and Knowledge Management corpus refs remain owned by their ADR-008, ADR-010, and ADR-011 contexts. Department Workflow references them by stable ids and opaque runtime refs; it does not absorb their ownership.

## Consequences

The workflow boundary stays clear. Product policy, business approvals, budgets, UI lifecycle, and audit are durable Opzava state. Execution is delegated to OpenClaw's native mechanisms. This avoids duplicate schedulers and task engines while keeping product authority out of Gateway-local files and runtime config.

Provisioning becomes mandatory for workflow changes. Publishing, pausing, changing, or deleting a workflow creates admin jobs, receipts, drift detection, and repair paths. This adds operational work, but it preserves the ADR-003 split between admin config writes and hot-path runtime commands.

The same engine can serve multiple departments without per-department infrastructure. Marketing content, Finance event handling, Support SLA escalation, CRM-sensitive work, send-on-behalf, and scheduled reports differ by policies, triggers, mechanisms, and approvals rather than by separate orchestration stacks.

Approvals become easier for users but stricter for execution. Chat can present one inbox for business approvals and mirrored runtime prompts, yet the model preserves two sources of truth. Business decisions are Opzava decisions. Exec/plugin gates are OpenClaw runtime decisions. Disagreement fails closed.

Marketing publishing has a hard review invariant. Product surfaces and gateway commands must treat content approval as a versioned content fact, not as a loose campaign status. Edits after approval require re-approval unless an explicit policy records that the approved content hash still matches.

Budget and concurrency limits are part of the domain. A workflow definition that cannot fit within tenant, department, employee, mechanism, plan, or cost ceilings cannot be published. Runtime fan-out and retries are limited even when a valid standing order, cron, or TaskFlow tries to run.

Reports are reproducible enough to audit. A report records period, source cursors, `asOf`, freshness, runtime refs, and artifact version, so a stale or partial report is visible instead of silently presented as current truth. Re-generation creates a new artifact version rather than mutating history.

Workflow UIs must handle normal asynchronous states: `Draft`, `PendingProvision`, `Provisioned`, `DriftDetected`, `Queued`, `Running`, `WaitingForApproval`, `BlockedByPolicy`, `RateLimited`, `StaleInputs`, `GatewayUnavailable`, `CircuitOpen`, `Failed`, `Canceled`, and `Completed`. These states are ordinary lifecycle, not exceptional UI failures.

## Alternatives

Make OpenClaw cron, standing orders, and TaskFlow definitions the source of truth. Rejected because workflow policy, department ownership, business approvals, tenant ceilings, UI lifecycle, and audit belong in Opzava. OpenClaw config is the provisioned runtime artifact and may drift.

Build a separate Opzava scheduler and task engine for department workflows. Rejected because OpenClaw already owns the native runtime grain for agents: standing orders, cron, TaskFlow, sessions, task-ledger state, channels, tool calls, and runtime approvals. Duplicating that engine would create two execution systems to reconcile.

Use one bespoke workflow implementation per department. Rejected because Marketing, Finance, Support, CRM, and send-on-behalf share the same core concepts: trigger, mechanism, approval, run, step, budget, concurrency, report, and runtime projection. Separate stacks would multiply policy and audit bugs.

Collapse business approvals and OpenClaw `operator.approvals` into one table. Rejected because they answer different questions. Business approvals decide whether Opzava permits a product action. Runtime approvals decide whether OpenClaw may proceed with a specific exec/plugin gate. Mirroring refs into one inbox is useful; merging authority would create unsafe conflicts.

Allow content publishing based on workflow status or campaign owner permission alone. Rejected because Marketing publication is an external brand action. The durable invariant is a versioned `ContentItem` with an `Approved` business approval for the matching content hash, enforced at both the gateway and UI.

Generate reports as ephemeral chat summaries. Rejected because department reports need period identity, source cursors, freshness, provenance, repeatability, artifact versioning, and audit. Chat delivery is a surface for a `ReportArtifact`, not the report source of truth.

Use only persona text or `AGENTS.md` instructions for budget, approval, and concurrency rules. Rejected because ADR-008 and ADR-005 require hard enforcement outside model behavior. Standing-order text can describe authority, but `WorkflowProvisioner`, broker admission, approval checks, and `RunLimiter` enforce it.

## Related ADRs

- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-005: Tool-policy-first security, approval gates, and sandbox posture.
- ADR-008: AI Workforce, delegate agents, personas, and `AgentDispatch`.
- ADR-009: Realtime WS hub, internal chat, assistants-in-chat, and PWA/Web Push.
- ADR-010: Knowledge Mgmt SoT, OKF ingestion, memory/wiki/vector indexes, skill catalog.
- ADR-011: CRM, external channel identity, and Contact resolution.

# ADR-008: AI Workforce, delegate agents, personas, and AgentDispatch

Status: Accepted

> Current-context note (2026-07-15): CRM references in this retained decision mean the deferred CRM rebuild, which returns only with the future user-side dashboard (GitHub issue #200).

Opzava will model an AI employee as an OpenClaw delegate agent provisioned with its own persona files, workspace, `agentDir`, memory, skills, isolated auth, channel bindings, and tool policy. AI Workforce owns the Opzava aggregates for employee identity, departments, autonomy tiers, standing orders, channel bindings, and assignments, while `AgentDispatch` remains the bridge from human work such as a `pm.Card` to OpenClaw Workboard/session refs.

## Context

ADR-003 puts OpenClaw behind the `gateway-broker` ACL and splits normal runtime authority from admin/provisioning authority. ADR-004 keeps Opzava Postgres as the system of record for human work, policy, assignments, audit, and projections, while OpenClaw remains the owner of runtime sessions, runs, Workboard, skills, memory, channels, and Gateway-local config. ADR-005 makes tool policy and Opzava approval rows the enforceable governance layer. ADR-007 keeps human authorization in Opzava through resource-scoped RBAC and Postgres RLS.

Q8 makes AI Workforce the core Opzava domain. Opzava is an AI-staffed company-in-a-box where AI teammates work across Marketing, Customer Support, Finance, and Customer Management/CRM. These teammates need durable product identity, department routing, standing orders, channel bindings, autonomy limits, knowledge scope, and auditable work status. They also need to stay on OpenClaw's grain: delegate agents, persona files, workspaces, `agentDir`, sessions, memory-lancedb, skills, channel bindings, cron, standing orders, subagents, and Workboard.

Q4 introduced `AgentDispatch` as the bridge between human project-management work and OpenClaw runtime work. Q8 introduces `Assignment` as an AI Workforce concept. Those names are adjacent but not interchangeable. `pm.Card` remains the Opzava human-work aggregate. `workboard.Card` remains the OpenClaw agent-work concept. `AgentDispatch` is the Opzava bridge that records human intent and opaque runtime refs. `Assignment` is the AI Workforce aggregate that binds a concrete task to a selected `AgentEmployee`.

Q4b's project-to-workspace mapping is revised by Q8. Knowledge scoping is now:

- employee = workspace
- project = shared corpus
- org = corpus

An employee's workspace carries persona, personal memory-lancedb, skills, session history, and agent-specific state across all work. A project contributes a read-only shared corpus overlay for authorized assignments. An organization contributes an org corpus overlay. Memory writes land in the employee workspace or Opzava KB candidate flow, never directly in the project corpus. ADR-010 will own the Knowledge Management source-of-truth, OKF ingestion, memory/wiki/vector indexes, and skill catalog details behind this model.

Q11 and ADR-012 depend on the same workforce model. Department workflows are defined by Opzava but executed by OpenClaw mechanisms: standing-order blocks rendered into `AGENTS.md`, cron schedules, TaskFlow runs, sessions, and task-ledger state. Business approvals are Opzava `Approval` rows. OpenClaw `operator.approvals` remains the runtime truth for exec/plugin gates, reconciled through the broker.

The primary sad path is prompt-injection through a customer or web channel that convinces a Tier-2 employee to exfiltrate PII, move money, send credentials, mutate tenant-admin state, or publish externally. Persona text can guide behavior, but it cannot be the enforcement boundary. SOUL can lie; tool policy cannot.

## Decision

An AI employee is an OpenClaw delegate agent. Each `AgentEmployee` maps one-to-one to one OpenClaw delegate agent inside the tenant Gateway and has its own persona identity, workspace, `agentDir`, memory-lancedb slot, skills, sessions, isolated auth material, channel bindings, tool policy, and standing orders. The employee acts on behalf of authorized humans and Opzava workflows, but never impersonates a human user.

All human-facing output from an AI employee is attributed to the employee persona and includes acting-on-behalf-of audit metadata where a human request, workflow, or approval initiated the work. The product may display "from Ava, Support Agent, on behalf of Anthony" or equivalent, but must not collapse the employee identity into the human identity. OpenClaw receives signed acting-user and request attribution through the ADR-003 broker for correlation; it does not become the Opzava authorization source of truth.

AI Workforce owns employee identity and delegation policy in Opzava Postgres. OpenClaw owns the runtime execution objects. Opzava stores opaque refs to OpenClaw agents, workspaces, Workboard cards, sessions, runs, tasks, approvals, channels, and artifacts as value objects. It does not store OpenClaw rows, raw Gateway config shapes, channel secrets, provider credentials, or memory/vector internals.

Ask Opzava is a coordinator facade and delegate agent, not the default worker for every request. Its persona and routing policy say to delegate to a specialist when a suitable employee exists. A PM card, workflow step, chat mention, or proactive trigger enters Opzava, passes RBAC and policy checks, resolves the department and project knowledge scope, selects an `AgentEmployee`, creates an `Assignment`, starts or continues an OpenClaw session through the broker, and reports the result back into chat/card surfaces as the selected employee persona.

The delegation flow is:

- request source: `pm.Card`, chat request, workflow step, standing order, cron trigger, or external channel event
- Opzava admission: tenant lifecycle, RBAC, project access, department policy, autonomy tier, tool policy, approval requirement, rate/spend cap, and idempotency
- bridge: create or reuse `AgentDispatch` for the human-work target and opaque runtime refs
- workforce allocation: create `Assignment` for the selected `AgentEmployee`
- runtime: broker starts or continues the employee's OpenClaw session with the employee workspace and authorized project/org corpus overlays
- execution: OpenClaw tracks session, run, task ledger, Workboard, tools, approvals, logs, and artifacts
- report: broker/webhook projects status into the `Assignment`, `AgentDispatch`, activity feed, chat message, `pm.Card`, workflow run, or incident surface

Per-department default autonomy tiers are:

- Finance: T1 draft and approval by default for payments, invoices, refunds, bank/tax data, external sends, and financial mutations.
- Customer Management/CRM: T1 draft and approval by default for PII, contracts, imports, exports, record merges, consent changes, and customer-record mutations.
- Marketing: T2 send-on-behalf by default only where company-handle posting and channel binding are approved; publishing still follows ADR-012 content approvals.
- Support: T2 send-on-behalf by default for ordinary replies under agent identity; refunds, account changes, PII export, legal language, and escalations fall back to T1.
- T3 proactive is allowed only for non-mutating or explicitly pre-approved standing orders such as monitoring, reminders, briefings, status digests, and SLA nudges. Finance-event standing orders remain T1 with approval.

Governance is enforced at Gateway tool policy, broker admission, Opzava approval rows, and immutable audit rows, not at persona text. Required invariants are:

- outbound HTTP and external sends are limited by per-agent domain/channel allowlists
- PII, financial, credential, legal, tenant-admin, and high-risk CRM reads or mutations require explicit binding and approval policy
- autonomous sends are triggered only by standing orders, cron, TaskFlow, or approved workflow policy, never solely by an inbound hostile message
- every send, mutation, approval decision, tool call, channel action, and policy denial writes an immutable audit row
- every employee has spend, rate, concurrency, and fan-out caps enforced before runtime dispatch
- business approvals use Opzava `Approval` rows; exec/plugin approvals use OpenClaw `operator.approvals`; disagreement fails closed

## Aggregates

AI Workforce owns these aggregates and value objects:

- `AgentEmployee`: one AI teammate in one tenant. Fields include `tenantId`, `name`, `personaId`, `departmentId`, `autonomyTier`, `openclawAgentId` as an opaque ref, `workspaceRef`, `agentDirRef`, `toolPolicyRef`, `standingOrderIds`, `channelBindingIds`, `status`, and lifecycle/audit metadata.
- `Persona`: the versioned behavior and identity bundle rendered into OpenClaw persona files. Fields include `soulMd`, `agentsMd`, `identityMd`, optional `userMd`, `hardBlocks`, version, and provenance.
- `Department`: a work domain such as Marketing, Support, Finance, or Customer Management/CRM. Fields include `name`, `roleMandate`, `defaultTier`, routing rules, escalation queue, and policy refs.
- `AutonomyTier`: the allowed initiative and side-effect level. Values are `T1_DRAFT`, `T2_SEND_ON_BEHALF`, and `T3_PROACTIVE`.
- `StandingOrder`: persistent authority for recurring or event-triggered work. Fields include `scope`, `trigger`, `actions`, `approvalRequired`, `auditLevel`, budget/concurrency refs, and OpenClaw cron/standing-order refs where provisioned.
- `ChannelBinding`: the allowed communication boundary for an employee. Fields include `channel`, `accountId`, `direction`, `scopeFilter`, target allowlist, approval policy, and credential/SecretRef references owned by the Gateway or vault.
- `Assignment`: the concrete workforce allocation. It binds `taskId` and `employeeId` to a task target such as `pmCardId`, workflow step, ticket, report job, or standing-order trigger; optional `projectId`; `agentDispatchId`; `sessionRef`; `runRef`; `taskRef`; `status`; `startedAt`; `completedAt`; and `reportRef`.

`AgentDispatch` is separate from `Assignment`.

`AgentDispatch` is the Q4 bridge aggregate between Opzava human work and OpenClaw runtime work. It records the human intent, actor, target `pm.Card` or workflow step, idempotency key, dispatch policy, selected department, assignment ids, and opaque OpenClaw refs such as Workboard card ref, task ref, run ref, session key, approval ref, artifact refs, channel/thread refs, and report refs. Its job is to keep `pm.Card` and `workboard.Card` cross-referenced without merging them.

`Assignment` is the AI Workforce aggregate binding a task to an employee. It answers "who is doing this work, under which autonomy tier and knowledge scope, in which session, and where did they report?" An `AgentDispatch` may create one or more `Assignment` records when work is split across specialists. An `Assignment` may reference one `AgentDispatch` when it originates from a human card or workflow dispatch. Neither aggregate makes an OpenClaw Workboard id a foreign key into Opzava PM identity.

Knowledge scope is represented on `Assignment` and runtime dispatch policy, not by making projects into workspaces. The employee workspace is always the base workspace. The assignment can add authorized `projectCorpusRef` and `orgCorpusRef` overlays. Cross-project fan-out requires RBAC, corpus revision ids, tenant/project/employee checks, and audit.

## Provisioning Mapping

Provisioning employee runtime artifacts is an admin/provisioning-context operation, not a hot-path runtime command. The tenant-provisioning or platform-ops worker uses the short-lived ADR-003 `operator.admin` credential to write OpenClaw config and workspace files. Normal request handlers and the broker hot path use only the scoped `operator.write` + `operator.approvals` token.

The admin/provisioning context maps Opzava workforce state into OpenClaw artifacts:

- `AgentEmployee` becomes one entry in OpenClaw `agents.list` with a unique `agentId`, `workspace`, `agentDir`, model policy, sandbox/tool policy, skills, subagent policy, and runtime limits.
- `Persona` renders workspace files such as `SOUL.md`, `AGENTS.md`, `IDENTITY.md`, and where needed `USER.md`.
- `Department` and `AutonomyTier` select the default tool policy, approval policy, routing rules, and standing-order templates.
- `StandingOrder` renders to `AGENTS.md` standing-order blocks and, where scheduled or durable, OpenClaw cron or TaskFlow artifacts.
- `ChannelBinding` renders to OpenClaw `bindings[]` and channel routing config using Gateway-owned channel credentials or SecretRefs. Opzava stores binding metadata and refs, not channel secrets.
- `Assignment` starts or resumes OpenClaw sessions through the broker with the employee `agentId`, workspace, `agentDir`, authorized corpus overlays, idempotency key, and parent `AgentDispatch` refs.

The broker reads provisioned employees through an Opzava application port and, where needed, reconciles runtime availability through OpenClaw `agents.list`, session snapshots, Workboard snapshots, task-ledger state, channel binding status, and Gateway health. Reconciliation produces projections and repair incidents; it does not make OpenClaw config the Opzava source of truth for employee policy.

Workspace files are written through the admin context from versioned Opzava aggregate state. A human editing a persona in the product updates `Persona` in Postgres and creates a provisioning job. The job renders the files, applies them to the tenant Gateway, records a provision receipt, and emits events for projections. Direct Gateway-side edits are drift and must be detected, surfaced, and either overwritten from Opzava truth or imported through an audited admin repair flow.

## Consequences

The workforce model has a clean identity boundary. Humans, AI employees, and OpenClaw operator credentials remain different principals. Humans authorize work through Opzava RBAC and approvals. Employees perform work with their own persona and bounded tools. The broker operates the tenant Gateway with scoped operator credentials. Audit rows carry all three where applicable.

The Q4b knowledge mapping is revised. Project knowledge is no longer an OpenClaw workspace. Project and organization knowledge are corpus overlays injected into employee sessions. This keeps employee memory/persona durable across work while preserving project RBAC and rebuildable knowledge indexes under ADR-010.

`AgentDispatch` and `Assignment` now have separate reasons to exist. Product screens can show the human card's dispatch lifecycle without treating the selected employee as the PM card's identity, while AI Workforce can track load, status, tier, session, and report state per employee. Multi-specialist work becomes one dispatch with multiple assignments instead of one overloaded bridge record.

Ask Opzava becomes a routing and coordination surface. It can answer directly only when policy permits and no specialist is more appropriate. Specialist work uses multi-agent routing, subagent sessions, channel bindings, and report-in-chat so the user sees the employee who performed the work and the parent card/thread receives a durable report.

Department defaults are conservative where harm is highest. Finance and CRM start at T1 because money, contracts, PII, exports, merges, and consent changes need human approval. Marketing and Support can use T2 for ordinary external communication only when channel bindings and approval policy permit it. T3 remains narrow and non-mutating by default.

The main sad path is prompt-injection exfiltration from an allowed channel or corpus into an allowed outbound tool. The invariant is that the employee cannot rely on `SOUL.md` for containment. Gateway tool policy, Opzava approval rows, broker admission, allowlisted egress/channel bindings, redaction, rate/spend caps, and immutable audit are the hard controls. If a retrieved document, customer message, or web page instructs an employee to leak PII or bypass approvals, tool policy and approval checks must deny the exact read, send, or mutation even if the model attempts it.

Provisioning becomes a first-class lifecycle. Creating, editing, suspending, or deleting an employee requires idempotent admin jobs, drift detection, provision receipts, repair paths, and deprovisioning hooks. This adds operational complexity but keeps OpenClaw config writes out of request handlers and preserves the ADR-003 two-token split.

Some employee actions become asynchronous. A card assignment, workflow step, or standing order may produce `Queued`, `ProvisioningRequired`, `GatewayUnavailable`, `CircuitOpen`, `ApprovalRequired`, `BlockedByPolicy`, `MissingRuntimeRef`, or `ReportPending` states before completion. Product surfaces must treat those as normal lifecycle states, not exceptional UI bugs.

## Alternatives

Model AI employees as plain Opzava database rows and use one generic OpenClaw agent at runtime. Rejected because persona files, workspaces, memory-lancedb, skills, channel bindings, standing orders, and OpenClaw delegate-agent routing are the native runtime shape. A generic agent would collapse identity, memory, audit, tool policy, and channel authority across employees.

Create one workspace per project. Rejected because Q8 revises Q4b: employee = workspace, project = shared corpus, org = corpus. Project workspaces would duplicate persona and memory state, churn on project changes, and confuse project knowledge with employee identity. Project knowledge belongs in a corpus overlay owned by Knowledge Management.

Let AI employees impersonate the requesting human. Rejected because audit, channel trust, approvals, and user expectations require distinct employee identity. Employees may act on behalf of humans with attribution, but they must not become the human principal or hide behind a human account.

Use `AgentDispatch` as the employee assignment aggregate. Rejected because the bridge between `pm.Card` and OpenClaw Workboard/session refs has a different lifecycle from workforce allocation. Keeping `Assignment` separate lets one dispatch fan out to multiple specialists and lets AI Workforce track employee load, tier, session, report, and status independently of PM card identity.

Rely on `SOUL.md`, hard-blocks, or prompt instructions for governance. Rejected because hostile input, context poisoning, truncation, and model error can bypass persona intent. Enforcement belongs in Gateway tool policy, Opzava approval rows, broker admission, channel/egress bindings, and immutable audit.

Allow T3 proactive behavior broadly for all departments. Rejected because proactive mutation in finance, CRM, support, and marketing can create money, PII, legal, customer-trust, quota, and brand risks. T3 is limited to non-mutating or pre-approved standing orders until a future ADR accepts narrower exceptions with explicit controls.

Make OpenClaw `agents.list` and workspace files the source of truth for employees. Rejected because Opzava owns workforce identity, policy, audit, assignments, RBAC, and lifecycle. OpenClaw config is the provisioned runtime artifact and may drift; Opzava state and provision receipts are the durable truth.

## Related ADRs

- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-005: Tool-policy-first security, approval gates, and sandbox posture.
- ADR-007: Resource RBAC, roles-as-data, and Postgres RLS.
- ADR-010: Knowledge Mgmt SoT, OKF ingestion, memory/wiki/vector indexes, skill catalog.
- ADR-012: Department workflow engine, approvals, content pipeline, reports.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).

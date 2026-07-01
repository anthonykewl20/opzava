**1) Mechanism mapping.** `Workflow` aggregate = playbook (SoT). Three `Mechanism` children: `StandingOrderBlock` (→ OpenClaw AGENTS.md), `CronSpec` (→ cron), `TaskFlowSpec` (→ managed TaskFlow). On `Workflow.Publish`, `WorkflowProvisioner` calls `operator.provisioning` to write artifacts; `ProvisionReceipt` stored. Runtime events (task state, cron firings, standing-order matches) project back via `OpenClawEventIngestor` → `WorkflowRun` / `RunStep` write-model (hybrid CQRS). Agent runtime queries stay on `Workflow` read-model for next-action.

**2) Marketing pipeline.** Aggregates: `Campaign` (objective/budget/window/channels), `ContentCalendar` (slots), `ContentItem` (root) with states `Idea→Draft→InReview→Approved→Scheduled→Published→Archived`. `ContentPipeline` (process manager) orchestrates: AI draft (agent T2) → review → `Approval` gate → schedule/publish. `Report` per cycle: reach, engagement, attribution, cost. Channels pulled via ACL.

**3) Unified `Approval`.** `Approval` is Opzava SoT (`Pending→Approved|Rejected|Expired`, `requesterAgentId`, `policyRef`, `payloadRef`). Provisioner mirrors to OpenClaw `operator.approvals` as *gate references*; gateway enforcement = cache, Opzava = truth. Webhook reconciles; on conflict, Opzava wins. Surfaced in chat (Q7) as a single inbox, filtered by dept/policy.

**4) Reused engine.** `FinanceEventWorkflow` (T1, invoice/renewal/reconcile) and `SupportSlaWorkflow` (T1 ack/tiered escalation) and `SendOnBehalfWorkflow` (T2) all instantiate `Workflow` + `Mechanism` + `Approval` + `Run` + `SLAClock`. Only policies + `Mechanism` shapes differ.

**5) Reports.** Scheduled trigger → agent run → ACL read (channels, usage, ledger) → `ReportJob` → `ReportArtifact` (versioned, stored). Cache by `(tenant, reportType, periodHash)`. Freshness SLA enforced; stale = flagged.

**6) Biggest sad path + invariant.** Runaway standing-orders/cron fan-out burns tenant quota and floods approvals. **Invariant:** every `Mechanism` carries `costBudgetPerHour` + `maxConcurrentRuns` + `requiresApprovalPolicy`; `WorkflowProvisioner` rejects publish that would breach tenant ceiling; runtime `RunLimiter` enforces; approval backlog auto-escalates at `>50%` of SLA. **Inviolable:** no `ContentItem` reaches `Published` without an `Approval` in `Approved` state — enforced at gateway + UI.

**Parity:** Opzava defines, OpenClaw executes; **lean:** one Workflow engine, one Approval model, per-tenant Gateway, no extra infra.

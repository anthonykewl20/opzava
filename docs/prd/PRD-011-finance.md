# PRD-011: Finance expense ledger and money-risk approval UX

## Problem

Opzava has strong policy decisions for AI employees, department workflows, tool-policy enforcement, usage metering, and general approval UX, but Finance still lacks a complete product contract for expense bookkeeping, cost ledger visibility, invoice/reconciliation workflows, and money-risk approvals.

Without this PRD, the Finance slice can drift into unsafe or incomplete behavior:

- Finance `AgentEmployee` work could be treated like ordinary T2 automation even though ADR-005, ADR-012, and the locked grilling decisions require T1 draft-plus-approval for all money actions.
- `costs.html` could remain a usage/cost summary only, leaving no durable Finance-owned expense ledger, chart of accounts, receipt state, reconciliation status, or source provenance.
- Billing `MeterEvent`, `UsageMeter`, and `Invoice` projections from ADR-014 could be confused with the tenant's own expense ledger, making Opzava billing truth and company bookkeeping truth hard to audit.
- Event-triggered invoice and reconciliation work could bypass ADR-012 `Workflow` policy by becoming ad hoc agent prompts instead of published standing-order mechanisms with budget, idempotency, approval policy, runtime projection, and audit.
- Money-risk approvals could appear in `security-audit.html` without enough Finance context: amount, vendor, account, source, ledger impact, approver policy, tool-policy decision, runtime refs, and post-decision audit.
- AI-proposed spend, refunds, payments, provider plan changes, bank/tax mutations, and invoice actions could be shown as approvable UI actions while the underlying Gateway tool policy still allows direct side effects.
- OpenClaw `operator.approvals` for exec/plugin gates could be mistaken for approval to spend money, even though Opzava `Approval` is the business decision source of truth.
- Needed Finance screens are not fully represented in the mockups. `costs.html` covers a cost ledger view, and `security-audit.html` covers general approvals/audit, but invoice review, reconciliation workbench, approval detail, cost-source setup, receipt management, and Finance workflow settings are net-new design work.

The solution is to ship an Opzava-owned Finance product slice for expense ledger, chart of accounts, cost sources, invoice/reconciliation workflows, money-risk approvals, and audit. OpenClaw remains harnessed through the `gateway-broker` for runtime sessions, usage/cost observations, standing-order execution, TaskFlow/cron runs, mirrored runtime approvals, artifacts, and tool-policy signals. Opzava owns Finance records, approval authority, ledger lifecycle, money-risk classification, workflow definitions, user-visible read models, and audit.

This PRD applies ADR-005, ADR-012, and ADR-014. It references those decisions without restating the architecture.

## Goals and Non-goals

### Goals

- Ship the Finance `Costs` experience shown in `costs.html` as an expense ledger, chart of accounts, period summary, budget meter, transaction table, status filters, receipts, export, and cost-source entry point.
- Treat the Finance department `AgentEmployee` as T1 by default: draft, analyze, classify, reconcile, and recommend, but require human approval for every money action and external financial mutation.
- Create a Finance-owned expense/cost ledger distinct from ADR-014 Billing/Usage metering records.
- Support AI/provider usage and runtime cost observations from OpenClaw as cost inputs without making OpenClaw runtime data the Finance ledger source of truth.
- Support non-AI expenses such as ads, plans, token providers, tools, hosting, domains, connected services, storage, and manually entered expenses.
- Model chart of accounts, vendors, cost sources, ledger entries, receipts, statements, invoice projections, reconciliation runs, adjustment entries, and export batches.
- Ship event-triggered Finance workflows for invoice review, invoice matching, receipt collection, ledger classification, reconciliation, variance detection, renewal review, refund/payment proposal, and cost anomaly review.
- Provision event-triggered Finance work through ADR-012 standing-order mechanisms and workflow runs, not ad hoc Gateway config or prompt-only automation.
- Surface Finance approval requests in the existing `security-audit.html` approval queue and a net-new Finance approval detail UX with amount, vendor, ledger impact, risk, source evidence, policy result, and audit.
- Enforce hard tool-policy gates so a Finance employee cannot spend, refund, pay, change a provider plan, mutate bank/tax settings, or transmit financial data without an Opzava business `Approval`.
- Mirror OpenClaw runtime approval prompts where relevant without treating them as business approval truth.
- Record immutable audit for Finance workflow triggers, drafts, classifications, approvals, policy denials, tool invocations, ledger mutations, exports, and reconciliation decisions.
- Define data/API touchpoints by owning bounded context and ports.
- Define OpenClaw-parity boundaries: native harnessed capabilities versus Opzava-owned product authority.
- Define acceptance and testing decisions at the highest user-visible seams.
- Flag every Finance screen that is net-new to design because the named mockups do not fully cover it.

### Non-goals

- Build banking rails, payment processing, card issuing, ACH, bill pay, payroll, tax filing, or direct bank transfer execution.
- Store bank credentials, provider API keys, payment credentials, card numbers, tax identifiers, or secrets in Finance tables. Use the repo's existing secret-reference/vault approach through owning integration contexts.
- Replace ADR-014 Billing, subscriptions, Stripe invoicing, metered usage posting, dunning, plan enforcement, or tenant lifecycle.
- Make Stripe, OpenClaw usage/cost, provider billing pages, or raw Gateway snapshots the Finance ledger source of truth.
- Build double-entry accounting, full general ledger close, accounts payable, accounts receivable, revenue recognition, payroll, or tax compliance beyond the lightweight expense ledger required here.
- Allow Finance `AgentEmployee` actions to become T2 send-on-behalf or T3 proactive money movement.
- Let browser clients, route handlers, finance agents, workflow runs, or mirrored runtime approvals bypass Opzava `Approval`, `AuthorizationPort`, tool policy, or audit.
- Expose raw provider payloads, unredacted invoices, hidden model reasoning, raw Gateway DTOs, or unredacted financial/PII data in ordinary UI states.
- Publish the PRD or create issue-tracker records.

## User Stories

1. As a finance owner, I want a Costs page for expense bookkeeping, so that all service costs are visible in one place.
2. As a finance owner, I want the Costs page to show the selected accounting period, so that every number is period-scoped.
3. As a finance owner, I want previous/next period controls, so that I can move across monthly ledger views.
4. As a finance owner, I want period summary cards for total spend, budget, remaining budget, and transaction count, so that month health is scannable.
5. As a finance owner, I want a budget meter with text and progress semantics, so that budget risk is clear without relying only on color.
6. As a finance owner, I want a chart of accounts view, so that spend can be grouped into Ads, Plans, Token plans, Tools, Hosting, Domains, Connected, Storage, and tenant-defined accounts.
7. As a finance owner, I want chart-of-accounts rows to show included vendors, amount, and percent of period, so that cost mix is understandable.
8. As a finance owner, I want account share bars to derive from ledger totals, so that visual summaries match exportable records.
9. As a finance owner, I want an Add cost source action, so that provider billing, manual expenses, and recurring costs can be connected or entered.
10. As a finance owner, I want Add cost source to be approval-aware, so that connecting a financial provider or changing a source policy is not a casual click.
11. As a finance owner, I want a transaction ledger with date, vendor, account, amount, status, and receipt, so that bookkeeping can be reviewed line by line.
12. As a finance owner, I want status filters for All, Paid, Pending, and Upcoming, so that current obligations are easy to separate.
13. As a finance owner, I want receipt links for booked transactions, so that evidence is available for audit and export.
14. As a finance owner, I want missing receipts to be visible, so that the Finance employee can draft collection tasks.
15. As a finance owner, I want ledger exports for accountants, so that monthly records can leave Opzava as a controlled artifact.
16. As an accountant, I want exported statements to include period, accounts, transactions, receipt refs, source refs, approvals, and adjustment notes, so that the export can be reconciled externally.
17. As a finance owner, I want ledger entries to distinguish Paid, Pending, Upcoming, Draft, NeedsReview, Reconciled, Disputed, Adjusted, Ignored, and FailedSource states, so that lifecycle is explicit.
18. As a finance owner, I want manual expenses to be entered without AI execution, so that ordinary bookkeeping remains straightforward.
19. As a finance owner, I want imported provider expenses to land as draft or pending ledger entries until source policy admits booking, so that noisy imports do not corrupt the ledger.
20. As a finance owner, I want AI/provider runtime usage from OpenClaw to appear as cost inputs, so that AI spend contributes to Finance reporting.
21. As a finance owner, I want OpenClaw usage/cost observations to be traceable to ADR-014 metering receipts where available, so that runtime cost and ledger cost can be reconciled.
22. As a finance owner, I want Stripe subscription invoices from Opzava billing to remain separate from the tenant's own company expense ledger, so that customer billing and internal expenses do not mix.
23. As a finance owner, I want provider invoices from vendors such as ads, model providers, hosting, domains, and tools to become ledger evidence, so that expenses are backed by documents.
24. As a finance owner, I want vendor aliases and account rules, so that "Anthropic - Claude Max" and similar provider names classify consistently.
25. As a finance owner, I want recurring cost rules, so that subscriptions and upcoming charges are visible before payment.
26. As a finance owner, I want budget caps per tenant, department, employee, workflow, account, and period where supplied by policy, so that runaway spend is caught early.
27. As a finance owner, I want cost anomalies to produce Finance review work, so that unexpected spend gets human attention.
28. As a Finance `AgentEmployee`, I want to draft ledger classifications, so that humans can approve or correct bookkeeping faster.
29. As a Finance `AgentEmployee`, I want to collect missing receipt suggestions, so that finance owners know which evidence is absent.
30. As a Finance `AgentEmployee`, I want to draft invoice review summaries, so that humans can approve payment-related decisions with context.
31. As a Finance `AgentEmployee`, I want to draft reconciliation findings, so that humans can review mismatches before ledger changes.
32. As a Finance `AgentEmployee`, I want all money actions to remain T1, so that I never spend, refund, pay, change a budget, or mutate a provider account without approval.
33. As a Finance `AgentEmployee`, I want hard tool-policy denials to stop blocked money tools, so that persona text cannot grant financial authority.
34. As a finance owner, I want Finance employees labeled T1 in roster and approval contexts, so that approval-first behavior is visible.
35. As a finance owner, I want every Finance-generated recommendation to show requested amount, currency, vendor, account, reason, evidence, and risk, so that I can decide safely.
36. As a finance owner, I want spend approvals to show the ledger effect before approval, so that approving the request does not hide downstream bookkeeping impact.
37. As a finance owner, I want approval requests for "Spend $200 on Meta Ads" and similar actions to use the global Security & Audit queue, so that money approvals are not missed.
38. As a finance owner, I want a Finance-specific approval detail view, so that I can inspect invoice, receipt, reconciliation, account, budget, and policy context before approving.
39. As a finance owner, I want Approve and Deny decisions to be idempotent, so that double-clicks or retries do not duplicate financial actions.
40. As a finance owner, I want stale approval actions to disable after amount, vendor, account, invoice, ledger entry, or policy changes, so that obsolete requests cannot be approved.
41. As a finance owner, I want high-risk money approvals to require a stronger confirmation than low-risk bookkeeping approval, so that dangerous decisions are deliberate.
42. As a finance owner, I want approvals to expire by policy, so that old spend proposals do not stay actionable forever.
43. As a finance owner, I want approval denial to preserve the draft, reason, policy result, and audit, so that rejected spend is explainable.
44. As a finance owner, I want approval after-edit to require a new approval when amount, vendor, account, recipient, payment method, or destination changes, so that approvals bind to exact risk.
45. As a finance owner, I want mirrored OpenClaw runtime approvals to be clearly labeled as runtime gates, so that I do not mistake them for business approval to spend.
46. As a finance owner, I want business approval conflict to resolve in favor of Opzava, so that runtime approval cannot override Finance denial.
47. As a finance owner, I want policy-denied money actions to appear in audit, so that attempted unsafe actions are visible.
48. As a finance owner, I want tool-policy decisions to include policy ref, tool, target, agent, tenant, approval ref, and result metadata, so that Finance audit is complete.
49. As a finance owner, I want event-triggered invoice workflows, so that incoming invoices and renewal notices create review work automatically.
50. As a finance owner, I want event-triggered reconciliation workflows, so that provider statements, usage/cost changes, and imported invoices can be matched to ledger entries.
51. As a finance owner, I want invoice and reconciliation workflows provisioned through standing orders, so that triggers are governed by ADR-012 workflow policy.
52. As a finance owner, I want Finance workflows to show trigger key, source, status, run steps, approvals, cost, and failure reason, so that automation is operable.
53. As a finance owner, I want duplicate invoice or reconciliation trigger keys to collapse, so that provider retries do not create duplicate ledger work.
54. As a finance owner, I want workflow publish to reject definitions that breach tenant, department, employee, plan, cost, concurrency, approval, or fan-out ceilings, so that runaway finance automation is prevented.
55. As a finance owner, I want recurring reconciliation to respect freshness SLA, so that stale statements are labeled instead of silently trusted.
56. As a finance owner, I want reconciliation differences to become reviewable variance items, so that mismatches are not hidden in a summary.
57. As a finance owner, I want adjustment entries to be additive, so that prior ledger facts remain auditable.
58. As a finance owner, I want source import failures to preserve retry state and safe error reason, so that financial evidence is not silently absent.
59. As a finance owner, I want GatewayUnavailable, CircuitOpen, ScopeDenied, ProtocolMismatch, SourceUnavailable, StaleInputs, RateLimited, and BlockedByPolicy states to render as normal Finance workflow states, so that failure modes are actionable.
60. As a finance owner, I want Add cost source to support connected provider status where available, so that source health is visible.
61. As a finance owner, I want cost source credentials handled only through the owning secrets/config mechanism, so that no financial secrets are hardcoded or exposed.
62. As a finance owner, I want source imports to store opaque external refs and payload hashes, so that records can be reconciled without leaking provider internals.
63. As a finance owner, I want sensitive receipt and invoice artifacts to use object refs and access checks, so that documents are not broadly readable.
64. As a finance owner, I want finance search/filtering by vendor, account, status, amount range, source, receipt state, approval state, and reconciliation state, so that month-end review is efficient.
65. As a finance owner, I want ledger rows to link to source event, workflow run, approval, receipt, and audit where available, so that evidence is one click away.
66. As a finance owner, I want monthly budget warnings and over-budget states to feed notifications and Activity, so that Finance review does not depend on opening Costs.
67. As a finance owner, I want over-budget spend proposals to require approval even when the source normally auto-books, so that caps remain meaningful.
68. As a finance owner, I want low-risk bookkeeping auto-approvals to be limited to non-money mutations, so that auto-approval never spends money.
69. As a finance owner, I want invoice payment proposals to stay draft-only, so that Opzava does not perform payment execution in this PRD.
70. As a finance owner, I want refund proposals to stay draft-only unless a future approved integration explicitly supports refunds, so that customer money movement is not accidental.
71. As a finance owner, I want provider plan-change proposals to require approval and tool-policy support before execution, so that subscription changes are controlled.
72. As a finance owner, I want ad budget shift recommendations to create governed proposals, so that report recommendations cannot mutate spend silently.
73. As an auditor, I want Finance audit trail rows to distinguish human, AI employee, system, workflow, and policy actors, so that accountability is clear.
74. As an auditor, I want export audit log to include Finance approvals, denials, policy blocks, ledger mutations, imports, reconciliations, and source changes, so that control-plane history is complete.
75. As an auditor, I want immutable audit retained by policy and redacted for ordinary users, so that sensitive financial activity remains reviewable.
76. As a security reviewer, I want every Finance command authorized server-side, so that browser-supplied ids, amounts, source refs, approval refs, and runtime refs are hints only.
77. As a security reviewer, I want role revocation to remove access to Costs, ledger, receipts, invoices, approvals, exports, and live workflow state on reload/reconnect, so that stale sessions fail closed.
78. As a screen-reader user, I want summary cards, progress meters, account rows, transaction filters, approval rows, decision buttons, and audit tables to expose semantic labels, so that Finance work is usable without visual scanning.
79. As a keyboard user, I want period controls, tabs, filters, ledger rows, receipt links, approval decisions, dialogs, exports, and source setup to work without a mouse, so that month-end review is efficient.
80. As a mobile user, I want ledger summaries, approval rows, and transaction cards to collapse without hiding amount, vendor, risk, status, or decision actions, so that urgent approvals are possible on narrow screens.
81. As a product operator, I want every Finance screen to render loading, empty, no-match, forbidden, stale, offline/reconnecting, validation error, approval conflict, Gateway unavailable, source unavailable, and retry states, so that async reality is normal UX.
82. As a developer, I want Finance behavior tested through application ports, command handlers, projections, route/server-action seams, and UI composition, so that money-risk behavior is protected without coupling to OpenClaw internals.

## UX walkthrough mapping each named mockup screen

| Mockup | Required UX mapping |
| --- | --- |
| `costs.html` | Finance Costs page with full-shell navigation, page title `Costs`, subtitle `Expense bookkeeping · all service costs`, accounting period controls, Export action, one primary Add cost source action, period summary cards, budget meter, By account chart of accounts, extensible add-source row, Transactions ledger, status tabs All/Paid/Pending/Upcoming, receipt links, and accountant export hint. The page must read from Finance-owned ledger and chart-of-accounts read models enriched by OpenClaw usage/cost and provider source projections. It must not be a direct OpenClaw usage dashboard or ADR-014 billing screen. |
| `security-audit.html` | Global Security & Audit page for approval summary, Pending approvals, Users & roles, and Audit trail. Finance money approvals must appear in Pending approvals with amount-bearing action text, Finance `AgentEmployee` requester, risk level, age, and Approve/Deny actions. Rows such as `Spend $200 on Meta Ads` map to Opzava business `Approval` rows with Finance target refs, not OpenClaw runtime approvals. Audit trail rows must include Finance requests, approvals, denials, policy blocks, ledger changes, source changes, exports, and workflow events with actor attribution. |

Net-new screens to design:

- Finance approval detail screen for amount, currency, vendor, account, source evidence, invoice/receipt refs, budget impact, ledger impact, requested-by Finance `AgentEmployee`, approver policy, tool-policy decision, mirrored runtime refs, and audit history.
- Add cost source flow for provider/manual/recurring source type, source policy, account mapping, import cadence, receipt handling, secret-reference setup, dry-run preview, and approval requirement.
- Cost source detail/settings screen for health, last sync, source cursors, mapping rules, import failures, drift, pause/resume, and audit.
- Ledger transaction detail screen for source refs, receipt/invoice artifact, classification history, approval refs, reconciliation state, adjustment entries, comments, and audit.
- Receipt and invoice inbox for missing receipts, uploaded invoices, provider statements, AI extraction draft, match candidates, and review state.
- Reconciliation workbench for statement import, match/unmatched/variance lanes, duplicate detection, proposed adjustments, stale inputs, and approve-book decisions.
- Finance workflow settings screen for invoice/reconcile standing orders, triggers, target Finance employee, approval policy, idempotency key shape, cost budget, concurrency, timeout, retry, failure destination, and freshness SLA.
- Finance workflow run detail screen for trigger event, TaskFlow/standing-order steps, agent draft, approvals, policy gates, ledger effects, retries, failures, and artifact refs.
- Budget and spend-policy screen for period budgets, account caps, employee/workflow cost caps, overage policy, approver policy, escalation, and audit.
- Finance export history screen for generated accountant statements, period hash, source cursors, generated-by refs, download authorization, and retention state.

## Functional requirements

### Finance employee posture and money-risk policy

- Finance must instantiate at least one Finance department `AgentEmployee` under AI Workforce with autonomy tier T1 by default.
- Finance `AgentEmployee` records must be visible in roster/detail surfaces as Finance, T1, approval-first, with channel/tool bindings that do not imply money authority.
- Finance employees may draft classifications, summaries, recommendations, invoice reviews, reconciliation findings, missing receipt tasks, report narratives, and approval requests.
- Finance employees must not autonomously execute money actions, including spend, refund, payment, provider plan changes, budget changes, bank/tax changes, external financial mutations, or financial data exports.
- Every money action must require an Opzava business `Approval` in `Approved` state before any command path may proceed.
- Approval targets must bind to exact money-risk payloads: amount, currency, vendor/recipient, source, account, ledger target, external target ref where applicable, policy ref, payload hash, and expiry.
- Editing amount, vendor/recipient, destination, account, ledger target, external target, payment method, invoice ref, or policy class must invalidate the prior approval and require a new one.
- Low-risk auto-approval may be used only for non-money bookkeeping actions explicitly admitted by policy, such as creating a draft ledger row from an already-approved source import.
- Finance policy must classify risk at least as Low, Medium, High, and Blocked using amount, source, destination, action type, budget impact, account, tool class, external mutation, and sensitivity.
- High-risk or blocked Finance actions must fail closed before Gateway tool invocation and must write audit.
- Tool policy must deny money-moving or financial-mutation tools by default for standard Finance employees unless the broker command includes a current matching Opzava approval and the tool wrapper enforces the approved payload.
- Persona files, SOUL hard-blocks, standing-order text, and chat instructions may describe Finance behavior, but they must not authorize side effects.

### Expense ledger, chart of accounts, and transactions

- Finance must own a tenant-scoped `ExpenseLedger` or equivalent period ledger root for product read models and commands.
- Finance must own `ChartAccount`, `Vendor`, `CostSource`, `LedgerEntry`, `ReceiptArtifactRef`, `InvoiceArtifactRef`, `LedgerAdjustment`, `ReconciliationItem`, `ExportBatch`, and Finance audit projections.
- Ledger periods must be stable by tenant, period start/end, timezone policy, and currency.
- Ledger entries must store tenant, period, vendor, account, amount, currency, status, source type, source ref, receipt/invoice refs, approval refs, reconciliation state, payload hash, idempotency key, and audit metadata.
- Chart account names from the mockup must be supported by default seed policy: Ads, Plans, Token plans, Tools, Hosting, Domains, Connected, and Storage.
- Tenants must be able to define additional chart accounts where authorized.
- Vendor aliases and account classification rules must be tenant-scoped and auditable.
- Manual entries, provider imports, OpenClaw usage/cost-derived entries, invoice-derived entries, recurring-source projections, and adjustment entries must all use the same ledger entry lifecycle.
- Ledger entry statuses must support at least Draft, Paid, Pending, Upcoming, NeedsReview, Reconciled, Disputed, Adjusted, Ignored, FailedSource, and Superseded.
- Adjustments must be additive and traceable; Finance must not silently overwrite accepted ledger facts.
- Duplicate imports must collapse by source idempotency key or payload hash according to source policy.
- Conflicting imports for the same period/vendor/amount/source must create reconciliation items, not destructive overwrites.
- Receipts and invoices must be object refs with authorization checks, not raw files embedded in ledger rows.
- Export batches must record period, ledger snapshot hash, included entries, receipt refs, source cursors, generated-by actor/run refs, created time, and audit.
- The Costs page must derive summary cards, budget meter, account shares, transaction counts, and status tabs from Finance read models.
- The Costs page must not read raw OpenClaw storage or Stripe provider state directly.

### Cost sources and provider imports

- `CostSource` must support manual, recurring, provider-billing, OpenClaw usage/cost, Opzava billing projection, uploaded statement, uploaded invoice, and connected-service classes.
- Cost source setup must use existing secrets/config mechanisms for credentials; Finance rows may store only opaque secret refs and source metadata.
- Source imports must record source cursor, source timestamp, payload hash, adapter version, idempotency key, import status, and safe error reason.
- Source imports may create draft ledger entries, receipt/invoice artifacts, reconciliation items, or workflow triggers depending on source policy.
- OpenClaw `usage.cost`, `usage.status`, and `sessions.usage*` inputs may enrich Finance cost views, but OpenClaw remains runtime source and Finance records accepted ledger facts.
- ADR-014 `MeterEvent`, `UsageMeter`, and `Invoice` projections may be referenced as inputs or evidence, but Finance must not mutate billing truth.
- Provider invoice import must preserve original artifact refs and extracted fields separately; AI extraction is a draft until accepted by policy or human review.
- Source health must include last sync, next sync where applicable, failure state, stale cursor, source paused, missing secret ref, and policy blocked.
- Source import failure must not hide prior ledger entries; it must surface stale or source-unavailable state.

### Finance workflows and standing orders

- Finance invoice and reconciliation automation must use ADR-012 `Workflow`/`Playbook` definitions with `StandingOrderBlock`, optional `CronSpec`, and optional `TaskFlowSpec` mechanisms.
- `FinanceEventWorkflow` definitions must target a Finance `AgentEmployee`, T1 approval policy, trigger policy, idempotency key shape, cost budget, max concurrent runs, timeout, retry cap, failure destination, and freshness SLA.
- Event triggers must include at least provider invoice received, receipt uploaded, statement uploaded, recurring charge detected, usage/cost threshold crossed, budget threshold crossed, renewal upcoming, missing receipt aged, invoice due soon, reconciliation window opened, and import conflict detected.
- Standing-order text may authorize draft work only; money actions remain blocked until Opzava approval.
- Workflow publish must run through the provisioning path and produce provision receipts for rendered standing-order blocks and runtime artifacts.
- Workflow publish must reject definitions that breach tenant, department, employee, plan, budget, concurrency, fan-out, or approval ceilings.
- Workflow runs must project back into Finance and Department Workflow read models as `WorkflowRun` and `RunStep` summaries.
- Workflow run states must include Drafted, Queued, Running, WaitingForApproval, BlockedByPolicy, RateLimited, StaleInputs, GatewayUnavailable, CircuitOpen, SourceUnavailable, Failed, Canceled, and Completed.
- Duplicate invoice/reconciliation trigger keys must collapse into one active or completed run where policy requires uniqueness.
- Reconciliation runs must match source entries to ledger entries, identify missing receipts, duplicate charges, vendor/account mismatches, amount variances, pending/upcoming transitions, and stale sources.
- Reconciliation findings must be reviewable before ledger mutation unless policy explicitly permits low-risk non-money booking.
- Finance workflow events must feed Activity, notifications, approval inbox, Costs read models, and audit.

### Money-risk approval UX and audit

- Money-risk approvals must be represented by Opzava `Approval` rows with `Pending`, `Approved`, `Rejected`, and `Expired` states.
- Finance approval rows must record requester, optional `requesterAgentId`, approver policy, policy ref, payload ref/hash, target aggregate refs, amount/currency, risk class, expiry/SLA, mirrored OpenClaw refs where applicable, decision metadata, and audit.
- `security-audit.html` Pending approvals must include Finance approvals with clear amount/vendor/action labels, requester, risk, age, and Approve/Deny actions.
- Finance approval detail must show source evidence, invoice/receipt refs, ledger impact, budget impact, account mapping, vendor history, workflow run refs, policy result, tool-policy decision, and downstream command preview.
- Approve must re-check authorization, current approval state, payload hash, target currentness, budget/plan policy, source freshness, tool policy, and idempotency before succeeding.
- Deny must preserve reason, actor, target refs, and audit, and must prevent the matching command from proceeding.
- Expired approvals must block execution and require a new request.
- Mirrored OpenClaw runtime approvals must be labeled as runtime exec/plugin gates, kept distinct from Finance business approvals, and reconciled by mirrored refs.
- If a mirrored runtime approval and Finance business approval conflict, execution must fail closed and the business conflict resolves to Opzava.
- Tool-invocation audit must record actor, agent, tenant, workflow/run refs, tool, policy ref, approval ref, target, payload classification, decision, result metadata, and failure reason.
- Finance audit trail must include human decisions, AI drafts, system imports, workflow events, policy blocks, source syncs, ledger changes, reconciliation decisions, exports, and role/security events that affect Finance access.
- Export audit log must respect authorization, redaction, and retention policy.

### Security, authorization, and redaction

- Every Finance read and command must run through tenant-scoped authorization and resource checks.
- Browser-supplied ids, runtime refs, source refs, approval refs, amount, currency, and vendor fields are hints only; server commands must reload authoritative state.
- Finance tables must be tenant-scoped and compatible with the repo's RLS/tenant-context posture.
- Financial documents must be redacted or access-controlled in ordinary lists and notifications.
- Push notifications and Activity rows must avoid sensitive payloads and require fetch-on-open for details.
- Role revocation must remove access to Finance screens, ledger entries, receipts, invoices, approval detail, exports, and live workflow state on reload/reconnect.
- Source adapters and tool wrappers must redact secrets and high-risk payloads before storing tool results or injecting output into model context.
- Finance workflows must use per-agent egress/domain allowlists where provider reads are admitted.
- Prompt-injected provider invoices, receipts, web pages, or channel messages must not grant authority to spend, pay, refund, export, or change provider settings.

### Accessibility and responsive behavior

- Summary cards, budget meter, account share rows, transaction filters, approval rows, decision buttons, audit trail, and exports must have semantic labels.
- Approval decisions must remain keyboard-accessible and must expose pending, success, denied, stale, expired, and error states.
- Mobile transaction cards must preserve date, vendor, account, amount, status, receipt state, and approval/reconciliation indicators.
- Color must not be the only indicator for budget status, risk, ledger status, or approval state.
- Tables must have captions or equivalent accessible labels consistent with the mockups.

## Data and API touchpoints

| Touchpoint | Owning bounded context | Product data / behavior | Ports |
| --- | --- | --- | --- |
| Costs page summary | Finance | Period total, budget, remaining budget, transaction count, account shares, budget meter, source freshness | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort` |
| Expense ledger | Finance | `ExpenseLedger`, `LedgerEntry`, statuses, source refs, receipt/invoice refs, account/vendor refs, adjustments, audit | `AuthorizationPort`, `EventBusPort`, `ObjectStorePort` |
| Chart of accounts | Finance | `ChartAccount`, tenant defaults, custom accounts, account mapping rules, account totals | `AuthorizationPort`, `EventBusPort` |
| Vendors and aliases | Finance | `Vendor`, aliases, classification hints, vendor history, duplicate handling | `AuthorizationPort`, `EventBusPort` |
| Cost sources | Finance with External Channels/Platform integration | Provider/manual/recurring/source setup, source health, source cursor, import policy, secret refs | `AuthorizationPort`, `SecretsVaultPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Receipt and invoice artifacts | Finance with Object Store | Uploaded/provider-derived document refs, extracted fields, safe previews, authorization, retention | `ObjectStorePort`, `AuthorizationPort`, `EventBusPort` |
| OpenClaw usage/cost input | Runtime-Control/Gateway Broker with Finance projection | `usage.cost`, `usage.status`, `sessions.usage*`, runtime cost snapshots, opaque runtime refs, source cursors | `OpenClawGatewayPort`, `EventBusPort` |
| Billing usage and invoice evidence | Finance and Billing | ADR-014 `MeterEvent`, `UsageMeter`, `Invoice` projections as evidence/input, no Finance mutation of Billing truth | `BillingPort`, `AuthorizationPort`, `EventBusPort` |
| Finance workflow definitions | Department Workflows | `Workflow`, `Mechanism`, standing-order block, trigger policy, approval policy, budget, concurrency, idempotency, SLA | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Workflow provisioning | Tenant Provisioning/Platform-Ops with Department Workflows | Rendered standing orders, provision receipts, drift state, admin/provisioning action refs | `OpenClawGatewayPort`, `SecretsVaultPort`, `EventBusPort` |
| Finance workflow runs | Department Workflows with Finance read models | `WorkflowRun`, `RunStep`, trigger refs, invoice/reconcile steps, approvals, failures, runtime refs | `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort` |
| Finance `AgentEmployee` | AI Workforce | Finance employee identity, T1 tier, tool policy ref, standing-order refs, status, assignment/runtime projections | `AuthorizationPort`, `OpenClawGatewayPort`, `EventBusPort` |
| Finance business approvals | Department Workflows / Finance | Opzava `Approval`, money-risk payload, approver policy, decision state, expiry, audit, target refs | `AuthorizationPort`, `EventBusPort`, `RealtimeTransportPort`, `PushNotificationPort` |
| Mirrored runtime approvals | Runtime-Control/Gateway Broker | OpenClaw exec/plugin approval refs, prompt state, runtime decision reconciliation, mirrored inbox rows | `OpenClawGatewayPort`, `EventBusPort`, `RealtimeTransportPort` |
| Tool-policy gate audit | Runtime-Control / Gateway Broker with Finance audit projection | Tool decision, policy ref, approval ref, payload classification, result metadata, policy-denied money actions | `OpenClawGatewayPort`, `EventBusPort` |
| Notifications and Activity | Notifications/Internal Collaboration | Approval requests, missing receipts, budget warnings, reconciliation findings, workflow failures, export ready | `EventBusPort`, `RealtimeTransportPort`, `PushNotificationPort` |
| Finance exports | Finance with Object Store | Accountant export batches, period snapshot hash, source cursors, receipt refs, generated file refs, audit | `ObjectStorePort`, `AuthorizationPort`, `EventBusPort` |

## OpenClaw-parity notes

| Capability | Classification | OpenClaw-native harnessed | Opzava-owned |
| --- | --- | --- | --- |
| Finance employee runtime | Hybrid | Delegate agent sessions, runs, streaming, task state, standing-order execution | `AgentEmployee` identity, Finance department, T1 policy, assignments, tool-policy refs, user-visible lifecycle |
| Standing orders | Hybrid | OpenClaw `AGENTS.md` standing-order blocks and runtime matching | Workflow definition, approval policy, provision receipt, trigger semantics, drift handling |
| Cron/TaskFlow for finance work | Hybrid | Cron firings, TaskFlow steps, task-ledger/runtime state | Finance workflow policy, invoice/reconcile lifecycle, run projections, idempotency, budget/concurrency limits |
| Usage/cost observations | Hybrid | `usage.cost`, `usage.status`, `sessions.usage*` snapshots and runtime refs | Finance accepted ledger entries, cost-source projections, period summaries, reconciliation against expenses |
| Business approvals | Opzava-owned with mirrored runtime prompts | `operator.approvals` only for exec/plugin gates | Opzava `Approval`, money-risk decision state, approver policy, payload hash, ledger/action target, audit |
| Tool policy | Hybrid | Gateway tool-policy deny/allow decisions and runtime enforcement | Money-risk policy, approval matching, tenant-visible audit, UI blocked states |
| Ledger and chart of accounts | Opzava-owned | None, except runtime cost inputs may inform entries | Expense ledger, accounts, vendors, receipts, statuses, adjustments, exports, reconciliation |
| Provider documents and receipts | Hybrid | Runtime/provider access may be brokered where an integration exists | Document refs, extracted fields, review state, ledger evidence, redaction, retention |
| Accountant export | Opzava-owned | None | Export batch, snapshot hash, object refs, authorization, audit |
| Security & Audit approval queue | Hybrid | Mirrored runtime approval prompts and runtime/tool events | Unified approval rows, audit trail, human decisions, role/security context |

## Acceptance criteria

- `costs.html` maps to a Finance-owned Costs page with period controls, summary cards, budget meter, chart of accounts, transaction ledger, status filters, receipt state, Export, and Add cost source.
- Costs summary totals, account shares, transaction counts, and budget meter are derived from Finance ledger/read-model data, not direct Gateway or Stripe calls.
- The default chart of accounts supports Ads, Plans, Token plans, Tools, Hosting, Domains, Connected, and Storage, with tenant-defined additions.
- Ledger entries support manual, recurring, provider, OpenClaw usage/cost, invoice, statement, and adjustment sources with idempotent import behavior.
- Receipts and invoices are stored and rendered as authorized artifact refs, never embedded secrets or raw provider credentials.
- Finance `AgentEmployee` is T1 by default and cannot execute any money action without a matching Opzava business approval.
- Money actions include spend, refund, payment, provider plan change, budget change, bank/tax mutation, external financial mutation, and financial export where policy marks it sensitive.
- Every money approval binds to exact amount, currency, vendor/recipient, target, account, payload hash, policy ref, and expiry.
- Approve, Deny, and Expire are idempotent and write audit; stale or changed money payloads cannot be approved.
- `security-audit.html` Pending approvals can render Finance money approvals with amount/vendor/action, requester, risk, age, and decision actions.
- A Finance approval detail screen is specified as net-new design and required before implementation can ship high-risk money approvals.
- Tool policy denies Finance money tools unless a current matching business approval is present and the command/tool wrapper verifies the payload.
- Policy-denied tool calls and blocked money actions write tenant-visible/admin-visible audit rows as appropriate.
- OpenClaw `operator.approvals` remain runtime approval truth only; they never approve Finance business decisions.
- Invoice and reconciliation work is defined as ADR-012 Finance workflows with standing-order mechanisms and T1 approval policy.
- Workflow publish rejects definitions that breach tenant, department, employee, plan, budget, concurrency, fan-out, or approval limits.
- Duplicate invoice and reconciliation trigger keys collapse rather than creating duplicate ledger work.
- Reconciliation findings are reviewable, adjustments are additive, and accepted ledger facts are not overwritten silently.
- GatewayUnavailable, CircuitOpen, ScopeDenied, ProtocolMismatch, SourceUnavailable, StaleInputs, RateLimited, and BlockedByPolicy render as first-class UI states.
- Finance exports include period, snapshot hash, ledger entries, account totals, receipts/invoices, source cursors, approval refs, and audit refs.
- Every Finance screen has loading, empty, no-match, forbidden, stale, offline/reconnecting, validation error, conflict, and retry states.
- Role revocation removes access to Finance data, receipts/invoices, approvals, exports, and live workflow state on reload/reconnect.
- No secrets, API keys, provider tokens, payment credentials, card numbers, bank credentials, or tax identifiers are stored directly in source or domain rows.

## Testing decisions

- The highest-value seam is the Finance application service that admits ledger commands, source imports, approval decisions, workflow triggers, reconciliation decisions, and exports.
- Tests should verify external behavior and invariants, not OpenClaw internals, provider SDK internals, or rendered implementation details.
- Ledger tests should cover manual entry, provider import, OpenClaw usage/cost-derived entry, recurring upcoming entry, duplicate import collapse, conflicting import, adjustment additivity, receipt refs, account totals, period totals, and export snapshot hashes.
- Cost-source tests should cover source setup authorization, secret-ref handling, source cursor updates, stale source state, import failure state, source pause/resume, and no-secret persistence.
- Approval tests should cover T1 Finance employee behavior, approve, deny, expire, stale payload, changed amount/vendor/account, duplicate decision, high-risk confirmation requirement, business/runtime approval separation, and policy-denied execution.
- Tool-policy tests should cover deny-by-default for money tools, approval-ref matching, payload hash mismatch, missing approval, expired approval, denied approval, and audit for blocked tool invocation.
- Workflow tests should cover standing-order trigger admission, invoice received, receipt uploaded, statement uploaded, usage/cost threshold crossed, duplicate trigger collapse, waiting for approval, blocked by policy, rate limited, source unavailable, and completed reconciliation.
- Reconciliation tests should cover exact match, amount variance, duplicate charge, missing receipt, unmatched statement row, stale source, proposed adjustment, denied adjustment, and accepted additive adjustment.
- Projection tests should cover Costs summary cards, budget meter, account shares, transaction status tabs, approval queue rows, audit trail rows, workflow run summaries, notification/activity events, and reconnect reconciliation.
- Route/server-action tests should cover authorization, tenant scope, forbidden access, stale client refs, idempotency keys, validation errors, role revocation, and redacted responses.
- UI tests should cover period controls, status tabs, ledger row accessibility, receipt link states, Add cost source entry point, Finance approval row actions, approval detail decision states, export pending/ready/error, and mobile transaction card preservation.
- Accessibility tests should cover semantic table captions/labels, keyboard decision flow, focus management after validation errors, progress meter labels, risk labels that do not rely only on color, and screen-reader names for Approve/Deny actions.
- Prior art should follow PRD-006 for agent roster/automation seams, PRD-009 for approval/report seams, and PRD-010 for sensitive customer workflow authorization and projection testing.

## Dependencies

- ADR-005 for tool-policy-first security, approval rows, hard deny posture, data-flow controls, and audit expectations.
- ADR-012 for Department Workflow, `Workflow`, `Mechanism`, standing orders, `WorkflowRun`, `RunStep`, `RunLimiter`, Opzava `Approval`, and Finance T1 workflow policy.
- ADR-014 for Billing, `BillingPort`, `MeterEvent`, `UsageMeter`, `Invoice`, plan enforcement, usage/cost polling, and entitlement coupling.
- AI Workforce context for Finance `AgentEmployee`, Department, Persona, autonomy tier T1, tool policy refs, standing-order refs, assignments, and runtime projections.
- Runtime-Control / `gateway-broker` for OpenClaw ACL access, usage/cost snapshots, sessions/runs, runtime approvals, tool-policy signals, and event ingestion.
- Finance and Billing context for plan/usage/invoice evidence and quota/budget ceilings without merging customer billing truth into expense ledger truth.
- Department Workflow context for Finance invoice/reconcile workflow definition, provisioning, run projection, approval, budget, concurrency, idempotency, and drift handling.
- Object Store and Secrets/Vault ports for receipt/invoice/export artifacts and credential references.
- Identity & Access / AuthorizationPort for tenant/org/project/resource authorization, role revocation, and audit actor identity.
- Notifications, Activity, Realtime, and Push ports for approval prompts, budget warnings, missing receipt tasks, workflow failures, and export-ready events.
- Net-new UX design for Finance approval detail, Add cost source, source detail/settings, ledger transaction detail, receipt/invoice inbox, reconciliation workbench, Finance workflow settings/run detail, budget/spend policy, and export history.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).

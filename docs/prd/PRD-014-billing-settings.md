# PRD-014: Billing settings, plan limits, usage budgets, and onboarding completion

## Problem

Opzava needs a complete tenant-facing billing and entitlement surface before paid tenants can safely operate AI employees, channels, local tools, and per-tenant Gateway runtime.

Without this PRD, the billing slice can drift into unsafe or confusing product behavior:

- Owners may see a Stripe subscription but not understand which Opzava capabilities the plan actually allows.
- Plan limits for agent count, seats, connected channels, autonomy tiers, provider/model availability, and cost budgets could be enforced inconsistently across Settings, Connections, workflow publish, broker admission, and runtime dispatch.
- Usage and cost views could read directly from OpenClaw runtime snapshots instead of durable Opzava metering projections derived from `usage.cost`.
- Budget controls could appear as advisory UI only, while background workers, channel events, cron, TaskFlow, and lazy Gateway starts continue creating spend.
- Dunning and suspension could be invisible until runtime work fails, or worse, could leave a tenant Gateway running after billing entitlement is gone.
- First-run onboarding could mark a workspace ready before subscription, plan entitlement, tenant provisioning, default agents, and channel connection prerequisites are complete.
- Finance expense-ledger concepts from PRD-011 could be confused with Opzava's own billing, invoice, usage, and subscription source of truth.

The solution is a Billing settings and onboarding-completion product slice owned by Finance and Billing, with Stripe isolated behind `BillingPort`, plan and quota decisions exposed in Opzava language, `usage.cost` converted into durable metering/read models, and tenant dunning/suspension state surfaced wherever it affects access. This PRD applies ADR-014 and ADR-002, depends on PRD-001 and PRD-013, and references the existing mockups without restating architecture.

## Goals and Non-goals

### Goals

- Ship the `settings.html` Billing tab as the primary owner/admin surface for subscription summary, billing contact, budget cap, pause-at-cap policy, receipt delivery, recent invoices, and Manage plan.
- Route Manage plan, payment method updates, cancellation, renewal, tax/address, invoice download, and plan changes through Stripe Billing Portal or provider-specific checkout sessions behind `BillingPort`.
- Show the tenant's current plan, renewal/trial/dunning state, entitlement status, seats used/allowed, monthly spend, budget used, and invoice history in Opzava terms.
- Define plan limits for seats, agent employees, connected channels, provider/model feature access, local/operator tools where applicable, autonomy tiers, workflow mechanisms, cost budgets, and runtime starts.
- Enforce plan and budget limits consistently through BFF quota middleware and worker/admission paths before creating or expanding billable/runtime work.
- Treat budget controls as product policy: alert thresholds, workspace cap, pause new runs at cap, owner approval for override where plan permits, and hard 402 failures where policy requires.
- Ship usage/cost dashboards from Finance and Billing read models derived from OpenClaw `usage.cost`, not direct browser reads or raw Gateway payloads.
- Extend the Costs experience from `costs.html` with a billing usage mode or adjacent usage dashboard for metered Opzava usage, while preserving PRD-011's Finance expense ledger ownership.
- Surface dunning, payment failure, trial expired, canceled entitlement, suspended, grace period, and deprovisioning-warning states to tenant owners and affected users.
- Block Gateway start, broker command admission, channel sends, agent dispatch, workflow publish, and new runtime provisioning while the tenant is suspended.
- Support onboarding completion after PRD-001 first workspace setup: subscription/plan entitlement, provisioning status, default departments/agents, and channel connect wizard readiness.
- Define data/API touchpoints by owning bounded context and ports.
- Define OpenClaw-parity boundaries: native harnessed capabilities versus Opzava-owned billing, budget, and onboarding authority.
- Define acceptance and testing decisions for billing settings, plan enforcement, usage metering, suspension, and onboarding completion.

### Non-goals

- Build Stripe itself, replace Stripe invoices, or expose Stripe object ids as product concepts.
- Store card numbers, bank details, tax credentials, provider secrets, Gateway tokens, channel credentials, or raw payment secrets in Opzava product tables.
- Build the PRD-011 Finance expense ledger, chart of accounts, receipt inbox, reconciliation workbench, or accountant export as billing truth.
- Build PRD-013 connection details or channel/provider setup flows beyond billing entitlement checks, plan-limit messaging, and billing-state gating.
- Build PRD-001 authentication, invitation, MFA, or first owner setup beyond consuming the onboarding/provisioning completion states.
- Let Stripe become the source of truth for Opzava product entitlements, tenant lifecycle, plan limits, or Gateway runtime state.
- Allow UI-only enforcement of quotas, budgets, or suspension.
- Redesign ADR-002 tenant lifecycle, ADR-014 billing/metering decisions, or ADR-012 workflow budget enforcement.
- Publish this PRD, create issue-tracker records, call GitHub, or run build/test/lint commands.

## User Stories

1. As an owner, I want Billing settings to show my current subscription plan, so that I know which commercial tier the workspace is using.
2. As an owner, I want Billing settings to show entitlement status, so that I know whether Opzava can run agents and Gateway work.
3. As an owner, I want Billing settings to show renewal date, trial end, cancellation date, or grace-period end, so that billing deadlines are explicit.
4. As an owner, I want Manage plan to open the billing portal, so that I can update payment, invoices, plan, or cancellation without Opzava handling raw card data.
5. As an owner, I want plan changes to return to Opzava with updated entitlement state, so that product access changes after provider confirmation.
6. As an owner, I want payment method changes to happen through Stripe-hosted flows, so that card and bank details never enter Opzava forms.
7. As an owner, I want invoice links to open or download invoice PDFs, so that billing records are available for accounting.
8. As an owner, I want recent invoices to show period, amount, status, and failure/dunning state, so that I can reconcile account status quickly.
9. As a billing admin, I want a billing email field, so that invoices, receipts, overage notices, dunning notices, and budget alerts go to the right mailbox.
10. As a billing admin, I want billing email changes audited, so that finance ownership changes are reconstructable.
11. As a billing admin, I want monthly spend and budget used shown in Billing settings, so that I can see current billing-period risk at a glance.
12. As a billing admin, I want seat usage shown as used/allowed, so that I know when team growth will hit the plan limit.
13. As a billing admin, I want agent employee usage shown as used/allowed, so that I know whether I can add another AI employee.
14. As a billing admin, I want connected-channel usage shown as used/allowed, so that I can plan Slack, WhatsApp, Gmail, and future channel connections.
15. As a billing admin, I want autonomy-tier allowances shown by plan, so that I know which agents may be T1, T2, or T3.
16. As a billing admin, I want provider/model feature availability shown in plan language, so that I understand why a model or provider is unavailable.
17. As a billing admin, I want workflow mechanism limits shown, so that I know whether standing orders, cron, TaskFlow, or webhooks are allowed on the plan.
18. As a billing admin, I want local/operator tool limits shown where applicable, so that terminal and desktop connections follow plan policy.
19. As a billing admin, I want a workspace monthly budget cap, so that automation spend has an explicit ceiling.
20. As a billing admin, I want alert thresholds such as 50%, 75%, and 90%, so that owners hear about budget risk before a hard stop.
21. As a billing admin, I want budget alert delivery preferences, so that warnings can reach email, in-app, Slack, or notification surfaces supported by the tenant.
22. As a billing admin, I want "Pause new runs at budget cap", so that existing runs may finish while new agent work waits.
23. As a billing admin, I want cap behavior to explain whether it is hard stop, approval override, or paid overage, so that users know what will happen at the limit.
24. As a billing admin, I want override approvals to require owner/admin authority, so that a member cannot increase spend casually.
25. As an owner, I want overage responses to identify the exceeded Opzava limit, so that I do not see Stripe internals or raw quota codes.
26. As an owner, I want plan-limit interstitials to offer Manage plan or request approval where allowed, so that the next action is obvious.
27. As an admin adding a user, I want seat limits checked before invite acceptance or membership activation, so that over-limit users do not get partial access.
28. As an admin inviting users during setup, I want optional invites to respect plan seat limits, so that setup does not create unusable invites.
29. As an admin creating an agent employee, I want agent count limits checked before provisioning, so that the Gateway does not receive over-limit agents.
30. As an admin changing autonomy tier, I want tier limits checked before save, so that T2/T3 authority cannot exceed plan policy.
31. As an admin connecting a channel, I want channel limits checked before OAuth or provisioning begins, so that credentials are not collected for a blocked connection.
32. As an admin connecting a local tool, I want tool limits checked before pairing, so that setup tokens are not created for a blocked client.
33. As an admin publishing a workflow, I want plan and budget limits checked before publish, so that cron, TaskFlow, fan-out, and standing-order spend are governed.
34. As an operator starting agent work, I want runtime admission to check entitlement, budget, and lifecycle, so that background work cannot bypass Billing settings.
35. As an AI Workforce manager, I want per-agent cost budgets, so that one employee cannot consume the whole workspace budget.
36. As a department manager, I want department cost budgets, so that Marketing, Support, Finance, and CRM can be governed separately.
37. As a workflow owner, I want workflow and mechanism budgets, so that a single automation cannot run away.
38. As a support manager, I want channel-specific budget and rate limits where policy allows, so that customer messaging spend is bounded.
39. As a billing admin, I want hourly, daily, and billing-period spend ceilings, so that runaway automation can be stopped before invoice close.
40. As a billing admin, I want cost budget status to be based on metered usage projections, so that enforcement uses durable accepted events.
41. As a billing admin, I want usage dashboards to show current billing-period cost by agent, department, channel, workflow, mechanism, provider/model, and feature, so that spend drivers are visible.
42. As a billing admin, I want usage dashboards to show time windows and freshness, so that stale metering does not look current.
43. As a billing admin, I want usage dashboards to show pending, posted, failed, corrected, and reconciled meter states, so that billing data quality is visible.
44. As a billing admin, I want usage charts to derive from accepted `MeterEvent` and `UsageMeter` rows, so that duplicate OpenClaw observations do not double count.
45. As a billing admin, I want late usage corrections to appear as adjustments, so that invoice history remains auditable.
46. As a billing admin, I want Stripe metered usage posting failures to show safe status and retry state, so that support can repair without data loss.
47. As a billing admin, I want billing-period exports for usage detail, so that invoices can be explained to customers.
48. As a product operator, I want `usage.cost` ingestion to be idempotent, so that retries and replays do not inflate usage.
49. As a product operator, I want missed `usage.cost` windows recovered from checkpoints, so that Gateway downtime or worker failure does not create permanent gaps.
50. As a product operator, I want metering failures to create incidents where appropriate, so that billing data issues are visible to platform admins.
51. As an owner with failed payment, I want a dunning banner in Billing settings, so that I know what needs repair.
52. As an owner with failed payment, I want a hosted payment-update action, so that I can repair dunning without sharing card details with Opzava.
53. As an owner in grace period, I want the exact grace-period deadline, so that I know when data recovery ends.
54. As an owner in suspended state, I want read access to billing, invoices, account settings, and safe support surfaces, so that I can repair the tenant.
55. As a suspended tenant member, I want product surfaces to explain that new runtime work is paused by billing state, so that failure is not mysterious.
56. As a suspended tenant member, I want existing data visible where policy permits, so that grace period is useful for recovery.
57. As a suspended tenant, I want Gateway starts, broker commands, channel sends, agent dispatch, workflow publish, and new provisioning blocked, so that no new spend occurs.
58. As an owner after payment repair, I want Opzava to resume the tenant through the lifecycle path, so that work can continue without support tickets.
59. As an owner after cancellation, I want cancellation and data-retention states shown, so that I understand when runtime and data will be removed.
60. As a platform operator, I want dunning transitions audited and emitted through outbox events, so that provisioning, broker, UI, and incidents see the same state.
61. As a first-time owner, I want setup completion to include plan selection or plan entitlement, so that the workspace does not become Active without billing.
62. As a first-time owner, I want setup progress to show Account, Workspace, Plan, Gateway provisioning, default agents, and channel connect readiness, so that setup completion is honest.
63. As a first-time owner, I want setup to recover from interrupted billing or provisioning steps, so that duplicate tenants or charges are not created.
64. As a first-time owner, I want optional team invites to be created only after owner/org setup and plan checks, so that setup cannot overrun seat limits.
65. As a first-time owner, I want the channel connect wizard opened after entitlement and Gateway readiness, so that channel credentials are not collected before runtime can store them.
66. As a first-time owner, I want a setup-ready confirmation before entering Opzava, so that I know the tenant can actually run.
67. As a first-time owner, I want setup failure states to distinguish billing-required, payment failed, provisioning failed, Gateway unavailable, and plan-limit blocked, so that retry actions are precise.
68. As a support operator, I want onboarding completion receipts, so that support can see which step failed without exposing secrets.
69. As a security reviewer, I want all billing and budget mutations to require `AuthorizationPort`, so that browser-supplied ids cannot change plan or spend policy.
70. As a security reviewer, I want billing-sensitive actions to require fresh MFA/passkey step-up where PRD-001 requires it, so that stale sessions cannot change payment or plan policy.
71. As a security reviewer, I want Stripe webhook payloads verified and stored only as safe refs/audit metadata, so that provider payloads do not leak sensitive data.
72. As a security reviewer, I want plan checks to fail closed when billing projections are stale beyond policy, so that unknown entitlement is not treated as active.
73. As a developer, I want one entitlement decision contract reused by BFF and workers, so that quota behavior does not diverge by entry path.
74. As a developer, I want billing portal sessions created server-side, so that browser clients never choose arbitrary customer or subscription ids.
75. As a developer, I want usage/cost read models to be rebuildable from metering receipts and provider reconciliation, so that dashboards can recover from projection bugs.
76. As a developer, I want tests at application-service, port, quota middleware, webhook, projection, and UI seams, so that billing behavior is protected without coupling to Stripe or OpenClaw internals.
77. As a screen-reader user, I want spend meters, limit tables, dunning banners, invoice statuses, and setup steps to expose semantic labels, so that billing can be managed without visual scanning.
78. As a keyboard user, I want Billing tabs, Manage plan, invoice links, budget fields, switches, threshold selectors, and setup actions to work without a mouse, so that billing repair is accessible.
79. As a mobile user, I want billing summaries, budget controls, plan limits, dunning banners, and setup progress to fit without overlap, so that urgent billing actions work on narrow screens.
80. As a product operator, I want every billing surface to render loading, empty, forbidden, stale, offline/reconnecting, portal-unavailable, webhook-delayed, payment-failed, suspended, plan-limit, and retry states, so that async billing reality is normal UX.

## UX walkthrough mapping each named mockup screen

| Mockup | Required UX mapping |
| --- | --- |
| `settings.html` | Settings page keeps Billing as a first-class left-nav panel. The Billing panel must show current plan badge, entitlement/dunning state, monthly spend, budget used, seats used/allowed, monthly budget meter, monthly budget input, billing email input, payment method summary, alert threshold selector, Pause new runs at budget cap switch, monthly receipts switch, recent invoice table, Save billing settings, Manage plan, and renewal/trial/grace date. Manage plan opens a server-created Stripe Billing Portal session through `BillingPort`. The Billing panel must add plan-limit visibility for agents, channels, autonomy tiers, workflow mechanisms, provider/model access, and runtime/budget policy, either inline or via linked plan detail drawer. |
| `costs.html` | The existing Costs page remains PRD-011's Finance expense ledger by default. This PRD adds a billing usage dashboard mode or adjacent page that reuses the period summary, budget meter, account/category breakdown, transaction-style rows, export, and period controls for Opzava metered usage. The billing usage view must read from Finance and Billing `UsageMeter`, `MeterEvent`, and `Invoice` projections derived from OpenClaw `usage.cost`, not from raw OpenClaw storage and not from the Finance expense ledger. It must show spend by agent, department, channel, workflow/mechanism, provider/model, and meter state with freshness and adjustment indicators. |
| `essential-setup.html` | First-run setup keeps Account, Workspace, and Team steps from PRD-001, but onboarding completion must include plan entitlement and tenant readiness before normal product entry. Product UX may extend the progress model with Plan, Provisioning, and Connect channels states or route to a post-auth completion screen. Setup must show billing-required, payment failed, provisioning failed, Gateway unavailable, and ready states without exposing Stripe ids, Gateway ports, tokens, or secrets. Optional team invites must respect seat limits, and channel connect must wait until entitlement and Gateway readiness are available. |

Net-new screens to design:

- Plan detail drawer/page showing current plan, included seats, agent employee limit, connected channel limit, local/operator tool allowance where applicable, provider/model features, allowed autonomy tiers, workflow mechanism availability, included usage, overage policy, and upgrade/downgrade effects.
- Plan comparison and checkout/upgrade entry screen before handing off to Stripe-hosted checkout or billing portal.
- Plan-limit/upgrade interstitial shared by Settings, Connections, Agent roster, workflow publish, invite acceptance, and runtime-start failures.
- Dunning/payment repair screen for failed payment, trial expired, canceled entitlement, grace-period countdown, payment-update action, and resume status.
- Suspended tenant safe-mode shell that allows Billing, invoices, account settings, support/contact, and export/data recovery surfaces while blocking runtime work.
- Onboarding completion screen after PRD-001 setup for Plan, tenant provisioning, Gateway readiness, default departments/agents, and channel connect readiness.
- Usage dashboard detail screen for metered Opzava usage by agent, department, channel, workflow/mechanism, provider/model, feature, period, and meter status.
- Usage event or invoice-detail drawer for line-item explanation, meter receipts, adjustments, Stripe posting state, and reconciliation status.
- Budget policy screen for tenant, department, employee, workflow, mechanism, channel, hourly, daily, and billing-period ceilings.
- Temporary entitlement/override approval screen for owner/admin-granted budget or plan exceptions, including expiry, scope, reason, and audit.

## Functional requirements

### Billing settings and portal

- Finance and Billing must own tenant-facing plan, subscription, invoice, usage meter, meter receipt, budget policy, entitlement state, and billing contact behavior.
- Stripe must be accessed only through `BillingPort`; product code, route handlers, workers, provisioning, and UI must not call Stripe SDKs directly.
- Stripe customer, subscription, invoice, payment, price, portal-session, checkout-session, usage-record, and webhook ids must remain opaque external refs.
- Billing settings must show plan name, subscription state, entitlement state, renewal/trial/cancel/grace dates, seats used/allowed, monthly spend, budget used, payment method label, billing email, alert threshold, pause-at-cap policy, invoice list, and receipt delivery preference.
- Manage plan must create a server-side provider portal session for the authorized tenant and active billing customer.
- Portal return and webhook reconciliation must update `Subscription`, `Invoice`, entitlement projections, and relevant outbox events before UI shows new state as current.
- Payment method labels must be safe summaries such as brand/type and last four only when provided by the billing provider. Raw payment details must never enter Opzava forms or logs.
- Invoice table statuses must include Paid, Open, Pending, Uncollectible, Voided, Failed payment, Dunning, Refunded/credited where supported, and Stale projection.
- Billing contact changes, budget changes, threshold changes, receipt preference changes, plan changes, portal launches, cancellation, resume, and override grants must be audited.
- Billing-sensitive settings must require owner/admin authorization and fresh MFA/passkey step-up where PRD-001 policy requires it.

### Plans, entitlements, limits, and budgets

- `Plan` records must represent Opzava product limits in `limits_json` or equivalent structured policy, not only Stripe price metadata.
- Plan policy must cover seats, agent employees, connected customer channels, operator/local tools where applicable, provider/model feature access, autonomy tiers, workflow mechanisms, enabled features, cost budgets, spend ceilings, overage behavior, and temporary entitlement support.
- `Subscription` must expose an entitlement status usable by product code: Active, Trialing, PastDue, Delinquent, Suspended, Canceled, Incomplete, GracePeriod, and Unknown/Stale where applicable.
- Entitlement decisions must combine plan, subscription, tenant lifecycle, usage meter totals, budget policy, temporary entitlement, and relevant domain policy.
- BFF quota middleware must check limits before creating or expanding billable/runtime work.
- Worker/admission paths must reuse the same entitlement decision before workflow publish, broker command admission, Gateway lazy-start, channel send, agent dispatch, cron/TaskFlow run, local tool run, and provisioning repair that can create spend.
- Overage must fail closed with `402 Payment Required` unless the plan explicitly allows paid overage, approval-gated soft cap, or temporary admin entitlement.
- Over-limit responses must name the Opzava limit, current usage, allowed limit where safe, affected action, and next action. They must not leak Stripe internals.
- Seat limits must be checked for invites, invite acceptance, membership activation, and role/membership changes that grant normal product access.
- Agent limits must be checked before creating, cloning, reactivating, or provisioning an `AgentEmployee`.
- Autonomy-tier limits must be checked before moving an employee to T2 or T3 or enabling proactive standing orders.
- Channel limits must be checked before connect/reconnect flows collect credentials or start Gateway/provisioning work.
- Workflow and mechanism limits must be checked before workflow publish and before scheduled runtime admission.
- Budget limits must support tenant, department, employee, workflow, mechanism, channel, hourly, daily, and billing-period ceilings.
- Budget policy must distinguish alerts, soft caps with approval, hard caps, pause-new-runs behavior, and paid-overage behavior.
- Existing in-flight runs may finish at budget cap only when policy allows; retries, handoffs, new scheduled runs, and new channel-triggered work count as new work.
- Temporary entitlements or overrides must have scope, reason, actor, expiry, and audit, and must not silently become permanent plan changes.

### Usage metering and cost dashboards

- The one-minute `usage.cost` poller from ADR-014 must write immutable `MeterEvent` rows and roll accepted events into `UsageMeter` read models.
- `MeterEvent` idempotency must follow ADR-014: canonical tenant, optional agent, window, and raw `usage.cost` payload hash.
- Replayed or duplicated observations must not double count locally or post duplicate provider usage records.
- Changed raw payloads for an already-metered window must create additive correction/reconciliation events, not destructive overwrites.
- `UsageMeter` must aggregate by tenant, period, agent, department, channel, workflow, mechanism, feature, provider/model where known, cost class, and provider meter dimension where required.
- Usage dashboards must show billing-period totals, budget status, spend by dimension, meter freshness, last poll/checkpoint, adjustment status, and Stripe posting state.
- Usage dashboards must show stale, missing, failed-posting, corrected, and reconciled states as normal product states.
- Usage exports must use accepted meter and invoice projections, include period and dimension totals, and respect billing/admin authorization.
- Invoice projections must reconcile provider invoice state with Opzava meter receipts and show safe line-item explanations.
- Billing usage dashboards must remain distinct from PRD-011 Finance expense-ledger dashboards, even if both can reference runtime cost inputs.
- Metering failures, usage spikes, Stripe posting failures, or reconciliation deadletters may create PRD-012 incidents, but incidents are not the source of truth.

### Dunning, suspension, and tenant lifecycle surfacing

- Stripe webhooks and `BillingPort` reconciliation must update `Subscription` and `Invoice` dunning state.
- Failed payment, canceled entitlement, expired trial, unpaid invoice, or provider-confirmed delinquency must transition entitlement to delinquent according to plan policy.
- Finance and Billing must request the ADR-002 transition from `Active` to `Suspended`; ADR-002 remains the owner of tenant lifecycle and runtime control.
- Suspended tenants must retain allowed data for the thirty-day grace period defined by ADR-014.
- Suspended tenants must block Gateway start, broker command admission, channel sends, agent dispatch, workflow publish, new runtime provisioning, and runtime-affecting connection changes.
- Suspended tenants must allow safe Billing settings, invoice viewing, payment repair, support/contact, account/session management, and data export where policy permits.
- Dunning and suspension banners must appear on Billing settings, usage dashboard, app shell, runtime/action surfaces, and blocked action responses where relevant.
- Payment repair during grace must request the ADR-002 resume path back to Active after provider reconciliation and entitlement restoration.
- Grace-period expiry must request Deprovisioning through ADR-002 and surface irreversible warnings before the deadline where feasible.
- UI must distinguish Past due, Payment failed, Trial expired, Canceled, Suspended, Grace period, Resume pending, Deprovisioning, Deleted, and Unknown/Stale.
- Reaper or provisioning compensation events that stop an unentitled Gateway must be visible to platform operations and safe tenant-facing status.

### Onboarding completion

- PRD-001 first workspace setup must create the owner/org and hand off to onboarding completion rather than granting normal access before tenant readiness.
- Onboarding completion must require a valid plan entitlement, tenant provisioning job, Gateway readiness where the plan requires runtime, default departments/agents seeded, broker token pairing completed, and channel connect wizard readiness.
- Setup must be idempotent by tenant/setup/provisioning identifiers and must not create duplicate Stripe customers, subscriptions, tenants, owners, or Gateway instances on retry.
- Plan selection or entitlement attachment must happen before the tenant is marked Active.
- Optional setup invites must be created only after owner/org creation and seat-limit checks.
- Channel connect must begin only after entitlement and Gateway readiness, because channel credentials belong in Gateway-owned stores.
- Onboarding progress must show user-safe step names and statuses without exposing Gateway paths, ports, tokens, Stripe refs, or secrets.
- Recoverable setup failures must present retry/repair states for billing-required, payment failed, provisioning failed, Gateway unavailable, channel setup deferred, and support-needed.
- Completing onboarding must emit audit/outbox events consumed by app shell, Settings, Connections, notifications, and provisioning.

### Authorization, safety, and accessibility

- Every billing read and command must be tenant-scoped and authorized server-side. Browser-provided tenant, customer, subscription, invoice, usage, plan, or Gateway refs are hints only.
- Missing tenant context or failed authorization must return 403, not an empty healthy state.
- Billing writes must validate current subscription and plan state inside the command transaction or provider reconciliation flow.
- Billing webhooks must verify provider signature, deduplicate by provider event id and idempotency keys, and store only safe payload hashes/refs plus needed normalized fields.
- Billing logs, audit, incidents, notifications, exports, and UI must redact provider payloads, payment data, secrets, Gateway refs that are not user-safe, and sensitive customer data.
- Billing, budget, plan-limit, dunning, invoice, usage, and setup states must be keyboard accessible, screen-reader labeled, and usable on mobile without overlapping content.
- Statuses must use text labels, glyphs, and semantic state, not color alone.

## Data and API touchpoints

| Surface | Owning bounded context | Primary data/API touchpoints | Ports |
| --- | --- | --- | --- |
| Billing settings read model | Finance and Billing | `Plan`, `Subscription`, `Invoice`, `UsageMeter`, budget policy, billing contact, entitlement projection, renewal/trial/grace dates | `BillingPort`, `AuthorizationPort`, `EventBusPort` |
| Billing settings mutation | Finance and Billing | Billing email, budget cap, alert threshold, pause-at-cap policy, receipt preference, audit rows, outbox events | `AuthorizationPort`, `BillingPort`, `EventBusPort` |
| Stripe portal/session handoff | Finance and Billing | Authorized tenant/customer ref, portal session ref, return url, provider result, subscription reconciliation | `BillingPort`, `AuthorizationPort`, `EventBusPort` |
| Webhook and reconciliation | Finance and Billing | Provider event id/hash, customer/subscription/invoice refs, payment status, dunning metadata, usage posting status | `BillingPort`, `EventBusPort` |
| Plan and entitlement decision | Finance and Billing with consuming contexts | Plan limits, subscription state, tenant lifecycle, usage totals, budget policy, temporary entitlement, denial reason | `AuthorizationPort`, `EventBusPort` |
| BFF quota middleware | App/BFF with Finance and Billing | Request action, actor, tenant, target refs, proposed delta, entitlement decision, 402 response payload | `AuthorizationPort`, Finance and Billing application service |
| Worker/runtime admission | AI Workforce, Dept Workflows, External Channels, Gateway Broker with Finance and Billing | Agent run, workflow publish/run, channel send, broker command, local tool run, Gateway lazy-start, entitlement decision | `OpenClawGatewayPort`, `GatewayRuntimePort`, `AuthorizationPort`, `EventBusPort` |
| Usage polling | Finance and Billing with Gateway Broker ACL | `usage.cost` snapshots, poll checkpoint, canonical raw payload hash, window start/end, meter dimensions | `OpenClawGatewayPort`, `BillingPort`, `EventBusPort` |
| Meter receipts | Finance and Billing | `MeterEvent`, idempotency key, raw payload hash, quantity, cost, accepted/corrected state, Stripe posting state | `BillingPort`, `EventBusPort` |
| Usage dashboard | Finance and Billing | `UsageMeter`, `MeterEvent`, `Invoice`, dimensions by agent/department/channel/workflow/mechanism/provider/model, freshness | `AuthorizationPort`, `EventBusPort` |
| Dunning and suspension | Finance and Billing with Tenant Provisioning/Platform-Ops | `Subscription` dunning state, `Invoice` status, entitlement state, tenant lifecycle transition request, grace deadline | `BillingPort`, `GatewayRuntimePort`, `EventBusPort` |
| Resume after payment repair | Finance and Billing with Tenant Provisioning/Platform-Ops | Payment repair confirmation, entitlement restoration, lifecycle resume request, provisioning/broker outbox events | `BillingPort`, `GatewayRuntimePort`, `EventBusPort` |
| Onboarding completion | Identity & Access, Tenant Provisioning/Platform-Ops, Finance and Billing | Owner/org, setup attempt, plan entitlement, `ProvisioningJob`, `GatewayInstance`, default seeds, channel wizard readiness | `AuthPort`, `BillingPort`, `GatewayRuntimePort`, `AuthorizationPort`, `EventBusPort` |
| Seat limits | Identity & Access with Finance and Billing | Invite creation/acceptance, membership activation, seat count projection, plan limit, denial/upgrade action | `AuthPort`, `AuthorizationPort`, Finance and Billing application service |
| Channel limits | External Channels via ACL with Finance and Billing | Channel connect/reconnect intent, channel count, plan limit, Gateway readiness, entitlement denial | `OpenClawGatewayPort`, `AuthorizationPort`, Finance and Billing application service |
| Agent/autonomy limits | AI Workforce with Finance and Billing | `AgentEmployee` create/reactivate/tier change, agent count, autonomy-tier allowance, budget policy | `OpenClawGatewayPort`, `AuthorizationPort`, Finance and Billing application service |
| Workflow/budget limits | Department Workflows with Finance and Billing | Workflow publish/run, mechanism count, cost budgets, concurrency/fan-out policy, entitlement denial | `OpenClawGatewayPort`, `AuthorizationPort`, Finance and Billing application service |
| Notifications and incidents | Notifications/Admin-Observability | Budget alerts, dunning notices, meter failures, usage spikes, stale projections, suspension/resume events | `EventBusPort`, `PushNotificationPort` |
| Audit | Audit/Security with producing contexts | Plan changes, portal launch, billing settings changes, budget overrides, webhooks, dunning, suspension, onboarding receipts | `EventBusPort`, `AuthorizationPort` |

## OpenClaw-parity notes

| Capability | Native harnessed vs Opzava-owned |
| --- | --- |
| `usage.cost` observations | OpenClaw-native runtime source harnessed through the broker ACL. Opzava owns immutable `MeterEvent` receipts, `UsageMeter` projections, dashboards, Stripe usage posting, corrections, and invoice explanations. |
| `usage.status` and session usage hints | OpenClaw-native signals may enrich provider/model and usage freshness. Opzava owns product budget decisions and billing-period totals. |
| Gateway runtime lifecycle | ADR-002/Tenant Provisioning owns `GatewayRuntimePort`, `GatewayInstance`, lifecycle transitions, suspend/resume/deprovision mechanics, leases, and reaper behavior. Finance and Billing owns entitlement and requests lifecycle transitions. |
| Channels | OpenClaw owns channel runtime credentials/status behind the ACL. Opzava owns plan limits, connection metadata, entitlement gating, and blocked-action UX for PRD-013 channel flows. |
| Agent employees and autonomy | OpenClaw harnesses runtime agent capability. Opzava owns `AgentEmployee`, autonomy-tier policy, plan limits, and admission decisions. |
| Workflows, cron, TaskFlow, standing orders | OpenClaw executes provisioned runtime mechanisms. Opzava owns workflow definitions, publish policy, plan/budget checks, and usage/budget enforcement. |
| Provider/model runtime usage | OpenClaw and provider adapters expose runtime status and usage hints. Opzava owns billing usage projections, plan availability, budget policy, and dashboard explanations. |
| Stripe/payment provider | Not OpenClaw-native. Stripe is isolated behind `BillingPort`; Opzava owns commercial policy, entitlements, and product state. |
| Onboarding completion | OpenClaw readiness and pairing are harnessed via provisioning. Opzava owns first workspace setup, plan entitlement, provisioning receipts, setup progress, and product access gating. |

## Implementation decisions

- Treat Finance and Billing as the product source of truth for plans, subscriptions, invoices, metering, budget policy, entitlement projections, and billing settings.
- Keep Stripe behind `BillingPort`; use hosted portal/checkout flows for payment method, invoice, tax/address, cancellation, renewal, and plan-management actions.
- Reuse one entitlement decision service from BFF quota middleware and worker/admission paths.
- Make quota denial a product error with a stable Opzava limit code, safe display text, current/limit values where allowed, and next-action metadata.
- Keep plan policy structured and versioned so subscription changes, temporary entitlements, and future provider replacement do not require Stripe-specific product logic.
- Use accepted `MeterEvent` rows and `UsageMeter` projections as the usage dashboard source, with OpenClaw `usage.cost` treated as runtime input.
- Keep corrections additive and auditable; never mutate accepted meter history to hide prior observations.
- Separate Billing usage dashboards from PRD-011 Finance expense-ledger screens while allowing shared period/budget UI patterns.
- Surface dunning through subscription/invoice projections and outbox events; do not let webhook handlers directly orchestrate containers.
- Consume ADR-002 lifecycle for suspension/resume/deprovisioning, and fail closed for runtime start when entitlement is missing or stale.
- Extend onboarding completion as a cross-context flow after PRD-001 setup, with plan entitlement before Active tenant access.
- Require authorization and step-up for billing-sensitive mutations, budget overrides, cancellation, plan changes, and payment repair actions according to PRD-001 policy.

## Acceptance criteria

- Billing settings renders plan, entitlement, spend, budget, seats, billing contact, payment method summary, alert threshold, pause-at-cap, receipt preference, invoices, Manage plan, and renewal/trial/grace state for an authorized owner/admin.
- Manage plan creates a provider portal session only for the authorized tenant and does not expose raw Stripe customer, subscription, payment, or secret values to the browser.
- Billing settings saves billing email, budget cap, alert threshold, pause-at-cap, and receipt preference with authorization, validation, audit, and projection refresh.
- Recent invoices show safe statuses and amounts from Opzava invoice projections, including failed/dunning states.
- Plan limits block over-limit seat invitation/activation, agent creation, autonomy-tier upgrade, channel connection, workflow publish, and runtime start through server-side checks.
- Over-limit responses return `402 Payment Required` unless a plan explicitly allows paid overage, approval soft cap, or temporary entitlement.
- Budget cap behavior pauses new agent work, scheduled runs, retries, handoffs, and channel-triggered work according to policy while preserving allowed in-flight completion.
- Usage dashboard reads from `UsageMeter`/`MeterEvent` projections and shows spend by period and dimensions with freshness and adjustment states.
- Duplicate `usage.cost` observations do not double count locally or post duplicate provider usage records.
- Changed usage payloads create correction/reconciliation events instead of overwriting accepted meter receipts.
- Failed payment or expired entitlement surfaces dunning state in Billing settings and requests ADR-002 suspension through outbox/lifecycle integration.
- Suspended tenants can reach safe billing repair surfaces but cannot start Gateway runtime, send channels, dispatch agents, publish workflows, or provision new runtime work.
- Payment repair during grace updates entitlement and requests resume; grace expiry requests deprovisioning through ADR-002.
- First workspace setup does not mark a tenant product-ready until plan entitlement and required provisioning readiness are complete.
- Setup retry does not duplicate tenant, owner, subscription/customer, provisioning job, Gateway instance, or invites.
- Billing, dunning, usage, plan-limit, and setup states are accessible by keyboard/screen reader and fit mobile layouts without overlap.

## Testing decisions

- Test external behavior at the highest seams: billing application services, entitlement decision service, quota middleware, webhook/reconciliation handler, metering projector, lifecycle event consumer, route/server-action endpoints, and UI composition.
- Use fake `BillingPort`, fake `OpenClawGatewayPort`, fake `GatewayRuntimePort`, and tenant-scoped repositories; do not test against live Stripe or live OpenClaw.
- Entitlement tests must cover active, trialing, past due, delinquent, suspended, canceled, grace-period, stale-projection, temporary entitlement, soft-cap, hard-cap, and paid-overage policy.
- Quota tests must cover seats, agent count, channel count, autonomy tiers, workflow mechanisms, provider/model feature gates, tenant budgets, department budgets, employee budgets, workflow budgets, hourly/daily/period ceilings, and runtime start.
- Metering tests must cover idempotent duplicate ingestion, late windows, replay after checkpoint, changed raw payload correction, Stripe posting retry, posting success, posting failure, and read-model rebuild.
- Webhook tests must cover signature verification, duplicate provider event, out-of-order events, invoice payment failed, invoice paid after failure, trial expired, cancellation, portal-return race, and stale provider state.
- Suspension tests must verify safe read access and hard runtime denial for Gateway start, broker command, channel send, agent dispatch, workflow publish, provisioning repair, and local tool run.
- Onboarding tests must cover success, billing-required, payment failed, provisioning failed, Gateway unavailable, retry idempotency, seat-limit invite denial, and channel-connect deferred.
- UI tests must assert semantic labels and user-visible states for Billing settings, usage dashboard, dunning banner, plan-limit interstitial, suspended safe mode, and onboarding completion.
- Tests must assert no raw Stripe ids, payment details, Gateway tokens, channel credentials, provider secrets, or raw `usage.cost` payloads appear in ordinary UI responses, logs, or exported billing files.

## Dependencies

- PRD-001 Auth, invitation, profile security, and first workspace setup: owner setup, sessions, authorization, step-up policy, setup handoff, and seat/invite prerequisites.
- PRD-013 Connections, providers, channels, tools, and the connect wizard: channel/tool/provider surfaces that must consume plan entitlement and dunning state.
- PRD-011 Finance expense ledger and money-risk approval UX: Costs mockup ownership and separation between company expense ledger and Opzava billing/usage.
- ADR-014 Billing, usage metering, and plan enforcement: Finance and Billing ownership, `BillingPort`, `Plan`, `Subscription`, `UsageMeter`, `MeterEvent`, `Invoice`, one-minute `usage.cost` poller, quota enforcement, dunning, and suspension.
- ADR-002 Pure-per-tenant tenancy, `GatewayRuntimePort`, and provisioning saga: tenant lifecycle, provisioning, Gateway runtime control, suspension semantics, resume, deprovisioning, and anti-orphan invariant.
- ADR-003 Gateway broker ACL: runtime RPC path for `usage.cost`, Gateway status, channel/runtime admission, and OpenClaw access through the broker.
- ADR-004 data boundary/outbox/projections: durable billing projections, outbox events, and rebuildable read models.
- ADR-012 workflow engine, approvals, cost budgets, and run limiting: workflow/mechanism budget limits and publish/runtime admission.
- ADR-013 incident pipeline: metering failures, dunning failures, usage spikes, stale projections, and billing/provider posting failures as incidents where appropriate.

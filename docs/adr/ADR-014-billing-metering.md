# ADR-014: Billing, usage metering, and plan enforcement

Status: Accepted

Opzava will own billing, usage metering, invoices, plan limits, quota enforcement, and entitlement state in the Finance and Billing bounded context, with Stripe isolated behind `BillingPort`. The ADR-002 provisioning saga, `GatewayRuntimePort`, and tenant lifecycle state machine remain the owners of Gateway creation, runtime control, and lifecycle transitions; this decision defines how billing and entitlement couple to that lifecycle without moving provisioning into Billing.

## Context

ADR-002 establishes one OpenClaw Gateway per tenant and makes `tenant.lifecycle_state` the single source of truth for `Provisioning -> Active -> Suspended -> Deprovisioning -> Deleted`. It also defines the provisioning saga, `GatewayRuntimePort`, `GatewayInstance` runtime records, the anti-orphan invariant, and the rule that `Suspended` fails closed for runtime starts and broker admission.

ADR-004 places Finance and Billing inside Opzava Postgres and treats OpenClaw usage/cost as OpenClaw-owned runtime data that reaches Opzava through ADR-003 and ADR-004 projection paths. Usage and cost views are durable Opzava read models, but OpenClaw remains the runtime source for `usage.cost` observations.

ADR-012 adds tenant, department, employee, mechanism, plan, concurrency, fan-out, approval, and cost-budget ceilings to workflow publishing and runtime dispatch. Billing cannot be a Stripe-only integration because those same limits decide whether a tenant may create agents, publish workflows, start container-backed runtime work, connect channels, add seats, or use higher autonomy tiers.

Q12 locks billing and provisioning into one lifecycle risk: a billing-paused tenant must not leave a Gateway container running with CPU usage, channel credentials, workspace state, and possible spend. The billing model therefore needs metered usage and plan enforcement, but the hard runtime lifecycle and deprovisioning machinery stay in ADR-002.

## Decision

Use Stripe as the first payment and invoicing provider behind `BillingPort`. Product code, provisioning workers, BFF quota middleware, and domain services call `BillingPort` or Finance and Billing application services; they do not call Stripe SDKs directly. Stripe customer, subscription, price, usage-record, invoice, payment, dunning, and webhook identifiers are adapter details stored as opaque external refs.

Finance and Billing owns these aggregates and records:

- `Plan`: plan slug, public name, lifecycle status, `limits_json`, `stripe_price_id`, billing interval, and feature/autonomy/channel/seat ceilings.
- `Subscription`: tenant subscription state, current plan, billing period, entitlement status, Stripe subscription ref, cancellation/dunning metadata, and lifecycle audit.
- `UsageMeter`: tenant and period usage totals by agent, department, channel, workflow mechanism, feature, cost class, and Stripe meter dimension where required.
- `MeterEvent`: one immutable metering receipt derived from an OpenClaw `usage.cost` observation, with tenant, optional agent, window, quantity, cost, raw payload hash, Stripe posting status, and an idempotency key.
- `Invoice`: Opzava invoice projection with tenant, subscription, period, Stripe invoice ref, totals, payment status, dunning status, and audit refs.
- `GatewayInstance`: the ADR-002 runtime record referenced by entitlement checks and dunning decisions. Finance and Billing does not own `GatewayRuntimePort`, host placement, ports, state directories, or runtime lifecycle mechanics.

`MeterEvent.idempotency_key` is `sha256(tenant_id, agent_id, window_start, window_end, raw usage.cost payload)`, using a canonical byte representation of the raw `usage.cost` payload before derived totals are rounded or normalized. Re-ingesting the same tenant, agent, window, and raw cost payload must resolve to the same `MeterEvent`; a different raw payload for the same window creates a distinct event and requires reconciliation rather than overwriting history.

Run a one-minute `usage.cost` poller per routable active tenant Gateway, mediated through ADR-003 and ADR-004 integration paths. The poller reads OpenClaw usage/cost snapshots, partitions observations into stable windows, writes immutable `MeterEvent` rows, rolls accepted events into `UsageMeter`, and posts idempotent Stripe metered `usage_records` through `BillingPort`. Polling is best-effort and resumable: missed minutes are recovered by replaying windows from the last successful checkpoint, and duplicate delivery is treated as normal.

Plan enforcement happens in BFF quota middleware before product requests can create or expand billable/runtime work. The middleware evaluates `Plan`, `Subscription`, `UsageMeter`, tenant lifecycle, and relevant domain policy before admitting requests for:

- agent employee count
- seats and memberships
- connected channels
- enabled features
- autonomy tiers
- tenant, department, employee, workflow, and mechanism cost budgets from ADR-012
- hourly, daily, and billing-period spend ceilings
- runtime starts and container-backed dispatches that depend on a valid ADR-002 `GatewayInstance`

Overage fails closed with `402 Payment Required` unless the plan explicitly allows paid overage, an approval-gated soft cap, or an admin-granted temporary entitlement. The response must identify the exceeded limit in Opzava terms and avoid leaking Stripe internals. Workflow publish, broker command admission, and run dispatch use the same entitlement decision as the BFF path so a request cannot bypass quota by entering through a worker or projected event.

Dunning starts from Stripe webhooks or BillingPort reconciliation and is recorded on `Subscription` and `Invoice`. Failed payment, canceled entitlement, expired trial, or unpaid invoice transitions the tenant entitlement to delinquent and requests the ADR-002 lifecycle transition from `Active` to `Suspended`. `Suspended` starts a thirty-day data grace period: Opzava retains tenant records and Gateway state for recovery, but gateway start, broker command admission, channel sends, agent dispatch, workflow publish, and new runtime provisioning are blocked. If dunning is resolved during grace, Billing requests the ADR-002 resume path back to `Active`. If grace expires, Billing requests `Deprovisioning`; ADR-002 performs the irreversible runtime teardown, state purge, token revocation, and final lifecycle transition.

Billing lifecycle events are emitted through the ADR-004 outbox. Provisioning, broker routing, workflow publish, incident/admin projections, invoice views, and tenant UI read the same entitlement events and subscription projections rather than polling Stripe directly. ADR-013 may capture billing, dunning, webhook, usage-spike, or metering-post failures as incidents, but incident cards do not become the billing source of truth.

## Consequences

Stripe is replaceable at the boundary but not absent from the first implementation. `BillingPort` confines provider lock-in to the adapter, while Opzava still owns plan semantics, entitlement decisions, quota policy, invoice projections, usage receipts, and dunning lifecycle coupling.

Metering idempotency is load-bearing. A `usage.cost` observation may be delivered late, duplicated, replayed after worker failure, or retried after a Stripe timeout. Opzava must never double count it locally or post it twice to Stripe. The invariant is: one canonical tenant, agent, window, and raw `usage.cost` payload produces one accepted `MeterEvent`, one usage-meter contribution, and at most one successful Stripe metered usage record.

Corrections are additive. If OpenClaw later reports a changed raw `usage.cost` payload for an already-metered window, Finance and Billing records a new adjustment/correction event and reconciliation status instead of mutating the original receipt. Invoice projections can show adjustments, but audit must preserve both the original payload hash and the corrective payload.

Suspension blocks Gateway start. A tenant in `Suspended` may keep data during the thirty-day grace window, but the BFF, broker, provisioner, workflow engine, channel senders, and runtime dispatchers must all treat runtime start as denied. Lazy-start cannot override dunning state.

Entitlement gates a container run. The ADR-002 anti-orphan invariant now includes billing entitlement: no container may run unless the tenant has an active runtime entitlement, `tenant.lifecycle_state = Active`, a valid non-deleted `GatewayInstance`, and a live provisioner lease. If the reaper finds a running container without current entitlement, it stops or quarantines it through the ADR-002 compensating path and emits an outbox event.

Quota checks become part of normal product latency. The BFF and worker admission paths need cached/read-model access to plan, subscription, lifecycle, and usage totals, plus a consistent fail-closed path when billing projections are stale or unavailable. Paid overage, soft caps, and temporary admin entitlements must be explicit plan policy, not accidental fallback behavior.

Billing and provisioning remain coupled by events, not ownership. Finance and Billing can request suspend, resume, and deprovision transitions, but ADR-002 owns the state machine, provisioning saga, `GatewayRuntimePort`, runtime leases, `GatewayInstance` placement, and deprovisioning mechanics. This prevents Stripe webhook handlers from becoming container orchestration code.

## Alternatives

Use Stripe directly from BFF handlers, workers, and provisioning code. Rejected because plan semantics, entitlement state, quota decisions, dunning, invoice projections, and idempotent metering are Opzava domain behavior. Direct provider calls would spread Stripe concepts across bounded contexts and make replacement or test isolation expensive.

Bill only with flat subscriptions and no metered usage. Rejected because OpenClaw runtime cost varies by tenant, agent, workflow, channel, model, and automation fan-out. ADR-012 cost budgets and usage/cost reporting require durable usage receipts even if some plans include large allowances.

Let Stripe be the source of truth for entitlements and plan limits. Rejected because Stripe does not know Opzava agent counts, channels, seats, autonomy tiers, workflow mechanism budgets, Gateway lifecycle state, or the ADR-002 anti-orphan invariant. Stripe owns payment-provider state; Opzava owns product entitlement.

Poll usage less frequently or only at invoice time. Rejected because one-minute polling gives quota middleware, workflow limiters, incident detection, and customer-facing usage views current-enough data to stop runaway automation before invoice close. Reconciliation still handles missed windows and Gateway downtime.

Enforce plan limits only in the UI. Rejected because workers, broker commands, workflow publish, retry paths, scheduled triggers, channel events, and lazy Gateway starts can create runtime work without a visible browser action. Enforcement must live in BFF and application-service admission paths, with workers reusing the same entitlement decision.

Let suspended tenants keep running during grace. Rejected because the grace period is for data recovery and payment repair, not continued runtime spend. Continuing to run containers while entitlement is delinquent recreates the orphaned-Gateway failure ADR-002 is designed to prevent.

Merge billing, provisioning, and runtime lifecycle into one bounded context. Rejected because Billing owns commercial policy and metering, while ADR-002 Tenant Provisioning and Platform-Ops own runtime lifecycle, container orchestration, leases, port/state reservations, and deprovisioning. Coupling them through outbox events gives one lifecycle truth without collapsing responsibilities.

## Related ADRs

- ADR-002: Pure-per-tenant tenancy, `GatewayRuntimePort`, provisioning saga, lifecycle state machine, and anti-orphan invariant.
- ADR-003: gateway-broker ACL, two-token model, and WS protocol client (the `usage.cost` polling / metering integration path).
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-012: Department workflow engine, approvals, cost budgets, and run limiting.
- ADR-013: Error-to-admin-card incident pipeline and remediation loop.

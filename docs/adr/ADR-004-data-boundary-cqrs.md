# ADR-004: Data model boundary, hybrid CQRS, outbox, and projections

Status: Accepted

> Current-context note (2026-07-15): CRM references in this retained decision mean the deferred CRM rebuild, which returns only with the future user-side dashboard (GitHub issue #200).

> Dev Board amendment (2026-07-15): Project Management continues to own generic project boards and `pm.Card`. Opzava platform-development work is instead owned by the dedicated `DevTicket`/Dev Board domain, while Notifications/Admin-Observability owns the operational `Incident`/`ErrorGroup` aggregate and lifecycle. ADR-017 and PRD-019 govern those boundaries; former platform/admin board or card examples in this ADR do not assign them to Project Management.

Opzava Postgres is the system of record for all Opzava domain data, while OpenClaw remains the system of record for runtime execution data reached only through the ADR-003 `gateway-broker` ACL. Opzava will use hybrid CQRS: durable UI data is projected into Postgres read models from domain/runtime events, while heavy or ephemeral runtime views are read through the broker from OpenClaw snapshots.

## Context

ADR-001 establishes Opzava as a modular DDD monorepo with Postgres, Drizzle, one package per bounded context, and OpenClaw hidden behind an anti-corruption layer. ADR-002 establishes one OpenClaw Gateway per tenant. ADR-003 makes the `gateway-broker` the only production path to OpenClaw and requires OpenClaw Gateway types, identifiers, protocol frames, and provider secrets to stay behind that ACL.

Q4 locks the data boundary: Opzava owns identity, tenancy, human workflows, CRM, billing, notifications, audit, and product policy in Postgres; OpenClaw owns agent runtime capabilities such as sessions, runs, streaming, channels, cron/automation, Workboard, logs, usage/cost, skills, memory, Gateway-local secrets, and Gateway-local config. Opzava may store opaque refs and projected snapshots of OpenClaw state, but storing a projection does not transfer ownership of that data to Opzava.

Q7, Q9, and Q12 all depend on the same projection contract. Realtime fan-out needs durable chat/activity/notification delivery through outbox and Redis. The error-to-Incident pipeline needs OpenClaw logs, diagnostics, task failures, Workboard failure flags, health, and usage spikes normalized into Incident read models. Provisioning and billing need lifecycle and usage observations to flow through outbox so suspension, deprovisioning, and reapers observe the same tenant truth.

The central modeling risk is identity drift between human work and runtime work. `pm.Card` is an Opzava Project Management aggregate for human commitments, ownership, SLA, customer impact, approvals, comments, and board semantics. `workboard.Card` is an OpenClaw Workboard concept for Gateway-local agent work. If Workboard ids or statuses become primary PM fields, Opzava's bounded contexts collapse into OpenClaw's runtime model.

## Decision

Use Opzava Postgres as the system of record for all Opzava domain data. Each bounded context owns its write model, tables, migrations, events, repositories, and read models inside its package. Other contexts may reference stable shared-kernel ids, consume published events, or call application services and ports; they must not share tables, Drizzle query builders, or private aggregate state.

The Opzava bounded-context map is:

- Identity & Access owns users, organizations, memberships, invitations, sessions, audit principals, authentication state, and human access policy.
- Tenant Provisioning and Platform-Ops own tenant lifecycle, provisioning jobs, `GatewayInstance` records, runtime leases, host placement, route health, and operational repair/deprovisioning state.
- Project Management owns human projects, generic project boards, `pm.Card`, comments, assignments, approvals, SLA/customer-impact fields, and PM read models.
- Internal Collaboration owns internal channels, DMs, threads, messages, mentions, reactions, read cursors, chat ordering, and durable chat history.
- AI Workforce owns agent employees, personas, delegation policy, `AgentDispatch`, employee-to-project/workspace mapping, and Opzava-side agent work status.
- Knowledge Management owns Opzava knowledge sources, ingestion jobs, document metadata, source-file refs, retrieval policy, and projected index status.
- CRM and External Channels own Opzava customer/account/contact/deal/ticket/timeline records and channel correlation records; OpenClaw remains the runtime owner of connected channel state and credentials.
- Department Workflows owns workflow definitions, workflow runs, run steps, approvals, generated content lifecycle, reports, and workflow audit.
- Finance and Billing own plans, subscriptions, invoices, usage meters, entitlement state, quota policy, dunning, and metering receipts.
- Notifications/Admin-Observability owns human-visible notifications, operational `Incident`/`ErrorGroup` aggregate identity and lifecycle, error events, remediation actions, alert routes, integration correlation, and Incident projections used by administrative observability views.
- Runtime-Control owns Opzava policy for runtime commands, approvals, steering, aborts, and Gateway operation admission, while executing runtime effects only through ADR-003.

OpenClaw-owned runtime contexts are reachable only through `OpenClawGatewayPort` implemented by the ADR-003 `gateway-broker` ACL:

- Gateway Runtime: agent sessions, runs, task ledger, transcripts, artifacts, runtime logs, diagnostics, health, and usage/cost snapshots.
- Channel Runtime: Slack, Gmail, WhatsApp, chat, mail, and other channel connectivity, Gateway-local channel state, and channel credentials.
- Automation Runtime: cron, heartbeat, standing orders, wake flows, task-flow execution, and runtime scheduling.
- Workboard Runtime: Gateway-local `workboard.Card` and agent-work board lifecycle.
- Skills and Memory Runtime: installed skills, skill lifecycle, memory-lancedb active slot, memory-wiki companion, and Gateway-local memory state.
- Gateway Config/Secrets Runtime: Gateway-local config, pairing material, provider credentials, channel secrets, auth profiles, and SecretRef resolution.

Use hybrid CQRS.

Durable UI data is projected into Postgres read models:

- agent-run summaries
- session index
- task and Workboard lifecycle summaries
- activity feed entries
- assistant completion summaries
- sanitized runtime errors and incident sources
- usage/cost aggregates
- approval and command outcome summaries
- notification and mention inbox state
- billing/provisioning lifecycle observations

These read models are fed by Opzava domain events, ADR-003 Gateway WS server-push events, broker reconciliation, and scheduled OpenClaw RPC snapshot reads such as session, task, Workboard, diagnostics, logs, health, and usage queries. Projectors are owned by the bounded context that owns the read model, and each projector records a tenant-scoped checkpoint or high-water mark where the source provides one.

Heavy, live, or ephemeral runtime data is read through the broker from OpenClaw on demand:

- token streaming
- active run tail
- transient logs
- transcript detail and preview windows
- steering, abort, and immediate status waits
- large artifact inspection
- Gateway-local runtime diagnostics that are not needed as durable UI lists

Never read OpenClaw SQLite files, Gateway state directories, or Gateway-local secret/config stores directly. The ACL is the only OpenClaw integration boundary.

The load-bearing invariant is:

- Postgres projections are rebuildable caches, not runtime truth.
- OpenClaw RPC snapshots are truth for OpenClaw-owned runtime state.
- OpenClaw WS events are hints that trigger projection updates and reconciliation.
- The command path is write-through: when Opzava sends a command through ADR-003 and receives the synchronous request/response result, the application applies that result immediately to the relevant write model or read model in the same user-visible path where required.

Use a transactional outbox behind `EventBusPort`. Any Opzava transaction that changes domain state and needs downstream fan-out writes its domain event or integration event into the same Postgres transaction. The first adapter is Postgres outbox plus `LISTEN/NOTIFY`; workers consume the durable outbox table, dispatch events, update projection checkpoints, and use notifications only as wake-up signals. Online fan-out uses `EventBusPort` into `LISTEN/NOTIFY`, then Redis pub/sub as the WS backplane for the ADR-009 realtime hub. Redis is not the durable event log.

Keep `pm.Card` and `workboard.Card` separate. `AgentDispatch` is the bridge aggregate in Opzava. It records the human intent, actor, target `pm.Card` or workflow step, idempotency key, dispatch policy, and opaque OpenClaw refs such as Workboard card ref, task ref, run ref, session key, approval ref, and channel/thread refs as value objects. These refs are cross-references, never foreign keys and never PM identity. Runtime lifecycle changes project back into Opzava as agent-work status on the human card, workflow step, activity feed, notification, or incident, not as ownership of the OpenClaw Workboard entity.

## Consequences

OpenClaw Gateway downtime does not make core Opzava domain data unavailable. Users can still load projects, PM boards, CRM records, chat history, incidents, billing state, audit history, and the last projected runtime status from Postgres. Live runtime panels degrade to broker read-through errors such as `GatewayUnavailable`, `CircuitOpen`, `ScopeDenied`, or `ProtocolMismatch`.

Projection correctness is eventual and idempotent by design. Event loss, duplicate delivery, and out-of-order delivery are expected sad paths. Every projector must deduplicate by a stable event id or source idempotency key, guard tenant id and source route, tolerate repeats, ignore stale versions, and reconcile from OpenClaw RPC snapshots when sequence gaps, reconnects, missed notifications, or unknown event families appear.

`LISTEN/NOTIFY` and Redis are latency tools, not correctness tools. A missed notification must only delay processing; it must not lose an event. Outbox polling, checkpoints, replay, and projection rebuild jobs are required architecture, not operational extras.

Read-your-writes is handled on the command path, not by hoping the async projector wins a race. Commands that need immediate UI feedback apply the synchronous ADR-003 response result directly to the relevant read model or return a response DTO with the confirmed state. The async projector may later replay the same result and must treat it as idempotent.

Projection rebuilds are routine. A bounded context can drop and rebuild its read models from its own write model events plus OpenClaw snapshot reconciliation without changing domain truth. Rebuild tooling must not call Gateway storage directly and must respect ADR-003 tenant routing, scope negotiation, throttling, and circuit breakers.

OpenClaw orphaned refs are a first-class invariant. An `AgentDispatch` may point at an OpenClaw task/run/session/Workboard ref that later disappears because of Gateway deprovisioning, retention, purge, plugin disablement, or reconciliation drift. That does not delete or rewrite the owning `pm.Card`, workflow step, incident, audit record, or billing receipt. It marks the dispatch projection as `MissingRuntimeRef`, `PurgedRuntimeRef`, `GatewayDeleted`, or equivalent terminal/degraded state and creates a repair or incident path when user-visible action is needed.

Cross-tenant isolation depends on projection writers using the tenant bound to the ADR-003 broker connection or Opzava outbox envelope, not any tenant-looking value inside OpenClaw payloads. A projection event from one tenant Gateway must never update another tenant's read model, even if the payload includes malformed or stale identifiers.

This adds worker and schema discipline. Each context needs event schemas, outbox receipts, projector idempotency, replay paths, checkpointing, stale-read UX, and reconciliation jobs. The benefit is that dashboards, search, Incident and Dev Board projections, usage views, and chat fan-out do not turn tenant Gateways into query backends.

## Alternatives

Use a pure read-through proxy where Opzava stores only human write models and queries OpenClaw live for every runtime-facing UI. Rejected because dashboards, PM boards, Incident and Dev Board projections, usage/cost views, session indexes, and notifications need low-latency, searchable, tenant-filtered, durable UI state even when a Gateway is starting, suspended, down, circuit-broken, or being deprovisioned. Pure read-through would make OpenClaw a hot query backend for product screens and would couple user experience to Gateway availability.

Make Opzava Postgres the system of record for OpenClaw runtime state by copying sessions, runs, transcripts, Workboard cards, channel state, memory, skills, logs, and usage into normalized Opzava tables. Rejected because it would duplicate OpenClaw ownership, create two runtime truths, expand secret/config blast radius, and force Opzava to chase Gateway protocol and storage semantics instead of using the ACL.

Unify `pm.Card` and `workboard.Card` into one card aggregate. Rejected because human project-management work and Gateway-local agent work have different lifecycles, identities, authorization, retention, and ownership. A unified aggregate would turn the optional Workboard runtime into core PM storage and leak OpenClaw refs into Opzava primary identity.

Use Redis pub/sub as the event bus. Rejected because Redis does not provide the durable transaction boundary, replay, or rebuild guarantees required for billing, provisioning, incident projection, audit, and PM/chat consistency. Redis remains the online fan-out backplane behind `RealtimeTransportPort`, fed by durable Postgres outbox events.

Let bounded contexts call OpenClaw directly for their own projections. Rejected because ADR-003 centralizes OpenClaw protocol drift, tenant routing, scopes, idempotency, backpressure, and opaque refs inside the `gateway-broker`. Projection rebuilds and live reads must use the same ACL as product commands.

## Related ADRs

- ADR-001: Monorepo, DDD module structure, and locked stack.
- ADR-002: Pure-per-tenant tenancy, `GatewayRuntimePort`, and provisioning saga.
- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-008: AI Workforce, delegate agents, personas, and `AgentDispatch`.
- ADR-009: Realtime WS hub, internal chat, assistants-in-chat, PWA/Web Push.
- ADR-012: Department workflow engine, approvals, content pipeline, reports.
- ADR-013: Error-to-admin-card incident pipeline and remediation loop.
- ADR-014: Billing, usage metering, plan enforcement, and dunning lifecycle.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).

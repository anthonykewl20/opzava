# ADR-003: gateway-broker ACL, two-token model, and WS protocol client

Status: Accepted

> Current-context note (2026-07-15): CRM references in this retained decision mean the deferred CRM rebuild, which returns only with the future user-side dashboard (GitHub issue #200).

Opzava will put all hot-path OpenClaw runtime access behind a separate long-lived Node `gateway-broker` service. The broker is the single hot-path ACL and anti-corruption layer to OpenClaw, uses one WS-first scoped operator client per active tenant Gateway, and enforces a two-token model: a hot-path paired device token with `operator.write` + `operator.approvals`, plus a separate short-lived JIT `operator.admin` provisioning credential used only by the provisioning worker through the audited admin/JIT ACL.

## Context

ADR-001 establishes `apps/gateway-broker` as a separate service and requires OpenClaw Gateway types to stay behind an anti-corruption layer. ADR-002 establishes pure-per-tenant runtime topology: every Opzava tenant has exactly one OpenClaw Gateway instance, and the Gateway is not Opzava's user, tenant, RBAC, billing, or data-of-record boundary.

OpenClaw's Gateway WS protocol is the native control plane. It uses request/response frames with request ids, requires idempotency keys for side-effecting methods, and sends server-push events for session, cron, approval, lifecycle, and plugin activity. The same protocol negotiates role and scopes at handshake time and reports the server's supported methods, events, protocol version, and policy limits.

OpenClaw operator scopes are a guardrail inside one trusted Gateway operator domain, not hostile multi-tenant isolation. `operator.write` satisfies normal read needs and mutating runtime operations. `operator.approvals` is required for exec/plugin approval APIs. `operator.admin` satisfies every operator scope and is required for config mutation, updates, sensitive reserved namespaces, skill install/update/upload, high-risk approvals, and other tenant-admin surfaces. Shared-secret HTTP paths are too broad for Opzava's hot path because shared-secret bearer auth restores the normal full operator defaults on HTTP compatibility surfaces.

The Q3 consensus split on outbound command transport: one recommendation preferred WS for both commands and events, while another preferred WS events plus HTTP commands. Opzava chooses WS-first because the Gateway protocol is already the single control plane, because the broker must hold persistent event sockets anyway, and because one command/event transport gives one place for scope negotiation, protocol drift handling, backpressure, idempotency, reconnect, and per-tenant circuit breaking.

Q4 and Q4b add two related constraints. First, OpenClaw owns runtime capabilities such as sessions, runs, streaming, channels, cron, approvals, skills, memory/wiki, logs, diagnostics, usage, and Workboard; Opzava owns tenant policy, PM/CRM/workflow truth, audit, projections, and RBAC. Second, runtime control and provisioning must not share one broad credential. The hot path needs normal runtime write and approval capability, while provisioning and platform-ops need admin capability only for audited, out-of-band setup, repair, and teardown work.

## Decision

Use a separate long-lived Node `gateway-broker` service as the only hot-path ACL from Opzava applications to OpenClaw Gateway. Browser clients, Next.js route handlers, server actions, domain packages, and workers outside the provisioning path do not call OpenClaw directly; they call Opzava application services or broker-facing ports, and the broker translates those requests into OpenClaw protocol operations. The provisioning worker owns the audited admin/JIT ACL: it calls OpenClaw only out of band from the hot path, using the separate short-lived `operator.admin` credential for admin-only config writes and other provisioning operations described below.

The broker owns the OpenClaw anti-corruption layer:

- It exposes Opzava-named commands, queries, events, DTOs, opaque refs, and error types through `OpenClawGatewayPort`.
- It translates OpenClaw Gateway method names, frame shapes, status codes, event families, scope errors, and protocol versions into Opzava contracts.
- It keeps OpenClaw-owned identifiers as opaque value objects such as session refs, task refs, run refs, Workboard refs, channel refs, gateway refs, and approval refs.
- It prevents OpenClaw Gateway DTOs, provider SDK objects, channel secret payloads, Gateway-local config shapes, and raw WS frames from leaking into bounded-context packages or the web app.
- It applies Opzava authorization before any Gateway command is admitted. OpenClaw scope checks are a second gate, not the source of Opzava tenant/user authorization.

The broker owns a durable tenant-to-Gateway routing table. Each route binds one tenant to one `GatewayInstance` from ADR-002 and includes at least:

- `tenant_id`
- `gateway_instance_id`
- runtime and host location
- Gateway endpoint and port
- expected Gateway identity or TLS fingerprint
- lifecycle/routability state
- protocol compatibility floor/ceiling
- approved runtime scope contract
- vault reference to the hot-path broker device token
- rotation, health, and last-success metadata

Routing is tenant-derived, not caller-supplied. The broker accepts an authenticated Opzava request context, resolves the tenant through Opzava membership/RBAC and the ADR-002 `GatewayInstance`, and then selects the route. It never trusts a `tenant_id`, Gateway endpoint, agent id, session key, or OpenClaw ref supplied by the browser or by an untrusted caller as proof of routing authority. The cross-tenant isolation invariant is: one broker connection maps to exactly one tenant Gateway, and every command/event handled on that connection is tagged and authorized as that tenant before it can update a projection, emit realtime fan-out, or return to a caller.

> **Conformance note (2026-07-18, per ADR-018 / #194).** The as-built broker realizes the invariant above by a weaker mechanism than the paragraph literally describes: it is pinned to exactly one tenant (`OPENCLAW_GATEWAY_TENANT_ID`) and rejects any caller-supplied `tenantId` that disagrees, rather than resolving the tenant through membership/RBAC and a `GatewayInstance` lookup (it holds no database credential to do so). Under today's pure-per-tenant topology (one static Gateway and one broker per tenant, ADR-002), config-pinned single-tenant routing is the **accepted realization** of this invariant — the isolation guarantee holds by construction. The "resolve through membership/RBAC + `GatewayInstance`" mechanism remains the **target** for the deferred multi-tenant/dynamic-provisioning future, at which point the DB-access question (ADR-001/ADR-003 level) must be decided. ADR-018 additionally narrows the acting-principal to the single field the broker verifies — `tenantId` — and deletes every other identity field (`sessionId`, `orgId`, `workspaceId`, `userId`, `roleKeys`) from the boundary; no unverified identity is accepted or carried, and turn correlation uses the Opzava-generated `turnId`.

Use a WS-first operator protocol client. For each active tenant Gateway, the broker lazily opens one scoped operator WebSocket when demand appears, sends the required `connect` request with its broker device identity and scopes, and uses that socket for both request/response commands and server-push events. Side-effecting broker calls carry idempotency keys derived from the Opzava command id, outbox message id, provisioning job id, approval id, workflow run id, or caller-provided client idempotency key after tenant scoping. The broker deduplicates responses and maps retryable `UNAVAILABLE`, timeout, duplicate, and protocol errors into Opzava error categories.

The broker manages the connection lifecycle:

- Lazy-connect active tenants on first command, subscription, projection catch-up, or scheduled reconciliation.
- Idle-disconnect dormant tenants after the configured quiet window without changing tenant lifecycle state.
- Use per-tenant reconnect budgets, exponential backoff with jitter, startup-sidecar retry handling, health probes, and circuit breakers.
- Isolate connection failure by tenant so one bad Gateway, bad token, large event burst, or reconnect loop cannot starve healthy tenants.
- Track event sequence/checkpoint state where the Gateway provides it and reconcile from OpenClaw snapshots because ADR-004 treats WS events as hints and snapshots as truth.
- Enforce payload and buffered-byte limits from `hello-ok.policy`, shed non-critical subscriptions under pressure, and fail closed on unknown event families or scope drift.

Use the two-token model.

The hot-path broker credential is a per-Gateway paired device token for one Opzava broker identity. It requests only `operator.write` + `operator.approvals`. This token is used for normal runtime work: sessions, agent chat, task/run control, logs/status/usage reads, cron/runtime mutation, channel send/receive operations that OpenClaw exposes through write-scoped methods, and resolving exec/plugin approvals that Opzava policy has already admitted. The hot-path token must not include `operator.admin`, `operator.pairing`, or `operator.talk.secrets`.

The admin/provisioning credential is a separate short-lived JIT `operator.admin` credential scoped to one Gateway and one provisioning, repair, migration, incident-remediation, or teardown job. It is minted or fetched only by the tenant-provisioning/platform-ops worker, used out of band from request handlers and the hot broker command path, audited with actor/job/blast-radius/idempotency metadata, and revoked or allowed to expire after the job completes. It is used for admin-only OpenClaw operations such as pairing bootstrap, config writes, agent/workspace/skill provisioning, sensitive Gateway repair, tenant erasure hooks, and deprovisioning.

Split credentials by ownership. Channel secrets, provider credentials, OAuth material, Talk secrets, and other OpenClaw-owned runtime secrets stay inside each tenant Gateway and its configured SecretRef/auth stores. Opzava stores only reachability metadata, opaque runtime refs, approved scope contracts, and vault references to broker/provisioning credentials. No Opzava Postgres table stores Slack, WhatsApp, Gmail, model-provider, Talk, or Gateway shared-secret values.

Keep Admin HTTP RPC as an ops fallback only. The Admin HTTP RPC plugin may be enabled for trusted host tooling on loopback, tailnet, or private ingress when WS is unavailable or when a break-glass remediation explicitly requires it. It is not the product command path, not exposed to browsers, not used by ordinary BFF handlers, and not allowed to bypass Opzava authorization, job audit, tenant routing, or the two-token split.

## Consequences

The `gateway-broker` becomes a load-bearing isolation and protocol boundary. All OpenClaw protocol drift, scope negotiation, retry semantics, opaque refs, streaming, backpressure, token rotation, Gateway route health, and OpenClaw-to-Opzava projection ingest concentrate in one service.

Cross-tenant isolation depends on the broker route and connection invariant. A socket is never shared across tenants, a Gateway route is never selected from untrusted caller input, and every incoming server-push event is accepted only on the tenant connection that produced it. Projection writers, realtime fan-out, audit rows, and outbox consumers must use the tenant bound to the broker connection, not any tenant-looking value inside the OpenClaw payload.

The web app and bounded contexts stay stateless with respect to Gateway sockets. They can scale independently, while the broker handles persistent file descriptors, reconnect storms, event backpressure, and lazy connection pools.

The main sad path is file-descriptor and reconnect pressure. A Gateway fleet deploy, network incident, token rotation bug, or sidecar startup delay can create many simultaneous reconnecting sockets. The broker must cap concurrent dials, jitter reconnects, apply per-tenant circuit breakers, protect the process FD budget, shed non-critical event subscriptions, and surface degraded tenant state instead of letting one tenant or host exhaust the broker.

The two-token model reduces the blast radius of the hot path. A compromised runtime broker token can drive normal write-scoped Gateway behavior and approval APIs for one tenant Gateway, but it cannot mutate Gateway config, install skills, manage pairing, read Talk secrets, or perform admin-only provisioning work. A compromised admin credential is still severe, so it is short-lived, per-Gateway, job-scoped, audited, and kept out of request handlers.

OpenClaw channel and provider credentials are not duplicated into Opzava. This avoids making Opzava Postgres a second secret store, but it means broker operations that need secret-bearing config must go through OpenClaw's own admin/provisioning path and must tolerate Gateway-local secret resolution failures.

Some command paths become asynchronous or degraded when the tenant Gateway is down, suspended, starting, or circuit-broken. Runtime-Control, AI Workforce, Department Workflows, External Channels, CRM, and Platform-Ops must handle `GatewayUnavailable`, `GatewaySuspended`, `ScopeDenied`, `ProvisioningRequired`, `ProtocolMismatch`, `IdempotencyConflict`, and `CircuitOpen` as first-class outcomes.

## Alternatives

Expose OpenClaw directly to the web app or domain packages. Rejected because OpenClaw is not Opzava's multi-tenant authorization boundary, not Opzava's data-of-record store, and not a stable bounded-context contract. Direct calls would leak Gateway DTOs, scope semantics, and protocol drift into product code.

Use Next.js route handlers as the OpenClaw client. Rejected because the product needs long-lived WebSockets, lazy per-tenant connection pools, event ingestion, reconnect/backoff, circuit breakers, FD-budget management, and stream fan-out. The BFF should remain stateless and call the broker over an internal interface.

Use Admin HTTP RPC for normal product commands and WS only for events. Rejected for the hot path because it creates two command/event semantics, depends on a default-off trusted-host plugin, and pushes command authorization toward broad HTTP operator surfaces. Admin HTTP RPC remains valid as an ops/break-glass fallback when it is private, audited, tenant-scoped, and mediated by the same Opzava policy/job controls.

Use one broad `operator.admin` token for the broker. Rejected because every chat, workflow, CRM, support, and assistant request would inherit config mutation, pairing, skill install, and sensitive admin authority. The hot path only needs `operator.write` + `operator.approvals`; admin authority belongs to audited provisioning and platform-ops jobs.

Store tenant channel/provider secrets in Opzava. Rejected because channel connectivity and runtime credential resolution are OpenClaw-owned capabilities inside each tenant Gateway. Duplicating secrets into Opzava would expand blast radius and create two sources of secret truth. Opzava stores vault refs and reachability metadata only.

Create individual OpenClaw operator identities for every Opzava user. Rejected because Opzava RBAC is the real authorization model and OpenClaw scopes are per-Gateway operator-domain guardrails. The broker uses one scoped operator identity per tenant Gateway and carries the acting Opzava user as signed attribution/audit metadata.

## Related ADRs

- ADR-001: Monorepo, DDD module structure, and locked stack.
- ADR-002: Pure-per-tenant tenancy, `GatewayRuntimePort`, and provisioning saga.
- ADR-004: Data model boundary, hybrid CQRS, outbox, and projections.
- ADR-005: Tool-policy-first security, approval gates, and sandbox posture.

## Amendment (ADR-019 alignment)

This amendment clarifies the hot-path-versus-admin/JIT distinction to resolve the textual tension
with the provisioning worker's `operator.admin` path. The `gateway-broker` remains the only hot-path
ACL, while the provisioning worker owns the audited admin/JIT ACL. This aligns with ADR-019's
provisioning modularization decision and unblocks issue #163's shared `@opzava/openclaw-wire`
package without changing the two-token architecture.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).

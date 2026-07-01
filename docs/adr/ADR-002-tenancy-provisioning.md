# ADR-002: Pure-per-tenant tenancy, GatewayRuntimePort, and provisioning saga

Status: Accepted

Opzava will run exactly one OpenClaw Gateway per tenant from day one, with no shared Gateway pool. Tenant onboarding and runtime lifecycle are owned by a compensating provisioning saga, and Gateway execution is abstracted behind `GatewayRuntimePort` so the default rootless-Docker implementation can later move to K8s or Nomad without changing the tenant model.

## Context

ADR-001 establishes OpenClaw Gateway as a private backend-only AI runtime dependency, not Opzava's user, tenant, RBAC, billing, or data-of-record boundary. The Gateway is still where OpenClaw-owned runtime capabilities live: agent sessions, channels, cron, skills, memory/wiki, usage, diagnostics, and Workboard projections reached through the `gateway-broker` ACL.

The Q2 consensus memos recommended a hybrid topology: a shared Gateway for low-sensitivity sandboxes and dedicated Gateways for credentialed tenants. Opzava rejects that hybrid for the product foundation. The user-selected posture is stricter pure-B tenancy: one tenant, one Gateway, one operational path. This is more expensive to orchestrate than a shared pool, but it keeps tenant isolation uniform and avoids policy drift where a credentialed tenant accidentally remains on shared runtime.

Q12 locks billing, onboarding, and Gateway provisioning into the same lifecycle problem. A tenant must not become active until billing entitlement, the Opzava tenant/org record, Gateway runtime, admin pairing, broker token storage, default department/agent seed data, and channel connect wizard are all coordinated. The hardest failure mode is an orphaned Gateway: billing or entitlement is gone, but a container keeps running with state, channel credentials, CPU usage, and possible spend.

This decision is a foundation for ADR-003, which owns the broker ACL, routing, token split, and runtime RPC protocol, and ADR-014, which owns billing, plan enforcement, metering, dunning, and entitlement policy.

## Decision

Use pure-per-tenant Gateway tenancy: every Opzava tenant has exactly one OpenClaw Gateway instance. There is no production shared Gateway pool, no free-tier shared Gateway path, and no code path that routes two tenants into the same Gateway runtime.

The `tenant-provisioning` bounded context owns the tenant-to-Gateway lifecycle through a `ProvisioningJob` aggregate. The job is a compensating saga orchestrated by the admin/provisioning platform worker, not by the web request path and not by the hot `gateway-broker`.

The default provisioning flow is:

1. Accept signup and create the tenant plus owner organization.
2. Attach or reserve the plan entitlement.
3. Reserve Gateway config, state, workspace, base port, and derived port range.
4. Create a `GatewayInstance` row for the tenant.
5. Start the Gateway runtime through `GatewayRuntimePort`.
6. Wait for health/readiness.
7. Bootstrap admin-token pairing using a short-lived, per-Gateway `operator.admin` credential.
8. Store the broker runtime token reference for the ADR-003 `operator.write` + `operator.approvals` path.
9. Seed default departments, agent employees, ACL policy, and initial runtime configuration.
10. Open the channel connect wizard.
11. Mark the tenant `Active`.

Every step is idempotent on `{tenant_id, provisioning_job_id}` and writes an outbox receipt. Every step has a compensating action: release ports, remove config/state/workspace directories, kill the runtime, revoke pairing material, delete seeded OpenClaw config, cancel or refund billing setup, and tombstone failed tenant records where required.

Define `GatewayRuntimePort` as the capability port for provisioning, starting, stopping, health-checking, suspending, resuming, and deprovisioning tenant Gateway instances. The first adapter is rootless Docker:

- One rootless Docker container per tenant.
- One OpenClaw Gateway process per container.
- Lazy-start `Active` tenants on first broker demand.
- Idle-stop quiet tenants after the configured idle window while preserving mounted state.
- Bin-pack containers across lean VPS hosts by CPU, RSS, disk, and port range, targeting roughly 50+ dormant/light tenants per VPS before adding hosts.
- Use image caching and private loopback or overlay reachability for broker-only access.

Keep K8s and Nomad as later adapters behind the same port. `GatewayInstance.runtime` is an enum with at least `docker`, `k8s`, and `nomad`; adding an adapter changes infrastructure composition and scheduler policy, not the domain lifecycle.

Each `GatewayInstance` records the routing and isolation material needed by ADR-003:

- `tenant_id`
- `runtime`
- `host`
- `gateway_port`
- derived browser/CDP/runtime port range
- `tls_sha256` or equivalent reachability fingerprint
- `OPENCLAW_CONFIG_PATH`
- `OPENCLAW_STATE_DIR`
- workspace path
- runtime status
- provisioner lease expiry

Per-instance isolation is mandatory. Each tenant Gateway gets a distinct `OPENCLAW_CONFIG_PATH`, `OPENCLAW_STATE_DIR`, workspace root, `gateway.port`, and derived browser/CDP/runtime ports. OpenClaw-owned channel secrets and runtime state stay inside that tenant Gateway's isolated config/state/workspace material; Opzava stores only reachability metadata and secret references required by the broker and provisioner.

## State machine

`tenant.lifecycle_state` is the single source of truth for the tenant runtime lifecycle:

```text
Provisioning -> Active -> Suspended -> Deprovisioning -> Deleted
```

`Provisioning` means a `ProvisioningJob` may create or repair tenant, billing, Gateway, broker, and seed-data resources. Users do not receive normal product access yet.

`Active` means the tenant has a valid entitlement, one valid `GatewayInstance`, and may lazy-start or use the Gateway through the broker.

`Suspended` means the tenant record and data remain present but runtime starts, broker command admission, channel sends, and agent dispatch are blocked. Dunning from ADR-014 enters this state and keeps the data-grace window open.

`Deprovisioning` is irreversible. The provisioner must stop runtime, revoke Gateway tokens, cancel or finalize billing, purge Gateway config/state/workspace/auth-profile material, trigger required GDPR/OpenClaw purge workflows, release ports, and emit tombstone events.

`Deleted` means no runtime, entitlement, active tenant access, broker route, or recoverable Gateway state remains. Any future signup for the same customer is a new tenant lifecycle, not a resurrection of the old Gateway instance.

Retry, failure, rollback, and compensating-step status belong to `ProvisioningJob`, not to extra tenant lifecycle states. State transitions use an `updated_at` guard and outbox events so workers, broker routing, billing, and reapers observe the same lifecycle changes.

## Consequences

This creates one tenancy path and one isolation story. The application never has to decide whether a tenant is on shared or dedicated runtime; every broker route resolves tenant to exactly one Gateway instance.

The cost is operational surface area. Even with lazy-start and idle-stop, Opzava must manage a Gateway fleet: port allocation, leases, health checks, host capacity, upgrades, evacuation, suspend/resume, deprovisioning, and reapers.

The anti-orphan invariant is load-bearing: no container may run unless all of these are true at the same time:

- The tenant has an active runtime entitlement.
- `tenant.lifecycle_state = Active`.
- A non-deleted, valid `GatewayInstance` exists for that tenant.
- The runtime has a live provisioner lease.
- The runtime's observed config path, state dir, workspace, and ports match the `GatewayInstance` row.

`GatewayInstance.tenant_id` is unique. `(state_dir, workspace_path, gateway_port, derived_port_range)` is unique. Reservation and lifecycle transitions use Postgres advisory locks so two provisioning jobs cannot allocate the same tenant, directory, or port range.

The reaper is part of the architecture, not an ops script. It periodically compares running containers against tenant lifecycle, entitlement, `GatewayInstance`, and lease records. Anything without a valid owner is stopped, quarantined if needed for forensic review, and recorded through a compensating outbox event.

`Suspended` must fail closed. Broker start, command admission, channel send, agent dispatch, workflow publish, and provisioning repair all re-check entitlement and lifecycle before touching runtime. Existing mounted state is retained only for the grace period defined by ADR-014.

`Deprovisioning` must be idempotent and resumable. A crash after `container.kill` but before `state_dir.rm`, or after Stripe cancellation but before Gateway purge, leaves a `ProvisioningJob` step to resume; it must not require manual shell cleanup as the normal path.

## Alternatives

Use a shared Gateway for all tenants. Rejected because OpenClaw Gateway is not Opzava's hostile multi-tenant isolation boundary. Shared runtime would combine tenant channel credentials, memory, workspace state, runtime ports, and operator surfaces in one failure domain.

Use the consensus hybrid model: shared Gateway for free or no-credential tenants, dedicated Gateway for paid or credentialed tenants. Rejected for the foundation because the most likely failure is policy drift: a tenant connects real credentials but remains on shared runtime. Pure-per-tenant is more operationally expensive but removes that class of mistake and keeps the broker, billing, support, and incident paths uniform.

Provision Gateways manually or through ad hoc ops scripts. Rejected because billing, GDPR deletion, dunning, broker routing, runtime leases, token revocation, and default agent seed data are one cross-context lifecycle. They need an idempotent saga and durable compensating state.

Make Kubernetes or Nomad the required first runtime. Rejected for lean VPS operations. Rootless Docker gives the cheapest first adapter and matches the one-Gateway-per-tenant model. K8s and Nomad remain valid `GatewayRuntimePort` adapters when host count, evacuation, or scheduling pressure justifies them.

Keep Gateway runtime state only in Docker labels or scheduler metadata. Rejected because Opzava needs a durable system-of-record row for tenant routing, lifecycle invariants, billing suspension, incident response, advisory-lock reservations, and deprovisioning recovery.

## Related ADRs

- ADR-001: Monorepo, DDD module structure, and locked stack.
- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-014: Billing, usage metering, plan enforcement, dunning, and entitlement lifecycle.

---
> **Validate against official docs before implementing.** Training knowledge is a starting point, not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor docs. See `CLAUDE.md` (Official-docs rule).

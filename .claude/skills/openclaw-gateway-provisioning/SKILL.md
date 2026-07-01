---
name: openclaw-gateway-provisioning
description: Provision/deprovision per-tenant OpenClaw Gateway containers safely — GatewayRuntimePort, mutation-scoped docker-socket-proxy, Traefik labels, the lifecycle saga, and the anti-orphan reaper. Use for the worker-provisioning service.
---

# openclaw-gateway-provisioning

Opzava is **pure per-tenant**: ONE OpenClaw Gateway container per tenant, created by the **`worker-provisioning`** service
(the admin/provisioning context) via the `GatewayRuntimePort`. Authoritative: **ADR-002 + ADR-015**.
Read `docs/openclaw/gateway/multiple-gateways.md` (isolation checklist) first.

## When to use
Building/changing the provisioning worker, the `GatewayRuntimePort` docker adapter, the per-tenant Gateway lifecycle, or Traefik routing for tenant Gateways.

## Rules (non-negotiable)
- **Docker access ONLY via a mutation-scoped `tecnativa/docker-socket-proxy`** (allow container + network create/start/stop/remove + network connect; **DENY** image push, host bind-mounts, privileged, arbitrary exec). The worker **NEVER mounts `/var/run/docker.sock`**. A CI lint asserts the socket appears nowhere but the proxy.
- **Only the provisioning worker provisions** (JIT `operator.admin`); the broker never does.
- **Per-instance isolation:** unique `OPENCLAW_CONFIG_PATH`, `OPENCLAW_STATE_DIR`, workspace, and `gateway.port` (+derived ports) per tenant.
- **Traefik labels baked into each container:** `traefik.enable=true`, `Host(t-<id>.<domain>)`, `loadbalancer.server.port=18789`, joined to the shared **`dokploy-network`**. Traefik's **Docker provider must be enabled** (plain containers) — see the `dokploy` skill for live parity.
- **Provisioning SAGA (`ProvisioningJob`):** create tenant → reserve ports → start container → wait `health` → bootstrap admin-token pairing → seed → attach plan → channel wizard. **Idempotent** (keyed by `tenant_id`) + **compensating**. Lifecycle `Provisioning→Active→Suspended→Deprovisioning→Deleted`.
- **Anti-orphan invariant:** no container runs without **Active entitlement + valid GatewayInstance + live lease**; `tenant_id` UNIQUE and `(state_dir, ports)` UNIQUE via DB advisory locks. **Deprovision/suspend = ONE transaction** that removes the Traefik route + kills the container + revokes entitlement; a **reaper** sweeps violators. Lazy-start / idle-stop; bin-packed.
- **Local == Dokploy:** the same `GatewayRuntimePort` adapter runs both; only the Docker endpoint differs.

## References
ADR-002, ADR-015, ADR-003 · `docs/openclaw/gateway/multiple-gateways.md`, `cli/gateway.md`, `docs/openclaw/install/docker.md` · skills `dokploy`, `docker`, `opzava-conventions`.

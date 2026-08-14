---
name: openclaw-gateway-provisioning
description: Provision/deprovision per-tenant OpenClaw Gateway containers safely — GatewayRuntimePort, mutation-scoped docker-socket-proxy, Traefik labels, the lifecycle saga, and the anti-orphan reaper. Use for the worker-provisioning service.
---

# openclaw-gateway-provisioning

> **STATUS (2026-08-14):** The dynamic per-tenant provisioning described below (ProvisioningJob saga, GatewayInstance registry, lifecycle calls, Traefik labels, reaper) is **deferred future spec** per ADR-002/Q18 — do not treat it as current. Canonical runtime today: the static `openclaw-platform-gateway` Compose service from `mainframe/`. The docker-socket-proxy **does enable EXEC**: the retained onboard/doctor path execs into the static container. `spike/` and `docs/plan/consensus/` references are historical.

Opzava is **pure per-tenant**: ONE OpenClaw Gateway container per tenant, created by the **`worker-provisioning`** service
(the admin/provisioning context) via the `GatewayRuntimePort`. Authoritative: **ADR-002 + ADR-015**.
Read `docs/openclaw/gateway/multiple-gateways.md` (isolation checklist) first.

## When to use
Building/changing the provisioning worker, the `GatewayRuntimePort` docker adapter, the per-tenant Gateway lifecycle, or Traefik routing for tenant Gateways.

## Rules (non-negotiable)
- **Docker mutation ONLY via a mutation-scoped `tecnativa/docker-socket-proxy`** (allow container + network create/start/stop/remove + network connect; **DENY** image push, host bind-mounts, privileged, arbitrary exec). The worker **NEVER mounts `/var/run/docker.sock`**. Traefik may read `/var/run/docker.sock` directly as read-only for Docker-provider label discovery, matching Dokploy; no other app service gets Docker access.
- **Only the provisioning worker provisions** (JIT `operator.admin`); the broker never does.
- **Per-instance isolation:** unique `OPENCLAW_CONFIG_PATH`, `OPENCLAW_STATE_DIR`, workspace, and `gateway.port` (+derived ports) per tenant.
- **Traefik labels baked into each container:** `traefik.enable=true`, `Host(t-<id>.<domain>)`, `loadbalancer.server.port=18789`, joined to the shared **`dokploy-network`**. Traefik's **Docker provider must be enabled** (plain containers) — see the `dokploy` skill for live parity.
- **Provisioning SAGA (`ProvisioningJob`):** create tenant → reserve ports → start container → wait `health` → bootstrap admin-token pairing → seed → attach plan → channel wizard. **Idempotent** (keyed by `tenant_id`) + **compensating**. Lifecycle `Provisioning→Active→Suspended→Deprovisioning→Deleted`.
- **Anti-orphan invariant:** no container runs without **Active entitlement + valid GatewayInstance + live lease**; `tenant_id` UNIQUE and `(state_dir, ports)` UNIQUE via DB advisory locks. **Deprovision/suspend = ONE transaction** that removes the Traefik route + kills the container + revokes entitlement; a **reaper** sweeps violators. Lazy-start / idle-stop; bin-packed.
- **Local == Dokploy:** the same `GatewayRuntimePort` adapter runs both; only the Docker endpoint differs.

## Spike-validated refinements (2026-07-02)
Validated by a passing local spike in `spike/slice-0/` and codex+mmx review in `docs/plan/consensus/slice0-review.codex.md` and `docs/plan/consensus/slice0-review.mmx.md`:

1. Traefik reads `/var/run/docker.sock` read-only directly for label discovery. Only provisioning-worker mutation goes through the least-privilege socket proxy. The broker never touches Docker.
2. Traefik must be at least `v3.6.1` on Docker Engine 29 (`DOCKER_API_VERSION=1.44` minimum). Use the same Traefik image/version Dokploy ships.
3. Pin `DOCKER_API_VERSION=1.44` for dockerode and any Docker client; client negotiation can override env defaults.
4. Socket-proxy granularity: `exec-create` (`POST /containers/{id}/exec`) falls under `/containers`. Prove least privilege by denying `/exec` create and start and by asserting a truly denied endpoint such as `/volumes` returns `403`. The worker never needs exec.
5. Use uncommon/configurable ports and a dedicated external network, then confirm Dokploy's actual network name and default ports before implementation.

## Real-implementation de-risk follow-ups
1. Real OpenClaw operator WS handshake: `connect.challenge` nonce signing, device-token pairing, protocol v4, `operator.write` + `operator.approvals`.
2. Wildcard TLS issuance/renewal plus `*.localhost` / `*.opzava.app` DNS lifecycle and SNI.
3. Readiness/health gating plus reconnect/backoff/circuit-breaker behavior under sustained load and idle WS death.
4. Reaper concurrency with leases/fencing to avoid double-kill and orphan containers.
5. Lazy-start/idle-stop cold-start latency versus idle cost.
6. Secrets lifecycle for device tokens, TLS certs, Gateway keys, rotation, and per-tenant scoping.
7. Mapping onto Dokploy's Compose deployer while attaching to Dokploy's existing Traefik.

## References
ADR-002, ADR-015, ADR-003 · `docs/openclaw/gateway/multiple-gateways.md`, `cli/gateway.md`, `docs/openclaw/install/docker.md` · skills `dokploy`, `docker`, `opzava-conventions`.

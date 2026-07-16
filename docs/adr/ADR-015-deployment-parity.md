# ADR-015: Deployment and environment parity

Status: Accepted — AMENDED 2026-07-04 (Q18) and 2026-07-17 (Releases Gate): (1) the Platform Gateway
is a STATIC Compose service (`openclaw-platform-gateway`) built from `./mainframe`
([ADR-016](ADR-016-mainframe-tracked-fork.md)), no longer a pulled upstream image; dynamic
per-tenant Gateway containers are deferred with ADR-002. (2) The production home is the Dokploy VPS
at 5.189.186.18; `opzava.app` (wildcard DNS + Let's Encrypt) is purchased at the first live-dev
push; local compose remains the dev/verify environment — parity contract unchanged. (3) Exactly ONE
public WebSocket surface exists (browser ↔ app/broker via Traefik+LE); the gateway keeps zero public
listeners; internal legs stay plain `ws://` on `dokploy-network`. (4) The trusted Release pipeline
builds every release image once, publishes immutable OCI digests and provenance to the approved
registry, and the sealed Release Manifest makes staging and production deploy those same digests
without rebuild. Local development may still use Compose `build:` directives, but local images are
never release artifacts.

Opzava will use one canonical `docker-compose.yml` with Compose profiles as the source of truth for
both local development and live Dokploy deployment. Local runs the same stack with its own Traefik,
mkcert wildcard TLS, and local secret files; Dokploy runs the same Compose stack attached to its
existing Traefik, Let's Encrypt wildcard TLS, and Dokploy-managed secrets. V1 contains exactly one
Compose-managed `openclaw-platform-gateway`; it is the only Gateway service in the current Release
Manifest. Dynamic per-tenant Gateway containers, tenant routes, reaper enforcement, and
`GatewayRuntimePort` Docker mutation are deferred until a future multi-tenant ADR explicitly
reactivates them.

## Context

The current V1 context is the static Platform Gateway above. The remaining Q14 per-tenant context in
this section is retained as **deferred multi-tenant design evidence**, not operative V1 behavior,
current topology, or a Release Manifest requirement. Within that deferred scope, “must” describes a
future activation condition only.

ADR-001 establishes the deployable shape: `apps/web`, `apps/gateway-broker`, background workers,
Postgres, Redis-backed realtime/eventing support, object storage, and provider adapters behind
ports. ADR-002 establishes pure-per-tenant OpenClaw Gateway tenancy and defines `GatewayRuntimePort`
as the abstraction for provisioning, starting, stopping, health-checking, suspending, resuming, and
deprovisioning Gateway runtimes. ADR-003 makes the `gateway-broker` the hot-path OpenClaw ACL and
explicitly separates broker runtime access from provisioning/admin authority. ADR-014 adds
entitlement and dunning constraints to the same lifecycle: suspended or deprovisioned tenants must
not keep Gateway containers running.

Q14 locks the deployment question that sits beneath those ADRs. Opzava needs local development to
exercise the same routing, labels, service names, health checks, and Gateway reconciliation behavior
as live deployment. It also needs lean VPS operations through Dokploy without introducing a second
production topology that drifts from local Compose. The worst failure mode is not a missing route;
it is a routable orphan Gateway: a tenant container remains reachable through Traefik after
suspension, deletion, entitlement loss, or failed deprovisioning.

Dokploy already owns a production Traefik entrypoint and certificate automation. Local development
needs an equivalent Traefik path so `app`, broker WebSocket/API routes, and tenant Gateway routes
use the same Docker labels and network assumptions. Tenant Gateways are plain Docker containers
created at runtime by Opzava, not Dokploy-managed Compose services, so whichever Traefik routes them
must watch the Docker provider with `exposedByDefault=false` on the shared network.

Docker access is a host-control boundary. Provisioning must create, start, stop, remove, inspect,
and network-attach per-tenant Gateway containers, so a read-only socket proxy cannot satisfy
`GatewayRuntimePort`. At the same time, no Opzava hot-path process may mount or receive broad Docker
socket access. The broker must never touch Docker; it talks only to routable Gateways through the
ADR-003 runtime path.

## Decision

Use one canonical root `docker-compose.yml` as the deployment contract for local and Dokploy. The
file uses Compose profiles for environment-specific infrastructure, but service definitions, service
names, network names, Traefik label conventions, health checks, readiness paths, and environment
variable keys remain the same across environments.

For governed Releases, the trusted pipeline is the only release-image builder. It builds all service
images once from the immutable candidate SHA/tree and publishes immutable OCI digests with
provenance, signatures/attestations, and SBOMs. The sealed Release Manifest binds those digests plus
the Compose/deployment-contract version/hash, non-secret configuration hashes, named secret
references/versions, migrations/compatibility, and required checks. Staging and production deploy
the exact same digest bundle. Dokploy must not rebuild from a branch, tag, Compose `build:`
directive, or mutable source during promotion. A local Review build proves behavior against an exact
SHA but cannot be substituted for a release artifact.

Parity remains the shared topology, service names, labels, networks, routing assumptions,
readiness/health checks, environment-variable and secret keys, and deployment-contract semantics.
Environment endpoints, certificates, capacity, non-secret values, and secret values may legitimately
differ. Every release observation records the effective per-service digest and health from the
target environment; desired configuration or an accepted Dokploy request is not proof of deployment.

The shared external Docker network is named `dokploy-network` in both local and live environments.
Local setup creates or reuses that network and runs a `traefik` service under the `local` profile.
Dokploy runs the same Compose stack without the local Traefik profile and attaches app services to
Dokploy's existing Traefik on `dokploy-network`.

The legitimate environment drift is limited to:

- TLS issuer and certificate source: local uses mkcert wildcard certificates for `*.localhost`; live
  uses Let's Encrypt wildcard certificates for `*.opzava.app`.
- Traefik ownership: local Compose owns Traefik; live Dokploy owns Traefik unless a dedicated Opzava
  Traefik is explicitly required for tenant routing.
- replicas and resource limits.
- secret values and secret source: local `.env` or local secret files; live Dokploy secrets with the
  same keys.

All current V1 app services, including the one static `openclaw-platform-gateway`, are
Compose-managed and manifest-pinned. No current Release creates a per-tenant Gateway container or
tenant route through `GatewayRuntimePort`.

### Deferred multi-tenant Gateway decision

The following routing, container-label, socket-proxy, reaper, and `GatewayRuntimePort` requirements
apply only after a future multi-tenant ADR reactivates dynamic Gateway provisioning. They are not
current V1 deployment commands, Release services, or acceptance gates.

Use Traefik v3 labels as the routing contract. Product routes use stable router and service names
for:

- `app.${OPZAVA_DOMAIN}` for `next`.
- `broker.${OPZAVA_DOMAIN}` for `gateway-broker` HTTP and WebSocket traffic.
- `minio.${OPZAVA_DOMAIN}` only when object storage is intentionally exposed.
- `t-<tenant_id>.${OPZAVA_DOMAIN}` for each tenant OpenClaw Gateway.

`OPZAVA_DOMAIN` is `localhost` for local development and `opzava.app` for live. Wildcard TLS must
cover the tenant subdomain pattern in both environments.

Tenant Gateway containers must join `dokploy-network` and carry Docker-provider labels generated by
the `GatewayRuntimePort` adapter, including:

- `traefik.enable=true`
- `traefik.docker.network=dokploy-network`
- a tenant router rule for `Host(\`t-<tenant_id>.${OPZAVA_DOMAIN}\`)`
- the environment-appropriate TLS cert resolver
- the standard middleware set for Gateway ingress
- a service port pointing at the Gateway's internal OpenClaw HTTP/WS port
- `opzava.gateway=true`
- tenant, gateway instance, provisioner lease, lifecycle, and expected-state labels needed by the
  reaper

Traefik Docker-provider parity is mandatory. Local Traefik enables the Docker provider with
`exposedByDefault=false` and watches `dokploy-network`. On Dokploy, the existing Traefik must also
enable the Docker provider with pinned flags that can discover plain Docker containers on
`dokploy-network`; Swarm-provider discovery is insufficient for tenant Gateways because those
containers are not Swarm services. If Dokploy's existing Traefik cannot guarantee those
Docker-provider settings, run a dedicated Opzava Traefik on `dokploy-network` for Opzava routes and
tenant Gateway routing rather than relying on partial provider behavior.

Use direct read-only Docker socket access only for Traefik Docker-provider discovery, following the
Dokploy pattern. Use `tecnativa/docker-socket-proxy` for Docker mutation only. The proxy is
mutation-scoped to the narrow Docker API subset required by provisioning: container
create/start/stop/remove/inspect, image pull/inspect where required for approved Gateway images,
network connect/disconnect/inspect, and volume or mount operations explicitly required by the
Gateway runtime state model. Disable exec, build, plugins, swarm services/nodes, broad system
endpoints, secrets APIs, arbitrary privileged containers, host bind mounts outside approved Gateway
paths, and image push.

Only `worker-provisioning` can reach the mutation-scoped socket proxy. The proxy is not routable
from `next`, `gateway-broker`, `worker-projection`, `worker-metering`, or tenant Gateway containers.
The `gateway-broker` never mounts Docker, never receives a Docker endpoint, and never provisions
containers on the hot path. A CI lint enforces that `/var/run/docker.sock` appears only on the
approved read-only Traefik discovery mount and the socket-proxy service, and that Docker proxy
mutation flags stay within the approved allowlist.

Secrets use parity by key, not by value. Local and live use the same environment variable names and
same secret references in Compose. Local values come from `.env` or local secret files ignored by
git. Live values come from Dokploy secrets or the live secret manager. No raw provider tokens,
OpenClaw channel secrets, broker device tokens, database passwords, TLS private keys, or Docker
credentials are committed to the repository.

## Spike-validated refinements (2026-07-02)

Validated by a passing local spike in `spike/slice-0/` and codex+mmx review in
`docs/plan/consensus/slice0-review.codex.md` and `docs/plan/consensus/slice0-review.mmx.md`:

1. Traefik reads `/var/run/docker.sock` read-only directly for Docker label discovery, matching
   Dokploy's pattern. Only `worker-provisioning` Docker mutation goes through the least-privilege
   socket proxy. The broker never touches Docker.
2. Traefik must be at least `v3.6.1` on Docker Engine 29, whose minimum Docker API is `1.44`; older
   Traefik broke against that API floor. Use the same Traefik image and version Dokploy ships, not
   an unpinned vanilla Traefik.
3. Pin `DOCKER_API_VERSION=1.44` for dockerode and any Docker client. Client negotiation can
   override environment defaults, so adapters must make the API version explicit.
4. Socket-proxy path granularity matters: `POST /containers/{id}/exec` falls under the `/containers`
   scope. Prove least privilege by denying `/exec` create and start against a live container and by
   asserting a truly denied endpoint such as `/volumes` returns `403`. The worker never needs exec.
5. Use uncommon/configurable Gateway ports and a dedicated external network, but confirm Dokploy's
   actual network name and default ports before assuming `dokploy-network` or any tenant Gateway
   port contract in production.

### Real-implementation de-risk follow-ups

1. [ ] Real OpenClaw operator WS handshake: `connect.challenge` nonce signing, device-token pairing,
       protocol v4, and `operator.write` + `operator.approvals` scopes.
2. [ ] Wildcard TLS issuance/renewal and `*.localhost` / `*.opzava.app` DNS lifecycle, including SNI
       behavior.
3. [ ] Readiness/health gating plus reconnect/backoff/circuit-breaker behavior under sustained load
       and idle WS death.
4. [ ] Reaper concurrency with leases/fencing to avoid double-kill and orphan Gateway containers.
5. [ ] Lazy-start/idle-stop cold-start latency versus idle cost.
6. [ ] Secrets lifecycle for device tokens, TLS certs, Gateway keys, rotation, and per-tenant
       scoping.
7. [ ] Mapping onto Dokploy's Compose deployer while attaching to Dokploy's existing Traefik.

## Compose service topology

The canonical Compose file defines these app and platform services:

```text
traefik              local profile only; owns local web/websecure entrypoints, Docker provider, mkcert certs
postgres             Opzava durable Postgres
pgbouncer            Postgres connection pool for app services and workers
redis                realtime backplane, queues, rate limits, and coordination where required
minio                S3-compatible local/object-store adapter service
next                 Next.js App Router BFF and browser-facing product app
gateway-broker       OpenClaw ACL, tenant route resolver, runtime RPC client, and WebSocket relay
worker-provisioning  tenant provisioning, GatewayRuntimePort docker adapter, reaper, suspend/resume/deprovision jobs
worker-projection    outbox consumers, projection rebuilds, and runtime snapshot/event ingestion
worker-metering      usage.cost polling, meter event creation, and billing usage posting
dockerproxy          mutation-scoped tecnativa/docker-socket-proxy, reachable only by worker-provisioning
openclaw-platform-gateway  one static Compose-managed Platform Gateway built from ./mainframe
```

### Deferred multi-tenant runtime topology

The following topology is not active in V1 and cannot enter a Release Manifest until a future ADR
reactivates and revalidates it:

```text
openclaw-gateway tenant containers
  created by worker-provisioning through GatewayRuntimePort
  joined to dokploy-network
  labeled for Traefik Docker-provider routing
  one container per active or starting tenant GatewayInstance
  isolated by tenant OPENCLAW_CONFIG_PATH, OPENCLAW_STATE_DIR, workspace, and port allocation
```

When that future topology is activated, the same `GatewayRuntimePort` Docker adapter and
reconciliation code must run locally and live. Until then, its dynamic container effects are absent
from both environments.

## Consequences

Local development exercises the same current static Platform Gateway service graph, labels, network,
and health checks as Dokploy. Dynamic per-tenant routing parity becomes mandatory only when the
deferred multi-tenant topology is reactivated.

The root deployment artifact becomes load-bearing. Changes to `docker-compose.yml`, Traefik labels,
health checks, secret keys, or service names are production deployment changes even when they appear
to target local development.

Release image creation moves out of Dokploy and into the trusted build pipeline. This adds registry,
provenance, signature/attestation, SBOM, retention, and digest-verification dependencies, but it
guarantees that staging and production exercise one artifact identity. Dokploy remains
deployment/runtime observation authority; an API `2xx` or queued/completed provider operation is not
success until exact effective digests, routing, health, smoke, and the required stabilization
evidence are observed. Unknown or mixed provider state must remain truthful and block competing
environment mutation until reconciled.

### Deferred multi-tenant consequences

The following anti-orphan, reaper, tenant-routing, and dynamic Docker consequences are conditional
future requirements only; they do not describe current V1 runtime or Release behavior.

If dynamic provisioning is reactivated, the anti-orphan invariant from ADR-002 and ADR-014 extends
to routing: no tenant Gateway may remain both running and routable unless all of these are true at
the same time:

- The tenant has an active runtime entitlement.
- `tenant.lifecycle_state = Active`.
- A non-deleted valid `GatewayInstance` exists for that tenant.
- The runtime has a live provisioner lease.
- The container labels match the expected tenant, Gateway instance, route, network, state path,
  config path, workspace path, and service port.
- The Traefik route is generated from the current `GatewayInstance`, not from stale container labels
  or caller input.

Suspend and deprovision must remove routability and runtime authority together. The invariant is: no
routable orphan Gateway. Deprovision removes the Traefik route, kills the container, and revokes
entitlement as one transactionally recorded, idempotent lifecycle operation mediated through the
ADR-002 provisioning job and outbox. A crash in the middle leaves a resumable job for the worker and
a reaper target, not manual shell cleanup as the normal path.

The reaper is part of the deployment architecture. It scans running `opzava.gateway=true` containers
and Traefik-routable Gateway labels, compares them to tenant lifecycle, entitlement,
`GatewayInstance`, expected labels, expected mounts, expected network, and lease state, then stops,
quarantines, or removes anything without a valid owner. The same reaper runs locally and live.

The Docker socket invariant is absolute: Traefik may read `/var/run/docker.sock` directly only for
Docker-provider discovery, the scoped socket proxy is the only Docker mutation surface, and Docker
API access is never given to the broker, web app, projection worker, metering worker, or tenant
Gateway containers. CI linting must fail any Compose, Dockerfile, or deployment change that violates
this boundary.

The `GatewayRuntimePort` docker adapter becomes responsible for label correctness, network
attachment, socket-proxy use, mount policy, image allowlisting, and idempotent reconciliation. This
refines ADR-002 without changing the tenant lifecycle model or the option to add K8s/Nomad adapters
later.

Dokploy Traefik configuration becomes an explicit production prerequisite. If its existing Traefik
cannot route plain Docker-provider containers on `dokploy-network`, Opzava must deploy a dedicated
Traefik for tenant routing. The product must not rely on Swarm-provider discovery for runtime
Gateway containers.

Secrets are operationally different but semantically identical. Developers and Dokploy operators use
the same keys and route labels, but secret values remain environment-local and are never committed.
This keeps local parity without weakening production secret handling.

## Alternatives

Use separate Compose files for local and Dokploy. Rejected because it would create two deployment
contracts for service names, labels, health checks, and runtime Gateway routing. The highest-risk
behavior is tenant container reconciliation through Traefik, and that must be exercised the same way
locally and live.

Let Dokploy rebuild the repository independently for staging and production. Rejected because
source-equivalent builds are not artifact identity, mutable build inputs can drift, and staging
evidence would not prove the exact production image. The trusted pipeline builds once and both
environments deploy manifest-pinned digests.

Promote a local Docker Review image. Rejected because local Review and trusted Release provenance
are different trust boundaries. Review evidence remains SHA-bound input to sealing; only
registry-published, verified manifest digests are Release artifacts.

Use Swarm everywhere. Rejected because Q14 chooses Dokploy's Compose deployer as the lean production
path, and ADR-002 tenant Gateways are runtime containers controlled by `GatewayRuntimePort`, not
static Swarm services. Swarm-provider routing would not discover broker-created plain containers
consistently and would force the first implementation into an orchestration model Opzava does not
need yet.

Use Dokploy-only Traefik locally by mocking routes or bypassing TLS. Rejected because it would leave
local development unable to catch the label, wildcard TLS, middleware, WebSocket, and
Docker-provider behavior that production depends on.

Bake one static Compose service **per tenant** into the future topology. Rejected for the deferred
multi-tenant design because tenants would be created, suspended, resumed, deleted, and reaped at
runtime through the ADR-002 provisioning lifecycle. This does not reject the accepted V1 choice of
one static Compose-managed Platform Gateway.

Let the `gateway-broker` create or inspect Docker containers. Rejected because ADR-003 makes the
broker the hot-path OpenClaw ACL, not a host-control plane. Docker mutation and reconciliation
belong to `worker-provisioning` through `GatewayRuntimePort`.

Use a read-only Docker socket proxy for provisioning. Rejected as insufficient. Provisioning must
create, start, stop, remove, inspect, and attach Gateway containers to networks, so it requires a
narrowly scoped mutation subset. Read-only access may be useful for diagnostics in a future ADR, but
it cannot implement `GatewayRuntimePort`.

Mount `/var/run/docker.sock` directly into `worker-provisioning`. Rejected because the raw Docker
socket is broad host authority. The scoped proxy gives a smaller, auditable API surface and lets CI
enforce that no application service receives raw socket access.

Rely on Traefik's Swarm provider for tenant Gateways on Dokploy. Rejected because per-tenant
Gateways are plain Docker containers. Docker-provider routing with `exposedByDefault=false` on
`dokploy-network` is the parity requirement; otherwise Opzava must run a dedicated Traefik for these
routes.

## Related ADRs

- ADR-001: Monorepo, DDD module structure, and locked stack.
- ADR-002: Pure-per-tenant tenancy, `GatewayRuntimePort`, provisioning saga, lifecycle state
  machine, and anti-orphan invariant.
- ADR-003: `gateway-broker` ACL, two-token model, tenant routing, and runtime RPC.
- ADR-014: Billing, usage metering, plan enforcement, dunning, and entitlement lifecycle.
- ADR-017: Dev Board and Releases authority, build-once promotion, fenced attempts, and Incident
  boundary.

---

> **Validate against official docs before implementing.** Training knowledge is a starting point,
> not the source of truth — check `docs/plan/official-docs.md`, `docs/openclaw`, and current vendor
> docs. See `CLAUDE.md` (Official-docs rule).

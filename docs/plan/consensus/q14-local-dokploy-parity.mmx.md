**Decisions**

1) **Parity:** Single `docker-compose.yml` for local; Dokploy runs the **same file** via its Compose deployer. No Swarm. Stack file is the source of truth; only env files diverge. Dokploy reads `traefik.enable=true` labels identically.

2) **Traefik:** v3, single instance. Entrypoints `web`/`websecure`. Network `dokploy-network` (literal name, shared). Routers: `web-next`, `web-broker` (WS), `web-minio`. TLS: local = `mkcert` resolver, certs mounted; live = `letsencrypt` resolver (Dokploy provides). Middlewares: `secure-headers`, `rate-limit`, `cors-next`. Healthchecks standardized in compose.

3) **Per-tenant Gateway:** Broker → `GatewayRuntimePort` → **docker-socket-proxy** (`tecnativa/docker-socket-proxy`, RO subset: containers/images/networks/exec). Mounted in compose as `dockerproxy:2375`. Labels baked into adapter: `traefik.enable=true`, `traefik.http.routers.t-{tenant}.rule=Host(\`t-{tenant}.localhost\`)` (or `.opzava.app`), `traefik.http.services.t-{tenant}.loadbalancer.server.port=18789`, network `dokploy-network`. Idempotent reconcile via Redis.

4) **Topology:** `postgres`, `pgbouncer`, `redis`, `minio`, `next`, `broker`, `worker-*`, `traefik`, `dockerproxy`. Env: local `.env`; live = Dokploy secrets (same keys). Domains: `*.localhost` (mkcert) / `*.opzava.app` (LE). One external network, one volume namespace per service.

5) **Sad path + invariant:** docker.sock = root = full host takeover. **Invariant:** broker NEVER touches `/var/run/docker.sock`; only `dockerproxy:2375`. CI lints compose to assert `docker.sock` appears nowhere; `hadolint` + custom check enforce.

**Service list (single compose):** `traefik`, `postgres`, `pgbouncer`, `redis`, `minio`, `next`, `broker`, `worker-provisioning`, `worker-projection`, `worker-metering`, `dockerproxy`.

**Parity guarantee:** same compose, same labels, same network name, same healthchecks; diverge only at env/TLS resolver/replicas.

**Lean-ops:** tenanted gateways auto-reconciled, mkcert auto-trust, one `make up`/`make down`.

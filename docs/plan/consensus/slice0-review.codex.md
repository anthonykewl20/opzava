# Slice-0 De-Risk Spike Review

**False-pass verdict:** genuine end-to-end infrastructure proof, not a fake pass, with one important boundary: OpenClaw itself is mocked. The test provisions a tenant Gateway container through the worker's dockerode client pointed at `http://worker-proxy:2375`; the container is not a static Compose service. Traefik discovers that runtime container from Docker labels on the shared `opznet`, and the broker dials `ws://t-abc.localhost`, with `.localhost` resolved to Traefik, not container DNS. The raw upgrade probe also hits `127.0.0.1:80` with `Host: t-abc.localhost`, so the route is really the Traefik Host rule. Deprovision is also meaningfully proved: after `DELETE /provision/abc`, the test waits for both zero Docker containers with the tenant label and disappearance of the Traefik router plus failed WS upgrades.

Weak assertions: token streaming proves only the mock Gateway protocol surface; it does not prove real OpenClaw pairing, challenge signing, auth, or protocol drift. The deny-endpoint proof uses `GET /volumes` and documents why: socket-proxy treats exec-create as a `/containers` path, while `EXEC=0` blocks `/exec/.../start`. Good smoke proof, but insufficient as the production exec boundary.

**ADR-015 refinements to bake in:**

- Use uncommon/configurable tenant Gateway ports, reserve derived port ranges, and attach every tenant Gateway to one dedicated Traefik-watched network.
- Correct the socket invariant: Dokploy-style Traefik may read `/var/run/docker.sock` directly as read-only for Docker-provider discovery; only worker mutation goes through the least-privilege socket proxy. ADR-015 currently overstates "only proxy mounts socket."
- Pin `DOCKER_API_VERSION=1.44` for dockerode on Docker 29, and require Traefik `>= v3.6.1` with min Docker API 1.44; verify Dokploy's shipped/pinned Traefik too, not just vanilla Traefik.
- Be precise about socket-proxy granularity: `/containers/.../exec` can pass through `CONTAINERS=1`; prove denied `/volumes` and prove `EXEC=0` blocks `/exec/.../start` against a live container.
- Align the skill with this discovery/mutation split and keep broker/docker separation absolute.

**Prioritized gaps before real Slice-0:**

1. Real OpenClaw operator WS handshake: `connect.challenge` nonce signing, device-token pairing, protocol v4, `operator.write` + `operator.approvals` grant, and failure modes.
2. Wildcard DNS/TLS: `*.localhost` locally, `*.opzava.app` live, SNI, cert resolver, renewal, and Dokploy attachment.
3. Health/readiness gating plus broker reconnect/backoff/circuit-breaker under load, not a five-frame happy path.
4. Reaper concurrency, leases, fencing, stale labels, and race-safe deprovision/suspend semantics.
5. Lazy-start/idle-stop cold-start behavior and cost model.
6. Secrets handling for broker device tokens, JIT admin credentials, TLS material, Docker creds, and OpenClaw-owned channel/provider secrets.
7. Exact Dokploy Compose-deployer mapping: same compose contract attached to Dokploy Traefik, or a dedicated Opzava Traefik if Docker-provider settings cannot be guaranteed.

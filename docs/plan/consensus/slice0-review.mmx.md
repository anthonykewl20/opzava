(a) Findings — skeptic check:

1. **Ports/network:** Partially generalizable. Dokploy enforces a dedicated network and known ports (3000/3333). Real prod must keep them; configurable ports are a deviation, not a generalization. State it as "confirm Dokploy's defaults."
2. **Traefik reads docker.sock read-only:** Correct generalization. Dokploy's Traefik does exactly this. Locking this is essential — regression here = full host compromise.
3. **DOCKER_API_VERSION=1.44:** Correct. Dockerode default-negotiates badly on Docker 29; pin is mandatory in prod too.
4. **Socket-proxy granularity:** Correctly framed, but **incomplete for prod.** `EXEC=0` is misleading — proxy accepts the env var name but the path filter is what matters. Real OpenClaw likely uses **POST /containers/{id}/exec** (gateway shells into workspace) AND `exec-start`. Proving `/volumes` denial doesn't cover the exec surface. Add: **deny `/exec`** and prove with both POST exec-create AND exec-start against a live container.
5. **Traefik ≥v3.6.1 / API 1.44:** Correct for Docker 29, but Dokploy ships its own Traefik with a pinned image — the spike must use the **same image/version** Dokploy installs, not vanilla Traefik, or findings are ungrounded.

(b) Top gaps by risk (highest first):

1. **Real OpenClaw handshake** — challenge nonce, device-token pairing, protocol v4, scope grant. Mock proves plumbing, nothing else. Without this, per-tenant auth is unverified.
2. **Wildcard TLS + DNS** — `.localhost` proves routing, not cert issuance/renewal, SNI, or DNS lifecycle. Prod breaks on first cert expiry or missing SAN.
3. **Reaper concurrency + leases** — single-worker deprovision ≠ N reapers racing on stale tenants. Need fencing/leases to prevent double-kill or orphan.
4. **Health/readiness + reconnect/circuit-breaker** — 5 frames ≠ sustained load. Need backpressure, idle WS death, broker reconnect, per-tenant rate limit.
5. **Lazy-start / idle-stop** — spike provisions eagerly. Prod cost model depends on cold-start latency vs. idle cost; unproven.
6. **Secrets lifecycle** — where do device tokens, TLS certs, gateway keys live? Rotation? Per-tenant scoping? Spike never touched this.

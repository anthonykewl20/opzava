# ARD 0031 — Docker-only App Runtime & Dokploy Parity

- **Status:** Accepted (seven provisions ratified via `/grilling` 2026-06-28; implemented S1–S7; `pnpm test:docker:dokploy` fully green — app-side + OpenClaw/Hermes; PR #54)
- **Date:** 2026-06-28
- **Relates-to:** [ARD 0012](0012-device-authorization.md) (device-authorization is for local CLIs; OpenClaw/Hermes are server-only), [ARD 0021](0021-linked-tool-health.md) (OpenClaw/Hermes health belongs to the server plane), [ARD 0026](0026-agent-fleet-and-main-orchestrator.md) (gateway-primary fleet execution), [CONTEXT.md](../../CONTEXT.md) (`ExecutionSurface`, `OpenClawAgent`, `MainOrchestrator`, `AgentAccountProfile`, two-plane split), [CLAUDE.md](../../CLAUDE.md) / [AGENTS.md](../../AGENTS.md) (agent operating contract)

## Context

Opzava's production target is Dokploy: Docker Compose services behind Traefik, reached through hostnames rather than direct app ports. The app-runtime lane is therefore not "whatever starts Next locally"; it is the Docker topology that proves the deploy shape before Dokploy sees it.

The current repo has drift in exactly the place the fleet depends on:

- The Compose surface is split across six files: base (`docker-compose.yml:1`), dev (`docker-compose-dev.yml:1`), OpenClaw overlay (`docker-compose-openclaw.yml:1`), Dokploy parity (`docker-compose.dokploy.yml:1`), hardening (`docker-compose.hardened.yml:1`), and host CLI sharing (`docker-compose.host-cli.yml:1`). The base app publishes a direct host port (`docker-compose.yml:20-21`), while Dokploy parity exposes through Traefik only (`docker-compose.dokploy.yml:53-54`, `:96-103`).
- Agent instructions still document host app runtime commands: `pnpm dev`, `pnpm start`, and `pnpm start:standalone` (`AGENTS.md:18-21`, `CLAUDE.md:43-45`), and `package.json` still wires them to `next dev`, `next start`, and the standalone wrapper (`package.json:13-16`). `.claude/settings.json` currently has only plugin enablement and no command deny list (`.claude/settings.json:1-5`).
- OpenClaw is structurally optional today: base says the sidecar comes from the overlay (`docker-compose.yml:32-35`, `:55-58`), and even keeps a standalone no-gateway profile (`docker-compose.yml:81-107`). ARD 0026 already made gateway-primary execution load-bearing for the server fleet; optional topology now creates a false local success path.
- The corrected OpenClaw path exists only in the OpenClaw overlay: the gateway image runs as `node`, reads `/home/node/.openclaw`, and crash-looped when mounted at `/root/.openclaw` (`docker-compose-openclaw.yml:46-50`). The Dokploy parity file still mounts the gateway state at `/root/.openclaw` (`docker-compose.dokploy.yml:126-127`).
- Dokploy parity wires the app to the gateway host/port only (`docker-compose.dokploy.yml:55-72`), while the OpenClaw overlay also gives the app `OPENCLAW_GATEWAY_TOKEN`, `OPENCLAW_STATE_DIR`, `OPENCLAW_CONFIG_PATH`, and a read-only OpenClaw state mount (`docker-compose-openclaw.yml:8-18`). The Dokploy app service has only the app data volume (`docker-compose.dokploy.yml:76-77`), so app-side readers that need sidecar state cannot see it there.
- Hermes is another Docker-parity hole. The scanner reads `config.homeDir/.hermes/state.db` (`src/lib/hermes-sessions.ts:46-48`) and opens it read-only (`src/lib/hermes-sessions.ts:155-162`); the app container home is `/home/nextjs` (`docker-compose.dokploy.yml:58`, `src/lib/config.ts:109`). No Dokploy parity volume mounts gateway `.hermes` into `/home/nextjs/.hermes`, so the Docker app sees no Hermes sessions even when the gateway has them.
- Browser gateway discovery is build-time fragile. The Dockerfile bakes `NEXT_PUBLIC_GATEWAY_*` args into the client bundle (`Dockerfile:24-53`), base Compose warns those env vars only work after rebuild (`docker-compose.yml:42-47`), and the main app client still connects from `process.env.NEXT_PUBLIC_GATEWAY_*` plus `window.location` fallback (`src/app/[[...panel]]/page.tsx:236-249`). A runtime Dokploy env edit cannot fix a browser bundle already built with the wrong gateway host.
- The existing parity script already proves useful Dokploy invariants: Traefik-routed health (`scripts/dokploy-parity-test.sh:23-41`), no host-published app port (`:43-62`), uid/read-only app filesystem (`:64-70`), secure forwarded cookie behavior (`:72-86`), temporal SSE through Traefik (`:88-179`), and PTY WebSocket upgrade through Traefik (`:181-233`). It does not yet prove OpenClaw/Hermes parity, runtime browser gateway discovery, or HMR behind Traefik.

This is the same two-plane model already in the domain language: OpenClaw/Hermes are server-only runtimes co-located with Opzava (`CONTEXT.md:93-103`, `docs/ard/0012-device-authorization.md:8-12`), while local CLI/device authorization is the operator's local plane. The broken part is operational: local app runtime still lets agents choose a host path that cannot faithfully predict Dokploy.

## Decision

Adopt a **Docker-only app-runtime lane** and a single canonical Compose topology that local dev, local parity, and Dokploy deployment all derive from. Seven provisions:

1. **Two lanes, hard boundary.** `app-runtime` is Docker-only: app server, Traefik path, OpenClaw gateway, Hermes state, browser gateway discovery, and parity checks run through local Docker. `dev-tooling` stays on the host: `pnpm test`, `pnpm lint`, `pnpm typecheck`, and build-check commands may run outside Docker because they are not the deployed runtime. Agents may not use host `pnpm dev`, `pnpm start`, `next dev`, `next start`, or `node .next/standalone` to prove app behavior.

2. **One canonical topology: base + overrides.** `docker-compose.yml` becomes the base topology and defines every runtime service exactly once: Traefik, `mission-control`, and `mc-openclaw-gateway`. OpenClaw is no longer an optional sidecar overlay. The base app is Traefik-labelled, `expose`d rather than directly published, standalone/runtime-mode, read-only except declared write paths, uid 1000, on `dokploy-network`, and wired to the gateway and shared state. The base gateway uses the corrected `/home/node/.openclaw` mount, Traefik labels, the shared `hermes-data` volume, and the same network. Drift becomes structurally hard: there is one OpenClaw definition.

3. **File split.** `docker-compose.dev.yml` is the dev override: Next dev inside Docker, `.:/app` bind mount, writable app filesystem where HMR needs it, and `NODE_ENV=development`. `docker-compose.parity.yml` is the parity override: Dokploy-like env, `__Host-` cookie behavior, `MC_ALLOWED_HOSTS`, and seeded auth for tests. `docker-compose-dev.yml` and `docker-compose-openclaw.yml` are deleted after their behavior is folded into the new base/override split. The standalone profile is deleted. `docker-compose.hardened.yml` and `docker-compose.host-cli.yml` remain orthogonal overlays; the host-cli overlay is a deliberate escape hatch, not the normal app-runtime lane. If `docker-compose.dokploy.yml` remains, it must be a thin compatibility wrapper over base + parity, not a second service graph.

4. **Traefik everywhere.** Both dev and parity are reached at `http://opzava.localhost:3080`; the gateway is reached at `http://opzava-gateway.localhost:3080`. Local Docker adds `extra_hosts` for those `.localhost` names so headless CI and Linux Docker behave deterministically. The app does not publish a direct host app port in parity. A HMR smoke check behind Traefik is part of the Definition of Done so "Docker dev works" means the browser path developers actually use works.

5. **OpenClaw/Hermes parity is load-bearing.** The corrected OpenClaw mount path moves into base. The app gets the full app-side wiring in base: `OPENCLAW_STATE_DIR`, `OPENCLAW_CONFIG_PATH`, `OPENCLAW_GATEWAY_TOKEN`, and a read-only OpenClaw state volume. A shared `hermes-data` volume is mounted read-write at `/home/node/.hermes` in the gateway and read-only at `/home/nextjs/.hermes` in the app. App readers open Hermes `state.db` with `mode=ro`; WAL/shm files stay volume-resident with the writer. Parity asserts gateway `/health`, app `/api/openclaw/doctor`, a live app read of a gateway-written Hermes row, uid 1000, and the gateway write path sentinel at `/home/node/.hermes`.

6. **Browser-to-gateway discovery is runtime-injected.** The browser gateway host is exposed through runtime-injected config read from the container env at request time (`PUBLIC_GATEWAY_HOST`), not baked into the client bundle as `NEXT_PUBLIC_*`. The WebSocket protocol is derived from `window.location.protocol` (`http:` -> `ws:`, `https:` -> `wss:`). A single root-level provider owns this config. If the runtime gateway host is unset and `GATEWAY_OPTIONAL` is not true, the OpenClaw doctor banner fails loudly with a diagnostic; it must not silently fall back to a stale build-time host. A separate future ARD will decide whether the Next server proxies browser-gateway WebSockets to the internal gateway.

7. **Enforcement burns the old path.** `CLAUDE.md` and `AGENTS.md` become the contract: app-runtime means Docker. `.claude/settings.json` denies accidental `pnpm dev`, `pnpm start`, `next dev`, `next start`, and bare standalone server commands. `package.json` poisons `start` and `start:standalone` so they print the Docker command and exit non-zero; dev-tooling scripts stay intact. A governance test (`test/docker-parity-enforcement.test.mjs`) fails if docs re-document forbidden host runtime commands, settings stops denying them, or OpenClaw is not singular in the base topology. CI runs `pnpm test:docker:dokploy` with OpenClaw enabled. The deliberate override path remains documented so escaping Docker requires intent, never accident.

## Sad-path contract

- **SQLite across containers:** the gateway may write Hermes `state.db` while the app reads it. The contract is read-only app open, writer-owned WAL/shm files on the same volume, and a live-read assertion in the parity gate. If this fails under real gateway behavior, the fallback is the future app proxy, not a return to host runtime.
- **Headless `.localhost`:** CI cannot rely on desktop resolver magic. Compose owns the hostname pinning through `extra_hosts`, and the parity script uses the same `opzava.localhost:3080` and `opzava-gateway.localhost:3080` path as humans.
- **Gateway uid/write drift:** the sentinel checks uid 1000 in the gateway and verifies writes land under `/home/node/.hermes`; the app gets read-only access to the same data and must not repair permissions by writing there.
- **`NEXT_PUBLIC_*` baked-at-build trap:** browser gateway config is runtime-injected per request. Rebuilding the image is not the mechanism for changing Dokploy gateway hostnames.
- **HMR behind Traefik:** Docker dev is accepted only after a browser-visible HMR smoke passes through Traefik, because a green direct-port dev server would prove the wrong path.

## Consequences

- **Positive:** the deploy path and local app-runtime path collapse into one topology; OpenClaw/Hermes failures surface before Dokploy; agents cannot accidentally validate work against a host server that production never uses; the parity gate grows from "Traefik app shell works" into "server fleet state is visible to the app."
- **Negative:** the fastest historical muscle memory (`pnpm dev` on the host) becomes intentionally noisy for app-runtime work; Compose files churn; HMR must work through Traefik instead of bypassing it; gateway state volumes become part of the normal local dev substrate.
- **Neutral:** host dev-tooling remains host dev-tooling. This decision does not make Opzava a CI runner, does not change DeviceAuthorization, and does not decide the future browser WebSocket proxy.

## Alternatives considered (the grilled forks)

- **Keep six Compose files and document the right combination.** Rejected: the current bug is proof that documentation is too weak. The OpenClaw path is correct in one file and wrong in another; topology must make the wrong combination impossible.
- **Keep host `pnpm dev/start` as an agent convenience path.** Rejected: it validates a runtime that Dokploy never runs and hides the Traefik, read-only filesystem, uid, OpenClaw, and Hermes edges.
- **Keep OpenClaw as an optional overlay.** Rejected for app-runtime: ARD 0026 made gateway-primary execution the server fleet's substrate. Optional OpenClaw is still valid only as an explicit `GATEWAY_OPTIONAL` standalone/dashboard mode, not as the default runtime lane.
- **Continue baking browser gateway host with `NEXT_PUBLIC_*`.** Rejected: Dokploy env changes happen at container runtime; build-time public env creates silent stale bundles.
- **Proxy browser WebSockets through the Next app immediately.** Deferred: it may be the right long-term browser gateway shape, but it is a separate routing decision. This ARD fixes parity first by making direct gateway discovery runtime-correct.
- **Copy Hermes data into the app container.** Rejected: it creates a sync problem and hides WAL behavior. A shared volume with app read-only access is the honest production analogue.

## Open questions

1. **Host-cli overlay tension:** `docker-compose.host-cli.yml` lets a container drive host CLIs, while this ARD says agents use Docker for the app-runtime lane. The enforcement slice must make that override explicit and auditable.
2. **Future proxy-via-app:** whether the Next server should proxy browser-gateway WebSockets to the internal gateway is a separate ARD after parity is stable.
3. **Exact Hermes gateway write path:** `/home/node/.hermes` is the ratified target, but implementation verifies it with the sentinel against the actual OpenClaw/Hermes image behavior.

## References

- Current-state files read for this decision: `CONTEXT.md`, `CLAUDE.md`, `AGENTS.md`, `docker-compose.yml`, `docker-compose-openclaw.yml`, `docker-compose.dokploy.yml`, `docker-compose-dev.yml`, `docker-compose.hardened.yml`, `docker-compose.host-cli.yml`, `Dockerfile`, `scripts/dokploy-parity-test.sh`, `src/lib/config.ts`, `src/lib/hermes-sessions.ts`, `src/app/[[...panel]]/page.tsx`, `src/lib/gateway-url.ts`, `src/app/api/openclaw/doctor/route.ts`, `src/app/api/gateway-config/route.ts`, `.claude/settings.json`, `package.json`.
- This crystallizes the `/grilling` session on 2026-06-28 and feeds `/codebase-design`, then the PRD.

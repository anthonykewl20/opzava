# Docker-only App Runtime and Dokploy Parity PRD

## Problem

Opzava deploys to Dokploy as Docker Compose services behind Traefik, but local app-runtime work can still run through host `pnpm dev` / `pnpm start` paths and divergent Compose files. That lets agents validate behavior against a runtime that production never uses, hiding the exact edges ARD 0031 identified: Traefik routing, read-only app filesystem, uid 1000, OpenClaw sidecar state, Hermes session visibility, and runtime browser gateway discovery.

The current Compose topology also makes OpenClaw/Hermes parity fragile. The corrected OpenClaw gateway state mount exists in one overlay, Dokploy parity still uses the wrong gateway home, app-side OpenClaw wiring is incomplete in Dokploy parity, and Hermes state is not shared into the app container. The result is a false-green local story: the app can start, but the server-plane `OpenClawAgent` / Hermes runtime that backs gateway-primary fleet execution can be invisible or crash-looping.

This PRD implements [ARD 0031](../ard/0031-docker-only-runtime-and-dokploy-parity.md). It does not publish issues; the plan gate will split these slices into GitHub issues later.

## Solution

Make Docker the only accepted app-runtime lane and make local Docker parity-faithful to Dokploy.

The solution follows ARD 0031's seven provisions:

1. **Two lanes:** app-runtime is Docker-only; host dev-tooling remains valid for `pnpm test`, `pnpm lint`, `pnpm typecheck`, and build-check work.
2. **One canonical topology:** base Compose owns the singular Traefik, app, and OpenClaw gateway service definitions; overrides mutate only environment-specific fields.
3. **File split:** base plus `docker-compose.dev.yml` and `docker-compose.parity.yml`; delete the old dev/openclaw overlays and standalone profile; keep hardening/host-cli as orthogonal overlays.
4. **Traefik everywhere:** dev and parity use `opzava.localhost:3080`; gateway uses `opzava-gateway.localhost:3080`; headless resolution is pinned.
5. **OpenClaw/Hermes parity:** corrected `/home/node/.openclaw` gateway mount, app-side OpenClaw state/config/token wiring, shared `hermes-data` volume, read-only app visibility, live-read parity assertion, uid/write-path sentinels.
6. **Runtime browser gateway discovery:** a pure `GatewayConfig` resolver and root provider replace baked `NEXT_PUBLIC_GATEWAY_*` reads for gateway connection decisions.
7. **Enforcement:** documentation, Claude settings deny rules, poisoned host start scripts, governance tests, and the Dokploy parity gate prevent accidental regression.

The build is sliced so each unit can be implemented test-first and merged independently without leaving placeholders or half-wired behavior.

## User Stories

1. As an operator, I want local app-runtime work to use the same Docker topology as Dokploy, so that a green local check predicts deploy behavior.
2. As an operator, I want dev and parity traffic to go through Traefik hostnames, so that routing bugs appear before deployment.
3. As an operator, I want the OpenClaw gateway to run from the same service definition in every runtime lane, so that sidecar drift cannot reappear in another Compose file.
4. As an operator, I want Hermes session state written by the gateway to be visible to the app, so that the app's server-plane session scanners show real gateway activity.
5. As an operator, I want the app container to read Hermes state without writing to the gateway's data, so that scanner visibility does not corrupt agent runtime state.
6. As an operator, I want the app to read OpenClaw config/state from the deployed mount path, so that gateway config routes and diagnostics work in Docker.
7. As an operator, I want browser gateway discovery to use runtime container env, so that changing Dokploy env does not require rebuilding the image.
8. As an operator, I want the doctor banner to fail loudly when gateway config is missing, so that the app does not silently connect to a stale build-time endpoint.
9. As an operator, I want `GATEWAY_OPTIONAL` to be the explicit standalone escape hatch, so that gateway absence is intentional and visible.
10. As an operator, I want `.env.example` to document the Docker-only app-runtime lane, so that first setup follows the supported path.
11. As an operator, I want `pnpm test:docker:dokploy` to include OpenClaw/Hermes assertions, so that parity covers the server fleet substrate, not just the app shell.
12. As an operator, I want a fresh-session smoke path using only documented Docker commands, so that new agents do not fall back to host app servers.
13. As an agent, I want docs to point me at the Docker app-runtime commands, so that I do not start `pnpm dev` on the host by accident.
14. As an agent, I want forbidden host app-runtime commands denied by Claude settings, so that unsafe habits are blocked before execution.
15. As an agent, I want host `pnpm test`, `pnpm lint`, and `pnpm typecheck` to remain allowed, so that fast dev-tooling stays ergonomic.
16. As an agent, I want `pnpm start` and `pnpm start:standalone` to print the Docker redirect and fail, so that production-like local app runtime has one path.
17. As an agent, I want the dev override to run Next dev inside Docker with bind mounts, so that HMR works without host-running the app.
18. As an agent, I want HMR verified through Traefik, so that the dev path used by humans is the path being tested.
19. As an agent, I want the parity override to be the only place for seeded auth and Dokploy-like cookie/allowed-host settings, so that test-only env cannot leak into base.
20. As a maintainer, I want base Compose to own Traefik labels and `expose`, so that direct host port publishing does not return unnoticed.
21. As a maintainer, I want old overlay files removed after migration, so that no one can compose the stale OpenClaw path.
22. As a maintainer, I want `docker-compose.dokploy.yml` to stay as a thin wrapper for existing scripts, so that `pnpm test:docker:dokploy` continues to work while topology becomes singular.
23. As a maintainer, I want a governance test to assert OpenClaw is defined exactly once, so that future edits cannot split the sidecar again.
24. As a maintainer, I want governance tests to scan docs for forbidden primary host runtime commands, so that documentation cannot drift back.
25. As a maintainer, I want governance tests to assert `.claude/settings.json` denies forbidden runtime commands, so that enforcement remains machine-checkable.
26. As a maintainer, I want governance tests to assert poisoned package scripts, so that `package.json` cannot silently re-enable host app-runtime.
27. As a maintainer, I want the gateway config resolver tested as a pure function, so that runtime env behavior is deterministic and does not require a browser or container to reason about.
28. As a maintainer, I want the root public config provider to inject runtime config from the server, so that client code does not read baked `NEXT_PUBLIC_GATEWAY_*` values for gateway connection decisions.
29. As a maintainer, I want server routes to use the same resolver as the client provider, so that `/api/gateways`, `/api/gateways/connect`, security scan, and doctor behavior agree.
30. As a maintainer, I want the existing `buildGatewayWebSocketUrl` logic reused rather than rewritten, so that URL normalization and fallback behavior stay centralized.
31. As a maintainer, I want compatibility fallback to legacy `NEXT_PUBLIC_GATEWAY_HOST`, so that existing deployments have a migration path while `PUBLIC_GATEWAY_HOST` becomes canonical.
32. As a maintainer, I want the parity harness to verify gateway `/health`, so that a Traefik-routed app cannot pass while the gateway is dead.
33. As a maintainer, I want the parity harness to verify app `/api/openclaw/doctor`, so that app-side gateway diagnostics are exercised in Docker.
34. As a maintainer, I want a Hermes live-read assertion, so that the app scanner proves it sees data written by the gateway container.
35. As a maintainer, I want a gateway uid sentinel, so that image/user drift is caught when it breaks shared-volume ownership.
36. As a maintainer, I want a gateway write-path sentinel under `/home/node/.hermes`, so that future image changes cannot silently move Hermes data away from the app's read-only mount.
37. As a maintainer, I want app read-only mounts for sidecar state, so that Opzava remains the `ControlPlane` and does not mutate execution-plane runtime files.
38. As a maintainer, I want Docker parity checks to remain opt-in from `test:all` unless explicitly decided otherwise, so that normal host dev-tooling remains fast.
39. As a maintainer, I want `pnpm test:governance` to include the new enforcement test through its existing `node --test test/*.test.mjs` glob, so that no extra script plumbing is needed.
40. As a maintainer, I want no placeholders or stubs in any slice, so that every merged slice is usable and reviewable on its own.

## Implementation Decisions

1. The keystone application seam is a pure `GatewayConfig` resolver that accepts injected inputs and returns the resolved host, port, protocol, optional flag, client id, WebSocket URL, and diagnostic sentinel.
2. The resolver reads canonical runtime `PUBLIC_GATEWAY_HOST` for browser-facing gateway host and falls back to legacy `NEXT_PUBLIC_GATEWAY_HOST` only for compatibility.
3. The resolver delegates WebSocket URL construction to the existing gateway URL builder rather than duplicating normalization rules.
4. The resolver returns a loud-fail diagnostic when no gateway host is available and gateway optional mode is not enabled; the OpenClaw doctor banner consumes this diagnostic.
5. A server-mounted public config provider reads runtime env at request time in the root app layout and injects the resolved client config into the client tree.
6. Client call sites use `useGatewayConfig`; server routes and server utilities use `resolveGatewayConfig` directly.
7. Gateway connection resolution moves out of inline `process.env.NEXT_PUBLIC_GATEWAY_*` reads across WebSocket normalization, app boot, gateway list/connect routes, security scan, doctor, and multi-gateway panel behavior.
8. Base Compose owns the full service graph: Traefik, app, and OpenClaw gateway. Overrides mutate only the specific fields named in this PRD.
9. `docker-compose.dev.yml` is the only dev override and changes command, bind mounts, node_modules volume, `read_only`, and `NODE_ENV`.
10. `docker-compose.parity.yml` is the only parity override and changes seeded auth, `MC_ALLOWED_HOSTS`, and cookie/security settings needed to exercise Dokploy behavior.
11. `docker-compose.dokploy.yml` remains only as a compatibility include-wrapper so existing scripts and package commands keep their public contract.
12. `docker-compose-dev.yml`, `docker-compose-openclaw.yml`, and the standalone profile are deleted once their behavior is represented in base/overrides.
13. OpenClaw gateway state is mounted at `/home/node/.openclaw`; no base or parity file may mount gateway state at `/root/.openclaw`.
14. The app receives `OPENCLAW_STATE_DIR`, `OPENCLAW_CONFIG_PATH`, and `OPENCLAW_GATEWAY_TOKEN` in base, with the OpenClaw state mounted read-only at the app path.
15. Hermes uses a shared named volume: read-write in the gateway at `/home/node/.hermes`, read-only in the app at `/home/nextjs/.hermes`.
16. Hermes scanner behavior remains read-only; the app opens `state.db` without taking writer ownership, and parity proves WAL/shm files remain volume-resident.
17. Base and overrides use the `dokploy-network` naming from ARD 0031 so local parity vocabulary matches Dokploy.
18. `extra_hosts` pins `opzava.localhost` and `opzava-gateway.localhost` in Docker so headless Linux/CI behavior is deterministic.
19. Enforcement is not documentation-only: docs, package scripts, Claude settings, and governance tests must all agree.
20. Host CLI sharing remains an explicit overlay and is documented as an intentional escape hatch, not a normal app-runtime path.

## Implementation Slices

### S1. Compose collapse

Build unit: collapse the Compose topology into base plus dev/parity overrides and keep the Dokploy command contract stable.

Scope:
- Move Traefik, `mission-control`, and `mc-openclaw-gateway` service definitions into base Compose.
- Convert dev behavior into `docker-compose.dev.yml`.
- Convert parity behavior into `docker-compose.parity.yml`.
- Convert `docker-compose.dokploy.yml` into a thin include-wrapper over base plus parity.
- Delete `docker-compose-dev.yml`, `docker-compose-openclaw.yml`, and the standalone profile.
- Keep hardening and host-cli overlays orthogonal.

Definition of Done:
- Base Compose has exactly one `mc-openclaw-gateway` service definition.
- Dev override contains only the allowed mutations: command, bind mounts, node_modules volume, `read_only: false`, and `NODE_ENV=development`.
- Parity override contains only Dokploy/parity env and auth/cookie/host settings.
- Existing `pnpm test:docker:dokploy` still targets `docker-compose.dokploy.yml`.
- No deleted file remains referenced by first-run docs, package scripts, or governance tests except in historical ARD references.

### S2. OpenClaw and Hermes parity in base

Build unit: make server-plane state visible and correctly mounted in the singular base topology.

Scope:
- Mount OpenClaw gateway state at `/home/node/.openclaw`.
- Mount the same OpenClaw state read-only into the app and set `OPENCLAW_STATE_DIR`, `OPENCLAW_CONFIG_PATH`, and `OPENCLAW_GATEWAY_TOKEN`.
- Add `hermes-data` as a named volume, read-write in the gateway at `/home/node/.hermes` and read-only in the app at `/home/nextjs/.hermes`.
- Ensure app uid/home assumptions match Dockerfile runtime behavior.
- Adjust Hermes scanner opening semantics only if required to guarantee read-only SQLite access under WAL.

Definition of Done:
- App `/api/openclaw/doctor` can inspect the Docker-managed gateway from inside the Docker network.
- App Hermes scanning sees rows in `/home/nextjs/.hermes/state.db` created by the gateway-side volume.
- The app cannot write to `/home/nextjs/.openclaw` or `/home/nextjs/.hermes`.
- Gateway writes land under `/home/node/.hermes`, not `/root/.hermes`.
- No secrets are embedded in Compose; tokens remain env-driven.

### S3. GatewayConfig resolver and runtime public config

Build unit: replace baked gateway client env with one pure resolver and runtime injection.

Scope:
- Add `resolveGatewayConfig(input)` as the pure resolver for gateway host, port, protocol, optional flag, client id, WebSocket URL, and diagnostics.
- Make `PUBLIC_GATEWAY_HOST` canonical and `NEXT_PUBLIC_GATEWAY_HOST` a backward-compatible fallback.
- Derive `ws`/`wss` from browser protocol and reuse the existing WebSocket URL builder.
- Add a root public config provider mounted in the app layout and a client hook for gateway config reads.
- Migrate scattered gateway config reads through the resolver: app boot, WebSocket normalization, security scan, doctor, gateway connect/list routes, and multi-gateway panel.
- Preserve localStorage explicit gateway URL override as the highest-priority user choice where it already exists.
- Do not duplicate `src/lib/runtime-env.ts` — its `getEffectiveEnvValue` reads the OpenClaw sidecar's `.env` for gateway-side values; this resolver instead reads app-side `process.env.PUBLIC_GATEWAY_HOST`. Two distinct seams, do not merge them.
- Update `src/lib/__tests__/docker-compose-schema.test.ts`: it currently asserts `NEXT_PUBLIC_GATEWAY_HOST` / `NEXT_PUBLIC_GATEWAY_*` are Compose build-args — that is exactly the baking this slice removes. Repoint it at the runtime-injection contract (gateway host is no longer a build-arg; `PUBLIC_GATEWAY_HOST` is a runtime container env).

Definition of Done:
- A production image built with no `NEXT_PUBLIC_GATEWAY_HOST` can still connect using runtime `PUBLIC_GATEWAY_HOST`.
- Changing `PUBLIC_GATEWAY_HOST` at container runtime changes the browser-facing gateway target without rebuilding the image.
- If gateway host is unset and `GATEWAY_OPTIONAL` is not true, the doctor banner shows a loud diagnostic instead of silently connecting to localhost or a stale baked value.
- Existing reverse-proxy path fallback behavior remains intact.
- Unit tests cover resolver precedence, protocol derivation, optional mode, legacy fallback, explicit URL override, and diagnostic sentinel.
- `docker-compose-schema.test.ts` is updated to the runtime-injection contract and passes.

### S4. Traefik everywhere and HMR smoke

Build unit: make dev and parity reachable through the same Traefik hostnames.

Scope:
- Route app traffic through `opzava.localhost:3080` in dev and parity.
- Route browser gateway traffic through `opzava-gateway.localhost:3080`.
- Add Docker hostname pinning for headless `.localhost` behavior.
- Ensure dev HMR works through Traefik, not through a direct app port.
- Keep the direct-port absence invariant for parity.

Definition of Done:
- Dev app loads at `http://opzava.localhost:3080`.
- Gateway is browser-reachable at `http://opzava-gateway.localhost:3080`.
- HMR smoke proves a source edit updates the browser through Traefik.
- Parity still fails if `mission-control` publishes a direct host app port.
- The same hostnames are documented for humans and used by automated parity checks.

### S5. Enforcement

Build unit: make the Docker-only app-runtime contract machine-enforced.

Scope:
- Update `.claude/settings.json` with deny rules for host app-runtime commands: `pnpm dev`, `pnpm start`, `next dev`, `next start`, and bare standalone server commands.
- Poison `start` and `start:standalone` package scripts so they print the Docker app-runtime redirect and exit non-zero.
- Keep dev-tooling scripts intact.
- Add `test/docker-parity-enforcement.test.mjs` using `node:test`, following the style of the existing governance tests.
- Fold the new test into the existing governance path through the current `test/*.test.mjs` glob.

Definition of Done:
- Governance fails if `CLAUDE.md` or `AGENTS.md` list forbidden host app-runtime commands as primary app-run commands.
- Governance fails if `.claude/settings.json` stops denying any forbidden host app-runtime command.
- Governance fails if base Compose does not define singular OpenClaw wiring, or if the gateway mount path regresses.
- Governance fails if `package.json` re-enables `start` or `start:standalone` as host app-runtime paths.
- Dev-tooling commands remain host-runnable and documented.

### S6. Parity harness extensions

Build unit: extend the Dokploy parity script so OpenClaw/Hermes parity is proven end-to-end.

Scope:
- Start the parity stack with OpenClaw enabled by default for the parity gate.
- Assert gateway `/health` through the Docker/Traefik path.
- Assert app `/api/openclaw/doctor` reports healthy from the app container's view.
- Add a Hermes live-read probe: gateway writes a synthetic session row or equivalent sentinel into `state.db`; the app scanner sees it within a bounded retry window.
- Add gateway uid and write-path sentinels.
- Preserve existing health, direct-port, cookie, SSE, PTY WebSocket, and optional Playwright behavior.

Definition of Done:
- `pnpm test:docker:dokploy` fails when OpenClaw is missing, mounted at `/root/.openclaw`, or unreachable.
- `pnpm test:docker:dokploy` fails when Hermes data is not shared into the app read-only path.
- The live-read probe is deterministic, cleans up its sentinel data where safe, and is isolated from real operator sessions.
- Failure output names the exact parity invariant that failed and prints relevant service logs.
- The script remains idempotent and cleans up volumes unless the existing keep-up flag is set.

### S7. Contract docs

Build unit: update the human and agent contract without inventing new product terms unless necessary.

Scope:
- Update `CLAUDE.md` and `AGENTS.md` so app-runtime commands point to Docker and host dev-tooling remains explicit.
- Update `.env.example` for `PUBLIC_GATEWAY_HOST`, `GATEWAY_OPTIONAL`, Traefik hostnames, and the base/override Compose path.
- Update deployment/gateway docs only where they would otherwise teach the forbidden host runtime or stale `NEXT_PUBLIC_GATEWAY_*` path.
- Touch `CONTEXT.md` only if a real term crystallizes beyond ARD 0031's existing vocabulary.

Definition of Done:
- A fresh agent can follow only documented Docker commands and reach the app through Traefik.
- Docs no longer present host `pnpm dev`, host `pnpm start`, host `next dev/start`, or bare standalone server as primary app-runtime commands.
- The deliberate override path for host-cli sharing is documented as intentional and auditable.
- `.env.example` contains no secrets and does not instruct users to set baked gateway host env for normal Dokploy parity.
- ARD 0031 is referenced as the source of the Docker-only runtime decision.

## Testing Decisions

1. Dev-tooling stays on the host: unit tests, typecheck, lint, and governance tests are host-executed.
2. App-runtime parity is proven through Docker with `pnpm test:docker:dokploy` and OpenClaw enabled.
3. The gateway config resolver is tested as a pure function with injected inputs; tests assert external behavior, not internal branch names.
4. The public config provider is tested at the React/provider seam so client consumers receive runtime config without reading `process.env.NEXT_PUBLIC_GATEWAY_*`.
5. Gateway server routes are tested by observable response behavior: generated WebSocket URLs, optional-mode diagnostics, and doctor/banner status.
6. Governance uses `node:test` in `test/docker-parity-enforcement.test.mjs`, matching `test/branding.test.mjs` and `test/scripts-parity.test.mjs`.
7. Compose contract tests assert the structural invariants that matter: singular OpenClaw, correct mount paths, no direct parity app port, required OpenClaw/Hermes volumes, and allowed override mutations.
8. Existing Vitest Compose tests that expect the old overlay files are updated or replaced as part of the relevant slices; they must not preserve stale topology.
9. The Dokploy parity harness remains the acceptance test for Traefik, cookie, SSE, PTY WebSocket, OpenClaw health, app doctor, Hermes live-read, uid, and write-path behavior.
10. The HMR smoke is an app-runtime check and must run through Traefik; direct-port HMR does not satisfy this PRD.
11. The fresh-session smoke is manual or scripted at the app-runtime boundary: a clean agent follows docs, starts Docker, reaches `opzava.localhost:3080`, and never starts a host app server.
12. Any slice that ships a placeholder, TODO-driven stub, or "documented but not wired" path is rejected.

## Out of Scope

- Publishing GitHub issues for these slices. That happens in the plan gate.
- Changing DeviceAuthorization or local CLI auth semantics.
- Building a Next-server WebSocket proxy for browser-to-gateway traffic; ARD 0031 explicitly defers that to a future ARD.
- Making Opzava run CI. Opzava remains the `ControlPlane`, not a CI runner.
- Removing the host-cli overlay entirely. This PRD only makes it explicit and auditable.
- Reworking OpenClaw/Hermes product UX beyond the diagnostics and parity behavior required here.

## Further Notes

- ARD 0031 is the governing decision record. If implementation pressure contradicts it, reopen the ARD before changing the plan.
- Use `/tdd` for each implementation slice. Sad paths from ARD 0031 are test requirements, not commentary.
- Keep all secrets env-driven. Do not add provider credentials, gateway tokens, or model choices to source.
- The next workflow step is to review this PRD, then publish/split it only when `--publish` is explicitly requested.

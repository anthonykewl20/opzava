# OPZAVA Docker Handoff

**Date:** 2026-06-23

## Goal

Make local Docker close enough to Dokploy's Compose runtime that we can run deep
tests locally before deployment: production image, runtime `.env`, Traefik
domain routing, no direct app host port, hardened filesystem, and optional
OpenClaw gateway routing. The realtime path must also be testable locally through
the same Traefik route so SSE/WebSocket regressions are caught before Dokploy.

## Delivered

- `docker-compose.dokploy.yml` runs Opzava behind local Traefik at
  `http://opzava.localhost:3080`.
- The app service uses `env_file: .env`, `expose` only, Traefik labels, a
  read-only root filesystem, writable `.data`, uid `1000`, and
  `HOME=/home/nextjs`.
- Local Traefik defaults to `traefik:v3.7.5` because older `v3.1` images fail
  against Docker 29+ daemons with Docker API `1.24` provider errors.
- The local Traefik HTTP entrypoint trusts forwarded headers so the smoke test
  can verify HTTPS-terminated cookie behavior on a plain local port.
- Optional gateway parity is modeled with the `mc-openclaw-gateway` profile and
  Traefik labels for `opzava-gateway.localhost`.
- `scripts/dokploy-parity-test.sh` starts the stack, verifies routed health, no
  direct app port, runtime user/filesystem invariants, and secure `__Host`
  session-cookie behavior.
- The parity smoke opens `/api/events` through Traefik and asserts
  `text/event-stream`, `retry: 5000`, and the initial `connected` frame.
- Docker and standalone startup now run `scripts/mc-server.cjs`, which patches
  the Next standalone server to serve `/ws/pty` while preserving Next's own
  upgrade handler. The runtime image installs `tmux` and explicitly carries
  `node-pty`, `ws`, and the PTY wrapper scripts.
- The PTY WebSocket path is operator-gated, uses a 30s server heartbeat, caps
  inbound frames at 64 KiB, closes backpressured clients at 1 MiB, clamps resize
  requests, and kills the per-connection PTY on close.
- The parity smoke opens `/ws/pty` through Traefik with API-key auth and asserts
  the deterministic missing-tmux-session error, proving the upgrade reaches the
  app wrapper rather than stopping at Traefik or bare Next standalone.
- The Dokploy-parity Traefik service uses sticky cookies for app-service
  affinity. PTY is intentionally local-affinity because `tmux`/`node-pty` state
  is process/container-local; non-sticky multi-host scale requires an external
  PTY broker.
- The parity app service intentionally has no fixed `container_name`, so
  `docker compose --scale mission-control=N` remains usable for local sticky
  affinity checks. Traefik and the optional gateway stay singletons.
- SSE now persists broadcasts in `realtime_events`, emits durable `id:` frames,
  honors `Last-Event-ID`, supports `types=...` on `/api/events`, hard-filters
  `/api/v1/runs/stream` to `run.*`, heartbeats every 15s, polls SQLite for
  same-host cross-process delivery, prunes old durable events, closes slow
  streams on backpressure, and does not replay unresolved-workspace events to
  scoped clients. Filtered live events do not advance the durable replay cursor.
- The browser SSE hook uses native EventSource reconnect and dedupes durable
  event ids; store inserts for tasks, agents, and notifications are idempotent.
- The gateway WebSocket fallback path now only probes alternate proxy paths when
  the initial handshake never completed.
- Gateway and terminal WebSocket sends now close deterministically on client-side
  backpressure instead of buffering without bound. Malformed oversized gateway
  frames are closed/log-truncated, and terminal/PTX setup is guarded against
  stale async connection races.
- `playwright.dokploy.config.ts` targets an already-running Docker stack with no
  local `webServer`.
- `package.json` has `test:docker:dokploy` and `test:e2e:dokploy`.
- The system map was updated in `00-database-ledger.md`, `51-inherited-integrations.md`,
  `60-api-layer.md`, `61-frontend.md`, `62-tooling-build-governance.md`,
  `99-verification-register.md`, and the system-map index.

## Commands

```bash
pnpm test:docker:dokploy
DOKPLOY_PARITY_RUN_E2E=1 pnpm test:docker:dokploy
```

Gateway profile smoke/manual startup:

```bash
NEXT_PUBLIC_GATEWAY_OPTIONAL=false \
NEXT_PUBLIC_GATEWAY_HOST=opzava-gateway.localhost \
NEXT_PUBLIC_GATEWAY_PORT=3080 \
NEXT_PUBLIC_GATEWAY_PROTOCOL=ws \
OPENCLAW_GATEWAY_HOST=mc-openclaw-gateway \
docker compose -f docker-compose.dokploy.yml --profile openclaw up -d --build
```

## Verified

- `docker compose -f docker-compose.dokploy.yml config`
- `docker compose -f docker-compose.dokploy.yml --profile openclaw config`
- `pnpm exec vitest run src/lib/__tests__/docker-compose-schema.test.ts src/lib/__tests__/session-cookie.test.ts`
- `pnpm exec vitest run src/lib/__tests__/realtime-events.test.ts src/lib/__tests__/events-route.test.ts src/lib/__tests__/runs-stream-route.test.ts src/store/realtime-idempotency.test.ts src/lib/__tests__/notifications-route.test.ts src/lib/__tests__/docker-compose-schema.test.ts`
- `pnpm exec vitest run src/lib/__tests__/pty-websocket-auth.test.ts src/lib/__tests__/pty-websocket-standalone.test.ts src/lib/__tests__/docker-compose-schema.test.ts`
- `pnpm typecheck`
- `pnpm test:governance`
- `pnpm lint` (0 errors; existing warning baseline)
- `pnpm test` (276 files / 2065 tests)
- `DOKPLOY_PARITY_KEEP_UP=1 pnpm test:docker:dokploy`
- `docker compose -p opzava-dokploy-parity -f docker-compose.dokploy.yml up -d --scale mission-control=2`
  then health + sticky-cookie check, followed by scale back to one replica
- Traefik-routed `/api/v1/runs/stream?lastEventId=...` durable replay after
  creating a run through `/api/v1/runs`
- `docker compose -p opzava-dokploy-parity -f docker-compose.dokploy.yml ps`
- `curl -fsS http://opzava.localhost:3080/api/status?action=health`
- Runtime check inside `mission-control`: `make --version`, `tmux -V`, `require("ws")`, `require("node-pty")`
- Fleet re-audit cleared the SSE cursor, PTY close-before-attach, terminal
  stale async setup, and oversized malformed gateway-frame blockers.

## Current Local Docker Status

The local Dokploy-parity stack is running because the last smoke used
`DOKPLOY_PARITY_KEEP_UP=1`.

- App service: `mission-control`, image `opzava-dokploy-local`, healthy,
  `3000/tcp` exposed only to the Docker network. Compose generates replica
  container names for scale parity.
- Traefik: `opzava-dokploy-traefik`, published at `http://opzava.localhost:3080`.
- Optional gateway: configured as the `openclaw` profile, not running in the
  default parity stack unless explicitly enabled.
- Logs confirm startup through `scripts/mc-server.cjs` and `/ws/pty` wrapper registration.

Known pre-existing build warning: Turbopack reports a broad dynamic path pattern
in `src/app/api/super/os-users/route.ts:49`. It does not block the Docker
parity build or smoke.

## Make Status

Host GNU Make is installed and verified as `GNU Make 4.4.1`. The Docker runtime
image also installs GNU Make (`GNU Make 4.3`) for native module builds.

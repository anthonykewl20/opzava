# Provisioning Worker Bring-Up

The provisioning worker is the only service allowed to mutate Gateway/provider connection state. Web
talks to it over the internal `PROVISIONING_WORKER_URL` boundary, and the gateway-broker hot path is
unchanged.

## Required configuration

Set these through `.env` for local compose or managed secrets in Dokploy:

- `PROVISIONING_WORKER_TOKEN`: shared web-to-worker bearer token. Generate a high-entropy value
  outside local dev.
- `COMPOSE_PROVISIONING_WORKER_URL`: Docker-internal URL, normally
  `http://provisioning-worker:19188`.
- `OPENCLAW_GATEWAY_URL`: admin WebSocket URL, normally `ws://openclaw-platform-gateway:18789` in
  compose.
- `OPENCLAW_OPERATOR_DEVICE_TOKEN`: paired operator device token for the worker. This token stays on
  the worker and is never passed to the gateway-broker.
- `OPENCLAW_OPERATOR_SCOPES`: optional comma- or space-separated scopes to request at Gateway
  connect. Leave unset for read-only snapshot/catalog access, set
  `operator.write,operator.approvals` for bounded operator devices, and include `operator.admin`
  only for workers allowed to mutate Gateway config.
- `OPENCLAW_DEVICE_PRIVATE_KEY_PEM_BASE64` or `OPENCLAW_DEVICE_PRIVATE_KEY_PEM`: Ed25519 private key
  used to sign the Gateway admin handshake.
- `OPENCLAW_DEV_SECRETS_FILE`: local file vault path. Compose uses
  `/run/opzava-secrets/openclaw-secrets.json`.
- `GITHUB_OAUTH_CLIENT_ID`: public GitHub OAuth App client id with device flow enabled.
- `GITHUB_ISSUES_REPOSITORY`: repository shown and managed by the GitHub card.

`OPENCLAW_GATEWAY_TOKEN` is accepted only as a bootstrap fallback while pairing the worker device.
Prefer `OPENCLAW_OPERATOR_DEVICE_TOKEN` for steady-state so the two-token boundary remains explicit.

## Local compose

1. Generate `PROVISIONING_WORKER_TOKEN` and put it in `.env`.
2. Pair the worker operator device and put only the resulting `OPENCLAW_OPERATOR_DEVICE_TOKEN` plus
   the matching private key env in `.env`.
3. Create a GitHub OAuth App, enable device flow, and set `GITHUB_OAUTH_CLIENT_ID`.
4. Bring the stack up:

```sh
docker compose up --build web provisioning-worker gateway-broker openclaw-platform-gateway
```

The worker mounts `.dev-secrets` read-write so GitHub device-flow tokens can be stored through
`SecretsVaultPort`. The broker mounts the same vault read-only and does not receive Docker socket
proxy access.

## Docker mutation boundary

Compose exposes `DOCKER_HOST=tcp://docker-socket-proxy:2375` only to `provisioning-worker`. The
proxy enables container/network mutation verbs needed by provisioning and keeps build, exec, images,
volumes, swarm, secrets, and services endpoints disabled. Do not attach the gateway-broker or web
service to this proxy.

## Gateway catalog and auth behavior

The Connections page reads the live provider catalog through Gateway admin RPC
`models.list({ "view": "all" })`. Provider rows must not be hardcoded in web.

API-key provider connects call `config.patch` and store the key inside the Gateway auth profile.
GitHub connects use GitHub device flow and store the access token in `SecretsVaultPort`; status is
validated against `GET https://api.github.com/user` and the OAuth scopes response header.
Main-orchestrator selection calls the worker's `/internal/connections/orchestrator/set-main` route, writes the Gateway primary model through the same admin boundary, moves the browser lead badge only after a successful mutation response, and reconciles the UI from the next Connections snapshot.

Snapshot, health, catalog, and config-read paths need only `operator.read`; the Gateway also reports
`operator.read` when a connected token holds `operator.write`. `config.patch` mutations are locally
gated with `requiredScope: "operator.admin"` and return a structured
`provisioning.openclawAdmin.operatorAdminRequired` error before any provider key is sent when the
worker device is not admin-scoped.

The inspected Gateway image `ghcr.io/openclaw/openclaw:2026.6.11` (Q18: same version, now built from
`./mainframe` per ADR-016 — findings unchanged) documents
`wizard.start/next/status/cancel`, but its live `wizard.start` validator accepts only `mode` and
`workspace`. It does not expose a targeted provider/auth-choice admin RPC for model-provider
device-code OAuth. Until that RPC exists, the GUI returns an explicit unsupported state for
model-provider device-flow choices and keeps API-key and GitHub device-flow paths live.

## Verification

Use the repo commands for the changed surfaces:

```sh
PNPM_CONFIG_STORE_DIR=/tmp/opzava-pnpm-store pnpm --filter @opzava/workers typecheck
PNPM_CONFIG_STORE_DIR=/tmp/opzava-pnpm-store pnpm --filter @opzava/workers lint
PNPM_CONFIG_STORE_DIR=/tmp/opzava-pnpm-store pnpm --filter @opzava/workers build
PNPM_CONFIG_STORE_DIR=/tmp/opzava-pnpm-store pnpm --filter @opzava/workers exec vitest run src/provisioning/__tests__/connections.test.ts
PNPM_CONFIG_STORE_DIR=/tmp/opzava-pnpm-store pnpm --filter @opzava/web build
PROVISIONING_WORKER_TOKEN=verify docker compose config --quiet
docker build -f apps/workers/Dockerfile -t opzava/provisioning-worker:local .
docker run --rm -e PROVISIONING_WORKER_TOKEN=verify opzava/provisioning-worker:local
```

The full worker test script also runs roadmap seed integration tests and requires
`DATABASE_MIGRATION_URL` plus a reachable migration database.

# Runbook - gateway-broker bring-up

This runbook brings up the live `gateway-broker` path used by Ask Admin Opzava:

`apps/web` -> `gateway-broker` internal HTTP/SSE -> OpenClaw platform Gateway WS.

The platform Gateway and `gateway-broker` now run by default in `docker-compose.yml` for the
internal single-tenant phase. The Gateway remains expose-only with no Traefik labels; only the
broker is routable through Traefik at `gateway-broker.opzava.localhost`.

## Required local files and env

```bash
mkdir -p secrets .dev-secrets
test -f secrets/postgres_password || openssl rand -base64 36 > secrets/postgres_password
cp -n .env.example .env
```

Set these in `.env` before `docker compose up`:

```bash
BETTER_AUTH_SECRET=<openssl-rand-base64-48>
BROKER_INTERNAL_TOKEN=<openssl-rand-base64-48>
OPENCLAW_GATEWAY_TOKEN=<openssl-rand-hex-24>
OPENCLAW_GATEWAY_TENANT_ID=93b43f1a-1d25-406d-b52c-8b4fd3cde01d
OPENCLAW_DEV_SECRETS_DIR=.dev-secrets
OPENCLAW_DEV_SECRETS_FILE=.dev-secrets/openclaw-secrets.json
COMPOSE_OPENCLAW_DEV_SECRETS_FILE=/run/opzava-secrets/openclaw-secrets.json
```

Generate the broker device key once per environment and put the base64 value in
`OPENCLAW_DEVICE_PRIVATE_KEY_PEM_BASE64`:

```bash
node -e "const { generateKeyPairSync } = require('node:crypto'); const { privateKey } = generateKeyPairSync('ed25519'); process.stdout.write(Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64'))"
```

Use the seeded Anito org id above unless the active Opzava org changes. If it changes, set
`OPENCLAW_GATEWAY_TENANT_ID` to the authenticated org id that the web session sends to the broker.

The broker verifies at boot that `OPENCLAW_GATEWAY_TENANT_ID` resolves to the org recorded in
`first_owner_setup` (it reads that singleton over the app-role `DATABASE_URL`, which compose
supplies from `COMPOSE_DATABASE_URL`). If the env value has drifted from the seeded org — for
example after a reseed created a new org id while `.env` kept the old one — the broker refuses to
start and logs a fatal naming both ids (`configuredTenantId` vs `seededOrgId`), so the fix is one
step: set `OPENCLAW_GATEWAY_TENANT_ID=<seededOrgId>` and recreate the container. If no org has been
seeded yet, it fails with `gatewayBroker.tenantOrgUnresolved` until first-owner setup completes.
This does not weaken the runtime #188 tenant cross-check, which still denies any caller whose
principal tenant differs from the route.

## Start the compose stack

```bash
docker compose config
docker compose up -d postgres minio minio-bucket-init openclaw-platform-gateway gateway-broker web
```

Local host access to the Gateway is `http://127.0.0.1:18799` from `docker-compose.override.yml`.
Container-to-container broker access uses `ws://openclaw-platform-gateway:18789`.

## Pair the broker operator device token

First run the bootstrap. It creates a pending Gateway device pairing when no token is stored yet.

```bash
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18799 \
OPENCLAW_DEV_SECRETS_FILE=.dev-secrets/openclaw-secrets.json \
pnpm --filter @opzava/workers bootstrap:platform-gateway
```

If the receipt is `pending_approval`, approve that exact request inside the Gateway container:

```bash
docker compose exec openclaw-platform-gateway sh -lc \
  'node openclaw.mjs devices approve "$1" --url ws://127.0.0.1:18789 --token "$OPENCLAW_GATEWAY_TOKEN"' \
  -- <requestId>
```

If the approval prints a device token, validate and store it in the local SecretsVault:

```bash
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18799 \
OPENCLAW_DEV_SECRETS_FILE=.dev-secrets/openclaw-secrets.json \
OPENCLAW_OPERATOR_DEVICE_TOKEN=<approved-operator-device-token> \
pnpm --filter @opzava/workers bootstrap:platform-gateway
```

Restart the broker after the vault file contains the token:

```bash
docker compose up -d gateway-broker web
docker compose logs -f gateway-broker
```

The broker hot path must validate only `operator.write` and `operator.approvals` plus the
Gateway-materialized `operator.read`. Any `operator.admin`, `operator.pairing`, or
`operator.talk.secrets` scope fails closed.

## Sign in Codex OAuth for the Gateway

This is still an interactive, per-environment step:

```bash
docker compose exec -it openclaw-platform-gateway node openclaw.mjs onboard --auth-choice openai-device-code
```

Open the printed URL, enter the device code, and sign in with the GPT Pro/Codex account. Then test
Ask Admin Opzava from the web app at `http://web.opzava.localhost:18088/ask-opzava`.

## Persistence facts

- The Slice-2 paired operator device token is persisted by `LocalFileSecretsVault` in
  `OPENCLAW_DEV_SECRETS_FILE`, not in Postgres and not in an OpenClaw Gateway volume.
- The broker container reads the same token because compose mounts `OPENCLAW_DEV_SECRETS_DIR`
  read-only at `/run/opzava-secrets` and sets
  `COMPOSE_OPENCLAW_DEV_SECRETS_FILE=/run/opzava-secrets/openclaw-secrets.json`.
- A fresh broker container can read the token if that bind-mounted vault file exists. If the token
  was previously written to `/tmp/opzava-openclaw-dev-secrets.json`, copy it into `.dev-secrets/` or
  re-run pairing; otherwise the fresh container cannot see it.
- Codex OAuth persists in the `openclaw-platform-auth-profiles` named volume mounted at
  `/home/node/.config/openclaw`. A fresh Gateway container with that same volume keeps the sign-in;
  deleting the volume or deploying a new environment requires the device-code sign-in again.

# Opzava

Opzava is a pnpm/Turborepo TypeScript monorepo with a Next.js App Router web app,
gateway-broker service boundary, worker shell, shared kernel, and foundation ports.

## Local Development

```sh
corepack enable pnpm
corepack use pnpm@11.9.0
pnpm install
cp secrets/postgres_password.example secrets/postgres_password
docker network create dokploy-network
pnpm dev
make up
```

The local web route is:

```text
http://web.opzava.localhost:18088
```

Traefik also exposes its local dashboard on `http://localhost:18089`. The
dashboard is a local development convenience and must not be exposed in live
Dokploy environments.

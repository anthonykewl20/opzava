# syntax=docker/dockerfile:1.7

FROM node:24.18.0-bookworm AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/crm/package.json packages/crm/package.json
COPY packages/identity-access/package.json packages/identity-access/package.json
COPY packages/project-management/package.json packages/project-management/package.json
COPY packages/runtime-control/package.json packages/runtime-control/package.json
COPY packages/shared-kernel/package.json packages/shared-kernel/package.json
COPY packages/ports/package.json packages/ports/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/gateway-broker/package.json apps/gateway-broker/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY apps/workers/package.json apps/workers/package.json
RUN --mount=type=cache,id=opzava-pnpm-store,target=/pnpm/store \
  pnpm --store-dir /pnpm/store install --frozen-lockfile

FROM base AS builder
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm exec turbo run build --filter=@opzava/gateway-broker

FROM builder AS deploy
RUN --mount=type=cache,id=opzava-pnpm-store,target=/pnpm/store \
  pnpm --store-dir /pnpm/store --filter @opzava/gateway-broker deploy --prod --legacy /app/deploy/gateway-broker \
  && rm -rf \
    /app/deploy/gateway-broker/.turbo \
    /app/deploy/gateway-broker/Dockerfile \
    /app/deploy/gateway-broker/src \
    /app/deploy/gateway-broker/tsconfig.build.json \
    /app/deploy/gateway-broker/tsconfig.json \
    /app/deploy/gateway-broker/vitest.config.ts

FROM node:24.18.0-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=19088
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs broker
COPY --from=deploy --chown=broker:nodejs /app/deploy/gateway-broker ./
USER broker
EXPOSE 19088
CMD ["node", "dist/main.js"]

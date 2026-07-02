# syntax=docker/dockerfile:1.7

FROM node:24.18.0-bookworm AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate

FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared-kernel/package.json packages/shared-kernel/package.json
COPY packages/ports/package.json packages/ports/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/gateway-broker/package.json apps/gateway-broker/package.json
COPY apps/workers/package.json apps/workers/package.json
RUN pnpm install --frozen-lockfile

FROM base AS builder
ARG APP_URL=http://web.opzava.localhost:18080
ENV APP_URL=$APP_URL
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY . .
RUN pnpm --filter @opzava/web build

FROM node:24.18.0-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "server.js"]

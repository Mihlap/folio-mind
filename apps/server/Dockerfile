FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/server/prisma ./apps/server/prisma
COPY packages/*/package.json ./packages/
ARG PRISMA_ENGINES_MIRROR
ARG PNPM_REGISTRY=https://registry.npmmirror.com
ENV PRISMA_ENGINES_MIRROR=$PRISMA_ENGINES_MIRROR
ENV npm_config_registry=$PNPM_REGISTRY \
    npm_config_fetch_timeout=30000 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=5000 \
    npm_config_fetch_retry_maxtimeout=20000
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/. ./packages/
ARG PRISMA_ENGINES_MIRROR
ARG PNPM_REGISTRY=https://registry.npmmirror.com
ENV PRISMA_ENGINES_MIRROR=$PRISMA_ENGINES_MIRROR
ENV npm_config_registry=$PNPM_REGISTRY \
    npm_config_fetch_timeout=30000 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=5000 \
    npm_config_fetch_retry_maxtimeout=20000
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @folio-mind/server build

FROM node:20-alpine AS runner
WORKDIR /app/apps/server
ENV NODE_ENV=production

COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./
COPY --from=builder /app/apps/server/prisma ./prisma
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/server/node_modules ./node_modules
COPY --from=builder /app/packages /app/packages

EXPOSE 3001
CMD ["node", "--no-warnings", "--import", "tsx", "dist/index.js"]

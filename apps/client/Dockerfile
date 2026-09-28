FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/client/package.json ./apps/client/
COPY packages/*/package.json ./packages/
ARG PNPM_REGISTRY=https://registry.npmmirror.com
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
COPY --from=deps /app/apps/client/node_modules ./apps/client/node_modules
COPY --from=deps /app/packages/. ./packages/
ARG PNPM_REGISTRY=https://registry.npmmirror.com
ENV npm_config_registry=$PNPM_REGISTRY \
    npm_config_fetch_timeout=30000 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=5000 \
    npm_config_fetch_retry_maxtimeout=20000
RUN pnpm install --frozen-lockfile
ARG VITE_API_URL
RUN pnpm --filter @folio-mind/client build

FROM nginx:alpine AS runner
COPY --from=builder /app/apps/client/dist /usr/share/nginx/html
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

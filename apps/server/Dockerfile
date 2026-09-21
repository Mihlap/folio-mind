FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

FROM base AS deps
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/server/prisma ./apps/server/prisma
COPY packages/*/package.json ./packages/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=deps /app/packages/. ./packages/
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

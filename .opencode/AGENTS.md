# folio-mind — Agent instructions

# Пример каркаса

## Primary Goal
Опишите, что делает проект и какую бизнес-цель он решает.

## Expected Repository Structure
- apps/
- src/
- docs/specs/
- .opencode/agents/
- .opencode/skills/

## Delivery Workflow
1. Уточнить задачу.
2. При необходимости обновить specs.
3. Реализовать минимальный рабочий slice.
4. Обновить сопутствующую документацию.
## Quick start

```bash
pnpm install
docker compose up -d          # postgres:5434, redis:6379, minio:9000
pnpm db:push                  # sync Prisma schema (NOT migrate)
pnpm dev                      # turbo: client(5173), server(3001), worker
```

## Monorepo layout

`apps/` — client (React 19 + Vite), server (Fastify 5), worker (BullMQ)  
`packages/` — ui, store (Redux/RTKQ), pdf-contracts, api-client, ai-contracts, ai-providers, observability

## Commands

| Command | What |
|---|---|
| `pnpm dev` | client + server + worker (turbo) |
| `pnpm dev:client` | client only |
| `pnpm dev:server` | server only |
| `pnpm build` | all packages → dist/ |
| `pnpm lint` | ESLint flat config across all `**/*.{ts,tsx}` |
| `pnpm typecheck` | turbo (dependsOn `^build`) |
| `pnpm test` | turbo (dependsOn `^build`) |
| `pnpm format` | prettier `**/*.{ts,tsx,js,mjs,json,md}` |
| `pnpm db:push` | fast schema sync (use instead of migrate) |
| `pnpm db:generate` | re-generate Prisma client |
| `pnpm smoke:phase1` | smoke test via `tools/smoke-phase1.mjs` |

CI order: `lint` → `typecheck` → `test`. Typecheck & test need build first (turbo handles this).

## Key constraints

- **Postgres on `:5434`** (not 5432) to avoid local conflicts.
- **ESLint** — `no-unused-vars` allows `_` prefix; `react-refresh/only-export-components` is warn.
- **Prettier** — semicolons, single quotes, trailing commas, 100 print width.
- **Code style** — Prefer adding comments ONLY when asked; avoid emojis.
- **Vitest quirks** — server tests need `inline: [/@folio-mind\/observability/, /@opentelemetry\//]` (already in config). Client tests use jsdom + `globals: true`.
- **Auth** — JWT in cookies (`@fastify/jwt`).
- **S3** — local MinIO (folio/folio, bucket `folio-mind`, prefixes under `folioFiles/`).

## OpenCode config

`.opencode/opencode.json` registers a `designmd` MCP tool (`npx designmd-mcp`, requires `DESIGNMD_API_KEY` env var). The `.opencode/` dir is gitignored.

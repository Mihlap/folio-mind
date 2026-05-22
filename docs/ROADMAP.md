# Roadmap

См. чеклисты в [PROJECT_PLAN.md](../PROJECT_PLAN.md) §5.

| Фаза | Статус |
|------|--------|
| 0 Подготовка | **готово** (CI отложен) |
| 1 Web MVP | запланировано |
| 2 Правки и RAG | запланировано |
| 2b Буклеты | запланировано |
| 3 Конвертация | запланировано |
| 4 Mobile | запланировано |

## Фаза 0 — что сделано

- ICP, VISION, PDF licenses, legal черновики (`docs/legal/`)
- Монорепо pnpm + turbo, ESLint/Prettier, typecheck/test
- `docker-compose`: Postgres **:5434**, Redis, MinIO + `minio-init`
- Prisma: модели + миграция `20250522120000_init`
- Auth JWT, `/health`, `/me`
- `apps/server`: Fastify, swagger, multipart, rate-limit, tracing
- `apps/worker`: очереди `preview`, `ai` (заглушки)
- `packages/observability`: OTEL (console) + `request_id`
- `packages/store`, `packages/ai-providers`

## Не в фазе 0

- GitHub Actions (install, lint, typecheck, test)
- `packages/ui` (PDF viewer — фаза 1)

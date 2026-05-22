# Развёртывание и производительность (§3.7)

Краткие заметки для фазы 0. Детали — [PROJECT_PLAN.md](../PROJECT_PLAN.md) §3.7.

## Локальная разработка

| Сервис | Порт на хосте | Примечание |
|--------|---------------|------------|
| Postgres (Docker) | **5434** | На 5432/5433 часто уже стоит локальный PostgreSQL |
| Redis | 6379 | |
| MinIO API / Console | 9000 / 9001 | |
| API | 3001 | |
| Web (Vite) | 5173 | |

`DATABASE_URL` в `apps/server/.env`:

```env
DATABASE_URL=postgresql://folio:folio@localhost:5434/folio_mind
```

После `docker compose up -d`:

```bash
pnpm db:push
# или для prod-подобного потока:
pnpm db:migrate
```

## PostgreSQL в продакшене

- **PgBouncer** (transaction mode) перед Postgres при нескольких репликах API — снижает число соединений от Prisma.
- Индексы уже в схеме: `(tenantId, updatedAt)` на `Document`, `(tenantId, createdAt)` на `AuditLog`.
- Избегать тяжёлого `OFFSET` на больших таблицах — в API использовать курсорную пагинацию (фаза 1).

## Redis

- Один инстанс допустим на старте: BullMQ + rate limit + кэш ИИ.
- При росте — разделить DB index или отдельные инстансы (очереди / кэш / лимиты).

## S3

- Префиксы под один bucket: `folioFiles/originals`, `previews`, `processing`, `exports`, `media` — см. `apps/server/src/lib/s3-paths.ts`.
- Lifecycle: короткий TTL на `processing/` (24–72 ч).
- CDN перед `previews/` в проде.

## Наблюдаемость

- `OTEL_ENABLED=true` — базовые трейсы в консоль (dev).
- Заголовок `x-request-id` на всех ответах API; передавать в worker через payload джобы.
- В проде: OTLP endpoint (`OTEL_EXPORTER_OTLP_ENDPOINT`) — настроить при появлении коллектора.

## API

- Stateless, 2+ реплики за балансировщиком.
- Тяжёлые операции только через BullMQ (`preview`, `ai`, `optimize`).
- Rate limit: глобальный + отдельный черновик для upload (см. `apps/server/src/lib/rate-limits.ts`).

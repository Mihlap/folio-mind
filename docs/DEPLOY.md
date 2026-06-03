# Deploy и локальное окружение — Folio Mind

## Локальная разработка

### Требования

- Node.js **≥ 20** (Active LTS)
- pnpm **9.x** (`packageManager` в корневом `package.json`)
- Docker Desktop (WSL2 на Windows)
- Git

### Порты (docker compose)

| Сервис | Порт на хосте | Назначение |
|--------|---------------|------------|
| PostgreSQL | **5434** | БД `folio_mind` (user/pass: `folio`/`folio`) |
| Redis | **6379** | BullMQ, кэш |
| MinIO API | **9000** | S3-совместимое API |
| MinIO Console | **9001** | Веб-консоль MinIO |

### Приложение (pnpm dev)

| Сервис | URL |
|--------|-----|
| Web (Vite) | http://localhost:5173 |
| API (Fastify) | http://localhost:3001 |
| Swagger | http://localhost:3001/docs |
| Health | http://localhost:3001/health |

### Переменные окружения

Скопировать примеры:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
cp apps/worker/.env.example apps/worker/.env
```

**Server (`apps/server/.env`):**

| Переменная | Пример (dev) |
|------------|----------------|
| `DATABASE_URL` | `postgresql://folio:folio@127.0.0.1:5434/folio_mind` (на Windows предпочтительнее `127.0.0.1`, чем `localhost`) |
| `REDIS_URL` | `redis://127.0.0.1:6379` |
| `JWT_SECRET` | мин. 32 символа |
| `CORS_ORIGIN` | `http://localhost:5173` |
| `S3_ENDPOINT` | MinIO: `http://localhost:9000` или облако (Timeweb и т.д.) |
| `S3_*` | ключи, bucket, region |
| `AI_PROVIDER` | `gigachat` \| `yandex` |

**Клиент:** `VITE_API_URL=http://localhost:3001` (см. `apps/client/.env.example`).

### S3: префиксы в приложении

Логический корень: `folioFiles/` (см. `apps/server/src/lib/s3-paths.ts`):

| Префикс | Содержимое |
|---------|------------|
| `folioFiles/originals/` | Исходные PDF по версиям |
| `folioFiles/previews/` | Миниатюры страниц |
| `folioFiles/processing/` | Временные файлы worker (TTL) |
| `folioFiles/exports/` | Отчёты, выгрузки |
| `folioFiles/rag-sources/` | Шаблоны/регламенты для RAG |
| `folioFiles/media/` | Медиатека проектов (буклеты) |

**Dev:** бакет `folio-mind` создаётся сервисом `minio-init` в `docker-compose.yml`.  
**Prod:** облачный S3 (AWS, Yandex Object Storage, Timeweb Cloud и др.) — один SDK `@aws-sdk/client-s3`.

Инициализация MinIO вручную (Windows):

```powershell
powershell -File .\tools\init-minio.ps1
```

### База данных

```bash
pnpm db:push      # быстро для dev
pnpm db:migrate   # формальные миграции
```

### Запуск

```bash
docker compose up -d
pnpm install
pnpm db:push
pnpm dev
```

На Windows PowerShell при блокировке скриптов: `pnpm.cmd` или `set-executionpolicy -scope process -executionpolicy bypass`.

---

## Продакшен (ориентир)

| Компонент | Рекомендация |
|-----------|--------------|
| API | 2+ stateless реплики за балансировщиком |
| Worker | Горизонтально, отдельные очереди BullMQ |
| Postgres | Managed + **PgBouncer** (transaction mode) |
| Redis | Отдельные DB/инстансы для очередей и кэша при росте |
| S3 | SSE, lifecycle на `processing/`, CDN перед `previews/` |
| ИИ | `AI_PROVIDER` в env; VPC/on-prem endpoint по договорённости |

### OpenTelemetry

```env
OTEL_ENABLED=true
# OTEL_EXPORTER_OTLP_ENDPOINT=http://...
```

Метрики: p95 API, длина очередей, длительность джоб, токены ИИ.

### SLA по слоям (кратко)

- **API:** auth, ACL, метаданные, presigned URL — без Ghostscript/LLM в HTTP.
- **Worker:** превью, конвертация, сжатие, тяжёлый ИИ.
- **Клиент:** viewer на превью + виртуализация; не сжимать 50+ МБ в браузере.

---

## CI

GitHub Actions: lint, typecheck, test, build (см. `.github/workflows/ci.yml`).

---

См. [PROJECT_PLAN.md](../PROJECT_PLAN.md) §3.4, §3.7, §4.6.

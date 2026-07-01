# Folio Mind

Платформа для работы с PDF и ИИ: просмотр, версии, конвертация, аудит, буклеты для архитекторов.

## Стек

React (Vite) · Redux Toolkit · RTK Query · Fastify · Prisma · PostgreSQL · Redis · BullMQ · S3 (Timeweb Cloud, префикс `folioFiles/`) · PDF.js · GigaChat / YandexGPT

**Собственный PDF-движок не пишем** — используем PDF.js, pdf-lib, Ghostscript/qpdf на worker. Граница «движок vs продукт»: см. [PROJECT_PLAN.md](./PROJECT_PLAN.md) §3.3 и [docs/PDF_LICENSES.md](./docs/PDF_LICENSES.md).

## Быстрый старт

```bash
# 1. Зависимости
pnpm install

# 2. Окружение (отдельный .env у server, client, worker)
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example  apps/client/.env
cp apps/worker/.env.example  apps/worker/.env

# 3. Инфраструктура (Postgres на хосте :5434 — не конфликтует с локальным PG)
docker compose up -d

# 4. БД — один из вариантов:
pnpm db:push          # быстро для dev
pnpm db:migrate       # формальные миграции (фаза 0)

# 5. Запуск
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3001 · Swagger: http://localhost:3001/docs
- MinIO: http://localhost:9001 (консоль) — бакет `folio-mind` создаётся сервисом `minio-init` в compose; логические префиксы `folioFiles/*` — в приложении
- Для прод/облака S3: ключи в `apps/server/.env` (Timeweb по умолчанию в `.env.example`)

### Локальная отладка

| Переменная          | Назначение                                                              |
| ------------------- | ----------------------------------------------------------------------- |
| `OTEL_ENABLED=true` | Консольные трейсы OpenTelemetry (server + worker)                       |
| `DATABASE_URL`      | `postgresql://folio:folio@localhost:5434/folio_mind` при Docker compose |

### Сжатие PDF (qpdf + Ghostscript)

Джоба `optimize-pdf` на worker вызывает **qpdf** и **Ghostscript** (текст остаётся векторным, сжимаются потоки и встроенные картинки). Без них остаётся только упаковка pdf-lib — размер почти не меняется.

**Windows (PowerShell):**

```powershell
winget install QPDF.QPDF
# Ghostscript: https://ghostscript.com/releases/gsdnld.html (в winget пакета нет)
```

После установки qpdf перезапустите worker (или укажите путь в `apps/worker/.env`):

```
QPDF_BIN=C:\Program Files\qpdf 12.3.2\bin\qpdf.exe
```

Перезапустите worker. В логе при старте: `PDF optimize tools: qpdf=ok, ghostscript=ok`.

Опционально в `apps/worker/.env`: `QPDF_BIN`, `GHOSTSCRIPT_BIN` (по умолчанию `qpdf` и `gswin64c`).

Опционально переинициализировать MinIO вручную: `powershell -File .\tools\init-minio.ps1`

## Документация

| Файл                                           | Содержание                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| [docs/VISION.md](./docs/VISION.md)             | Продукт и критерии v1                                               |
| [docs/ICP.md](./docs/ICP.md)                   | ICP и сценарий v1                                                   |
| [docs/ROADMAP.md](./docs/ROADMAP.md)           | Фазы разработки                                                     |
| [docs/DEPLOY.md](./docs/DEPLOY.md)             | Порты, PgBouncer, OTEL, S3                                          |
| [docs/AUTH.md](./docs/AUTH.md)                 | Регистрация по телефону, Яндекс OAuth, ЕСИА — настройка провайдеров |
| [docs/PDF_LICENSES.md](./docs/PDF_LICENSES.md) | Лицензии PDF-стека                                                  |
| [docs/legal/](./docs/legal/)                   | Privacy, DPA, субпроцессоры (черновики)                             |

## Скрипты

| Команда           | Описание                     |
| ----------------- | ---------------------------- |
| `pnpm dev`        | API + Web + Worker (turbo)   |
| `pnpm build`      | Сборка всех пакетов          |
| `pnpm test`       | Тесты                        |
| `pnpm lint`       | ESLint (только `.ts`/`.tsx`) |
| `pnpm typecheck`  | TypeScript                   |
| `pnpm db:push`    | Prisma schema → Postgres     |
| `pnpm db:migrate` | Prisma migrate dev           |

## Фаза 0 (статус)

Готово: монорепо, compose, Prisma + auth JWT, MinIO init, BullMQ заготовки, OTEL/request-id, rate-limit, документация в `docs/` (в т.ч. юридические черновики).

Отложено: нет критичных блокеров по фазе 0/1; CI (GitHub Actions) уже включён для PR.

## Фаза 1 (статус)

Фаза 1 формально закрыта: upload через presigned URL, viewer, превью/текст через worker, ИИ-очереди и smoke-проверка `pnpm smoke:phase1` пройдены.

См. [docs/ROADMAP.md](./docs/ROADMAP.md).

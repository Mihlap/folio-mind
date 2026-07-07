# Folio Mind (РазУм)

Веб-платформа **полного цикла работы с PDF**: хранение, версии, просмотр, операции с файлами, согласование с заказчиком и **ИИ-помощник** (чат, пересказ, правки с подтверждением, RAG по регламентам).

Позиционирование: **Acrobat-class + AI-native workflow** — не клон Adobe Acrobat, а свой продукт с упором на сценарии бюро и юридических команд. Собственный PDF-движок **не разрабатываем**; используем PDF.js, pdf-lib, Ghostscript/qpdf, Gotenberg и смежные инструменты.

---

## О проекте

Folio Mind закрывает цепочку «загрузил → посмотрел → поправил → согласовал → отдал заказчику» в одном месте, без пересылки тяжёлых файлов по почте и мессенджерам.

**Два основных сценария:**

| Аудитория | Типичный документ | Что даёт продукт |
|-----------|-------------------|------------------|
| **Юристы, комплаенс** | Договоры, регламенты, ТЗ | ИИ-аудит, правки «было / стало», DOCX-центричное «Применить правки», сверка с базой регламентов |
| **Архитектурные бюро** | Буклеты, альбомы, презентации объектов | Макет поверх PDF, медиатека рендеров, шаблоны бюро, сжатие, гостевая ссылка, замечания заказчика |

ИИ **предлагает и черновит**; критические действия (публикация, отправка, применение правок) — **только по явному действию** пользователя с записью в журнал аудита.

Подробнее: [docs/VISION.md](./docs/VISION.md), [docs/ICP.md](./docs/ICP.md).

---

## Какие задачи решает

- **Документы и версии** — проекты (папки объектов), история `v1…vN`, подписи «черновик / на согласовании / финал», сравнение версий.
- **Просмотр** — PDF.js в браузере: масштаб, поиск, миниатюры, режим презентации.
- **Макет буклета** — изображения и фигуры поверх PDF, crop, сетка, шаблоны бюро, медиатека организации.
- **Операции с PDF** — сжатие (пресеты), вырезка, объединение, перестановка и дублирование страниц.
- **Согласование с заказчиком** — гостевая ссылка (TTL, пароль), watermark, метки «ОК / нужны правки», комментарии на странице, ответ при «Решено», опционально email гостю.
- **Экспорт буклета** — ZIP (PDF + JPG), проверка DPI, опционально PDF/A.
- **Правки в тексте** — реестр правок, «Собрать PDF» для согласования, «Применить правки» через DOCX/Gotenberg.
- **ИИ** — чат по документу и по инструкции приложения, пересказ, предложения правок, RAG по загруженным регламентам.

Инструкция для конечных пользователей: [USER_GUIDE.md](./USER_GUIDE.md).

---

## Стек и структура репозитория

Монорепо **pnpm + Turborepo**, Node.js **≥ 20**.

| Часть | Технологии |
|-------|------------|
| **Web** (`apps/client`) | React 19, Vite, Redux Toolkit, RTK Query, Tailwind |
| **API** (`apps/server`) | Fastify, Prisma, Zod, JWT, OpenTelemetry |
| **Worker** (`apps/worker`) | BullMQ — превью, текст, сжатие, конвертация, ИИ-джобы |
| **Общие пакеты** (`packages/*`) | UI (PDF.js viewer), store (API), pdf-contracts, ai-providers |
| **Данные** | PostgreSQL 16 + **pgvector**, Redis, S3 (MinIO локально / облако в проде) |
| **PDF / Office** | PDF.js, pdf-lib, qpdf, Ghostscript, Gotenberg, pdf2docx (сервис в compose) |
| **ИИ** | GigaChat или YandexGPT (переключается в `.env`) |

```
folio-mind/
├── apps/client/     # SPA
├── apps/server/     # REST API, Prisma, auth
├── apps/worker/     # фоновые очереди
├── packages/        # ui, store, pdf-contracts, ai-providers
├── docs/            # vision, roadmap, deploy, auth
└── tools/           # smoke-тесты, скрипты установки GS
```

Лицензии PDF-стека: [docs/PDF_LICENSES.md](./docs/PDF_LICENSES.md). Архитектура и чеклисты: [PROJECT_PLAN.md](./PROJECT_PLAN.md).

---

## Быстрый старт

### Требования

- Node.js **≥ 20**, pnpm **9.x**
- Docker Desktop (Postgres, Redis, MinIO, Gotenberg, pdf2docx)

### Установка и запуск

```bash
# 1. Зависимости
pnpm install

# 2. Переменные окружения (отдельный .env у server, client, worker)
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example  apps/client/.env
cp apps/worker/.env.example  apps/worker/.env

# 3. Инфраструктура (Postgres на хосте :5434 — не конфликтует с локальным PG)
docker compose up -d

# 4. База данных
pnpm db:migrate          # рекомендуется (формальные миграции)
# pnpm db:push           # альтернатива для быстрого dev без migrate

# 5. Приложение
pnpm dev
```

### Адреса после `pnpm dev`

| Сервис | URL |
|--------|-----|
| Web | http://localhost:5173 |
| API | http://localhost:3001 |
| Swagger | http://localhost:3001/docs |
| MinIO Console | http://localhost:9001 (логин `minio` / `miniosecret`) |
| Gotenberg | http://localhost:3003 |
| pdf2docx | http://localhost:8080 |

Бакет `folio-mind` и префиксы `folioFiles/*` создаёт сервис `minio-init` в compose. Для облачного S3 — ключи в `apps/server/.env` (см. `.env.example`).

### Первый вход

Зарегистрируйте пользователя через UI или API (см. [docs/AUTH.md](./docs/AUTH.md)). Для ИИ укажите `AI_PROVIDER` и ключи провайдера в `apps/server/.env` и `apps/worker/.env` — [docs/AI_SETUP.md](./docs/AI_SETUP.md).

---

## Локальная отладка

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | `postgresql://folio:folio@127.0.0.1:5434/folio_mind` при Docker compose |
| `OTEL_ENABLED=true` | Консольные трейсы OpenTelemetry (server + worker) |

### Сжатие PDF (qpdf + Ghostscript)

Джоба `optimize-pdf` на worker использует **qpdf** и **Ghostscript**. Без них остаётся только упаковка pdf-lib — размер почти не меняется.

**Windows (PowerShell):**

```powershell
winget install QPDF.QPDF
powershell -File .\tools\install-ghostscript.ps1
```

Опционально в `apps/worker/.env`: `QPDF_BIN`, `GHOSTSCRIPT_BIN`. После установки перезапустите worker; в логе: `PDF optimize tools: qpdf=ok, ghostscript=ok`.

Переинициализация MinIO вручную: `powershell -File .\tools\init-minio.ps1`

Порты, PgBouncer, прод: [docs/DEPLOY.md](./docs/DEPLOY.md).

---

## Скрипты

| Команда | Описание |
|---------|----------|
| `pnpm dev` | API + Web + Worker |
| `pnpm build` | Сборка всех пакетов |
| `pnpm test` | Тесты |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm db:migrate` | Prisma migrate dev |
| `pnpm db:push` | Prisma db push (быстрый dev) |
| `pnpm db:regen-migration` | Пересобрать единую init-миграцию из schema |
| `pnpm smoke:phase1` | Smoke: upload, viewer, ИИ |
| `pnpm smoke:phase2` | Smoke: операции PDF, правки |
| `pnpm smoke:phase3` | Smoke: apply-edits (PDF overlay) |

---

## Документация

| Файл | Содержание |
|------|------------|
| [USER_GUIDE.md](./USER_GUIDE.md) | Инструкция для пользователя РазУм |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | Фазы разработки и текущий статус |
| [PROJECT_PLAN.md](./PROJECT_PLAN.md) | Технический план, архитектура, чеклисты |
| [docs/DEPLOY.md](./docs/DEPLOY.md) | Деплой, порты, S3, OTEL |
| [docs/AUTH.md](./docs/AUTH.md) | Регистрация, OAuth, SMS |
| [docs/AI_SETUP.md](./docs/AI_SETUP.md) | GigaChat / YandexGPT |
| [docs/PDF_LICENSES.md](./docs/PDF_LICENSES.md) | Лицензии PDF-стека |
| [docs/legal/](./docs/legal/) | Privacy, DPA (черновики) |

Полный указатель: [docs/README.md](./docs/README.md).

---

## Статус разработки

Актуальные фазы и процент готовности — в [docs/ROADMAP.md](./docs/ROADMAP.md). Кратко: закрыты фазы **0–1** (MVP), в активной доработке **2 / 2b** (правки, буклеты, согласование), частично **3** (DOCX-пайплайн, экспорт буклета).

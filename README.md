# Folio Mind (РазУм)

Веб-платформа **полного цикла работы с PDF**: хранение, версии, просмотр, операции с файлами, согласование с заказчиком и **ИИ-помощник** (чат, пересказ, правки с подтверждением, RAG по регламентам).

Позиционирование: **Acrobat-class + AI-native workflow** — не клон Adobe Acrobat, а свой продукт с упором на сценарии архитектурного бюро и юридических команд. Собственный PDF-движок **не разрабатываем**; используем PDF.js, pdf-lib, Ghostscript/qpdf, Gotenberg и смежные инструменты.

---

## О проекте

Folio Mind закрывает цепочку «загрузил → посмотрел → поправил → согласовал → отдал заказчику» в одном месте, без пересылки тяжёлых файлов по почте и мессенджерам.

**Два основных сценария:**

| Аудитория | Типичный документ | Что даёт продукт |
|-----------|-------------------|------------------|
| **Юристы, комплаенс** | Договоры, регламенты, ТЗ | ИИ-аудит, правки «было / стало», DOCX-центричное «Применить правки», сверка с базой регламентов |
| **Архитектурные бюро** | Буклеты, альбомы, презентации объектов | Макет поверх PDF, медиатека рендеров, шаблоны бюро, сжатие, гостевая ссылка, замечания заказчика |

ИИ **предлагает и черновит**; критические действия (публикация, отправка, применение правок) — **только по явному действию** пользователя с записью в журнал аудита.

Как пользоваться: [USER_GUIDE.md](./USER_GUIDE.md). Как развернуть: [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Какие задачи решает

- **Документы и версии** — проекты (папки объектов), история `v1…vN`, единый статус документа «черновик / на согласовании / утверждено», сравнение версий.
- **Просмотр** — PDF.js в браузере: масштаб, поиск, миниатюры, режим презентации.
- **Сканы без текстового слоя** — РазУм сам находит «мёртвые» PDF, предлагает **распознать текст** (OCR) и показывает прогресс; после распознавания включаются поиск и ИИ. Можно и принудительно: галочка при загрузке или кнопка **«Распознать текст»** на странице документа.
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
| **Mobile** (`apps/mobile`) | Capacitor — Android/PWA-обёртка для Web |
| **Общие пакеты** (`packages/*`) | ui (PDF.js viewer), store (API), pdf-contracts, api-client, ai-contracts, ai-providers, edit-markdown, observability |
| **Данные** | PostgreSQL 16 + **pgvector**, Redis, S3 (MinIO локально / облако в проде) |
| **PDF / Office** | PDF.js, pdf-lib, qpdf, Ghostscript, Gotenberg, pdf2docx (сервис в compose) |
| **ИИ** | GigaChat или YandexGPT (переключается в `.env`) |

```
folio-mind/
├── apps/client/     # SPA (Web)
├── apps/server/     # REST API, Prisma, auth
├── apps/worker/     # фоновые очереди
├── apps/mobile/     # Capacitor — Android/PWA
├── packages/        # ui, store, pdf-contracts, api-client, ai-contracts, ai-providers, ...
├── docker/pdf2docx/ # образ конвертера DOCX → PDF
├── tools/           # smoke-тесты, скрипты установки GS, webview-инструменты
├── docker-compose.yml       # локальная разработка (включая MinIO)
└── docker-compose.prod.yml  # прод: Postgres, Redis, Gotenberg, pdf2docx
```

Служебная документация (auth, SSE, публичный API) лежит вне репозитория в `docs/` и намеренно не публикуется — папка в `.gitignore`. Всё, что нужно для старта и деплоя, есть в трёх файлах: этот README, [USER_GUIDE.md](./USER_GUIDE.md) и [DEPLOYMENT.md](./DEPLOYMENT.md).

Лицензии PDF-стека используют GPL/LGPL/MPL — перед коммерческим использованием сверьтесь с условиями.

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

Зарегистрируйте пользователя через UI или API. Для ИИ укажите `AI_PROVIDER` и ключи провайдера в `apps/server/.env` и `apps/worker/.env` — без них не будут работать чат, проверка правок и **распознавание текста в сканах**. Прод требует внешний S3: ключи `S3_*` в `apps/server/.env.prod`.

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

Прод-деплой (Docker Compose + Dockerfile'ы): [docker-compose.prod.yml](./docker-compose.prod.yml), [apps/server/Dockerfile](./apps/server/Dockerfile), [apps/client/Dockerfile](./apps/client/Dockerfile), [apps/worker/Dockerfile](./apps/worker/Dockerfile). Пошаговая инструкция развёртывания на хостинге: [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Скрипты

| Команда | Описание |
|---------|----------|
| `pnpm dev` | API + Web + Worker |
| `pnpm dev:client` / `pnpm dev:server` | Только клиент или только API |
| `pnpm build` | Сборка всех пакетов |
| `pnpm test` | Тесты |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |
| `pnpm format` | Prettier по исходникам |
| `pnpm db:migrate` | Prisma migrate dev |
| `pnpm db:push` | Prisma db push (быстрый dev) |
| `pnpm db:generate` | Перегенерация клиента Prisma |
| `pnpm db:regen-migration` | Пересобрать единую init-миграцию из schema |
| `pnpm smoke:phase1` | Smoke: upload, viewer, ИИ |
| `pnpm smoke:phase2` | Smoke: операции PDF, правки |
| `pnpm smoke:phase3` | Smoke: apply-edits (PDF overlay) |
| `pnpm smoke:phase3:docx` | Smoke: apply-edits через DOCX |
| `pnpm smoke:phase3:pdf2docx` | Smoke: конвертация DOCX → PDF |
| `pnpm smoke:rag` | Smoke: RAG-чат по регламентам |
| `pnpm mobile:sync` | Синхронизация PWA в `apps/mobile` |
| `pnpm mobile:open:android` | Открыть проект Android Studio |
| `pnpm mobile:apk:debug` | Сборка Android APK (Capacitor) |

---

## Документация

| Файл | Содержание |
|------|------------|
| [USER_GUIDE.md](./USER_GUIDE.md) | Инструкция для пользователя: разделы, документы, сканы и OCR, согласование, ИИ, настройки |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Развёртывание на VPS: env, compose, Caddy, бэкапы, грабли |
| [apps/mobile/README.md](./apps/mobile/README.md) | Сборка Android APK и PWA-обёртки |

Описание REST API доступно в Swagger по адресу `/docs` у работающего API.

---



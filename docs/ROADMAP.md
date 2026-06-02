# Roadmap — Folio Mind

Ориентиры по срокам и критерии готовности. Детальные чеклисты — в [PROJECT_PLAN.md](../PROJECT_PLAN.md) §5.

## Сводка фаз

| Фаза | Срок (ориентир) | Результат | Статус |
|------|-----------------|-----------|--------|
| **0** Подготовка | 3–6 нед. | Dev-стек, auth, compose, каркас | ✅ в основном готово |
| **1** Web MVP | 2–4 мес. | S3, viewer, превью, ИИ v0 | ✅ завершено |
| **2** Правки и RAG | 3–6 мес. | Операции PDF, правки ИИ, регламенты | ⏳ |
| **2b** Буклеты | 3–6 мес. | Макет, медиатека, согласование | ⏳ |
| **3** Конвертация | 4–8 мес. | Office ↔ PDF, формы, подпись | ⏳ |
| **4** Mobile | 2–5 мес. | PWA, APK, офлайн буклет | ⏳ |

*Вне плана v1–v4 (бэклог): Enterprise SSO, on-prem, real-time co-editing.*

---

## Фаза 0 — Подготовка (3–6 недель)

**Цель:** рабочее dev-окружение и каркас монорепо.

- [x] Монорепо pnpm + turbo, ESLint, Prettier
- [x] Docker Compose: Postgres, Redis, MinIO
- [x] Prisma: User, Tenant, Document, DocumentVersion, Job, AuditLog
- [x] Auth: регистрация, вход, JWT, tenant isolation
- [x] Fastify API, React client, worker (очереди preview, ai)
- [x] OpenTelemetry/request-id, rate-limit (черновик)
- [x] `docs/` в репозитории (этот коммит)
- [x] CI GitHub Actions (lint + typecheck + test на PR)

**Критерий:** `docker compose up` + `pnpm dev` → API, UI, worker работают.

---

## Фаза 1 — Web MVP (2–4 месяца)

**Цель:** сценарий v1 — договор → просмотр → ИИ → отчёт + чат.

- [x] Presigned upload в S3, список документов (курсорная пагинация), `POST /documents` + `complete`
- [x] Базовый viewer PDF.js (`packages/ui`), маршрут `/app/documents/:id`
- [x] ИИ: фабрика GigaChat/Yandex, `GET /ai/providers`, `POST /ai/complete`, summary через очередь (stub worker)
- [x] Аудит: создание/просмотр/скачивание в `AuditLog`
- [x] Viewer: виртуализация (continuous scroll), поиск по тексту, zoom, `viewerSlice`
- [x] Worker: `generate-previews` (миниатюры PNG → S3) + `extract-text` (text.json → S3)
- [x] Viewer: полоса миниатюр (presigned URLs)
- [x] Версии: UI истории, новая версия upload
- [x] ИИ: пересказ через очередь (worker → GigaChat/Yandex), кэш Redis, polling статуса в UI
- [x] ИИ: чат-панель (очередь + polling), экспорт отчёта (Markdown → S3), лимиты tenant, выбор провайдера
- [x] Нагрузочный smoke: `pnpm smoke:phase1` — upload + preview + file на 50+ стр. (скрипт `tools/smoke-phase1.mjs`)

**Критерий:** PDF 10+ МБ загружается, превью асинхронно, ИИ не блокирует API.

---

## Фаза 2 — Редактирование и RAG (3–6 месяцев)

- [ ] pdf-lib / worker: merge, split, страницы
- [ ] Аннотации, diff версий
- [ ] ИИ: структурированные правки accept/reject
- [ ] RAG: шаблоны/регламенты, pgvector, «сверь с политикой»

---

## Фаза 2b — Буклеты и коллаб (3–6 месяцев)

*Параллельно с фазой 2 после стабильного viewer.*

- [ ] Режим макета: crop, линейки, градиенты
- [ ] Проект, медиатека, шаблоны бюро
- [ ] Пресеты сжатия (worker optimize)
- [ ] Guest-view, watermark, комментарии, статусы согласования

---

## Фаза 3 — Конвертация, формы, подпись (4–8 месяцев)

- [ ] PDF ↔ Office, формы AcroForm
- [ ] Визуальная подпись → трек PAdES/PKCS#7
- [ ] Экспорт буклетов: JPG, DPI-чеклист, PDF/A (опц.)
- [ ] Публичный API, вебхуки

---

## Фаза 4 — PWA и Android (2–5 месяцев)

- [ ] PWA manifest, safe-area, touch
- [ ] Capacitor APK/AAB
- [ ] Фото с объекта → медиатека; офлайн-просмотр буклета

---

## Текущий фокус команды

1. Старт **фазы 2**: операции PDF (merge/split), diff версий, structured AI правки.
2. Не смешивать **2b** (буклеты) с юр. v1 до стабилизации фазы 2.

См. также [VISION.md](./VISION.md), [ICP.md](./ICP.md).

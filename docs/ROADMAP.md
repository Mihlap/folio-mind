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

- [x] pdf-lib / worker: merge, split, страницы
- [x] Текстовый diff по извлечённому слою + UI сравнения версий
- [x] Аннотации (комментарии, принятые правки)
- [x] Viewer: маркеры аннотаций на страницах PDF (overlay, без координат на листе)
- [x] Режим «было / стало»: ручные правки + ИИ; модальное окно с полным текстом; на PDF — кнопка «N правок — открыть»
- [x] ИИ: структурированные правки accept/reject + **«Собрать PDF»** (согласование: тело без изменений + компактный реестр в приложении)
- [ ] **«Применить правки»** — финальная версия PDF с изменённым текстом (DOCX-пайплайн, см. §2.4 PROJECT_PLAN)
- [x] RAG v1: загрузка регламентов, индексация, сверка с договором
- [x] RAG pgvector: эмбеддинги при индексации, семантический поиск (fallback на keyword)
- [x] PDF integrity v1: эвристика структуры файла (xref, метаданные) при upload, бейдж в списке версий, `GET .../integrity` (qpdf + fallback)

---

## Фаза 2b — Буклеты и коллаб (3–6 месяцев)

*Параллельно с фазой 2 после стабильного viewer.*

- [ ] Режим макета: crop, линейки, градиенты
- [ ] Проект, медиатека, шаблоны бюро
- [ ] Пресеты сжатия (worker optimize)
- [ ] Guest-view, watermark, комментарии, статусы согласования

---

## Фаза 3 — Конвертация, формы, подпись (4–8 месяцев)

### Финальная версия PDF (приоритет фазы 3)

Выбранный сценарий: **DOCX-центричный пайплайн**, не PDF→Markdown→PDF. Подходит для договоров, ТЗ, смет и отчётов с чертежами: рисунки не трогаем, меняем текст, формулы и расчёты.

| Этап | Задача |
|------|--------|
| D | **Source-first (приоритет):** `sourceDocxKey`, pipeline замен в DOCX → PDF; максимальное качество |
| B | Gotenberg / LibreOffice в compose; job PDF ↔ DOCX; pre-convert при upload; кэш DOCX; экспорт DOCX с подсветкой |
| C | Worker `apply-edits-final`: автозамены + confidence scoring + отчёт + новая версия PDF |
| E | Координаты выделения в аннотациях → точнее матчинг (бэклог фазы 2) |
| F | Гранулярность правок: text-only / structural / table / image (бэклог) |

**Два режима в UI:**

| Кнопка | Результат |
|--------|-----------|
| «Собрать PDF» | Согласование: реестр правок в приложении (✅ фаза 2) |
| «Применить правки» | Финал: текст в теле документа изменён |

- [ ] **D:** Prisma `sourceDocxKey`, UI поля при загрузке, source-first pipeline
- [ ] **B:** Gotenberg / LibreOffice в `docker-compose`
- [ ] **B:** PDF ↔ DOCX + pre-convert при upload + кэш промежуточного DOCX
- [ ] **C:** `apply-edits-final`: автозамены, отчёт `applied` / `failed` / `ambiguous`
- [ ] **C:** Confidence scoring: Green/Yellow/Red после round-trip; `confidenceScore` в `DocumentVersion`
- [ ] API + UI «Применить правки»; два подрежима (source-first / PDF-only)
- [ ] PDF ↔ Office (прочие форматы), формы AcroForm
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

1. Стабилизация **фазы 2** в использовании (smoke, RAG после reset, integrity на реальных PDF).
2. Доработки фазы 2: координаты маркеров на листе, integrity v2, эмбеддинги API.
3. **Фаза 3 / «Применить правки»**: реализация DOCX-пайплайн в порядке D → B → C (§2.4 PROJECT_PLAN): source-first (приоритет), инфраструктура конвертации, автозамены + confidence scoring.
4. **2b** (буклеты) — только после стабильного viewer и ACL, не смешивать с юр. v1.

См. также [VISION.md](./VISION.md), [ICP.md](./ICP.md).

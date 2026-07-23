# Настройка ИИ (GigaChat / YandexGPT)

По умолчанию используется **GigaChat** (`AI_PROVIDER=gigachat`)

## Переменные (`apps/server/.env`)

```env
AI_PROVIDER=gigachat

# Режим чата по документу: auto (по умолчанию) | rag | full
# auto — top-k фрагменты, если документ проиндексирован; иначе весь текст (как раньше)
# rag  — всегда пытаться RAG, при пустом индексе fallback на полный текст
# full — всегда полный текст (прежнее поведение)
AI_CHAT_MODE=auto

GIGACHAT_CREDENTIALS=<authorization key из личного кабинета Sber>
GIGACHAT_SCOPE=GIGACHAT_API_PERS
GIGACHAT_MODEL=GigaChat
GIGACHAT_TIMEOUT=180

# Опционально YandexGPT:
# AI_PROVIDER=yandex
# YANDEX_FOLDER_ID=
# YANDEX_IAM_TOKEN=
```

Ключи **только на сервере** — не в `apps/client`.

## Embeddings и RAG

- Индексация регламентов и документов использует embeddings провайдера (`GigaChat` / `Yandex`), при ошибке или неверной размерности — **локальный fallback** (FNV, dim=384).
- Поиск по регламентам: keyword + vector (гибрид). Keyword остаётся рабочим, если векторы ещё старые.
- После обновления embeddings нажмите **«Переиндексировать»** у файла на странице «Регламенты».
- Чат по документу (`AI_CHAT_MODE=auto`) берёт релевантные фрагменты; если индекса нет — ведёт себя как раньше (полный текст).
- Индекс/RAG читает до **500 стр.** PDF (`EXTRACT_AI_MAX_PAGES`, `EXTRACT_AI_MAX_CHARS`); лёгкий кэш `text.json` для UI по-прежнему ~50 стр. / 12k.
- Поиск чанков документа — **hybrid** (keyword + vector), как у регламентов.
- **Сканы:** если после extract мало текста, worker ставит job `vision-ocr` (GigaChat `completeWithPdf`, первые до 20 стр.) → перезаписывает `text.json` → переиндексирует чанки. Без GigaChat статус `skipped`.
- **Данные документа:** `GET /ai/extraction-templates`, `POST .../ai/extract` с `templateId` (`contract` | `contract_sections` | `act` | `tz`) или кастомной `schema`.

## Переключение провайдера

| Способ                | Описание                                                          |
| --------------------- | ----------------------------------------------------------------- |
| `.env`                | `AI_PROVIDER=gigachat` или `yandex` — для всего API               |
| `AI_CHAT_MODE`        | `auto` / `rag` / `full` — стратегия контекста чата                |
| `GET /ai/providers`   | Список провайдеров и что настроено                                |
| `POST /ai/complete`   | Тело `{ "provider": "yandex", "prompt": "..." }` — разовый запрос |
| `POST .../ai/summary` | Тело `{ "provider": "gigachat" }` — очередь ИИ по документу       |

Без ключей GigaChat/Yandex отвечают **stub-текстом** (для dev).

## Где искать старые ключи

Локальные копии проектов на этом ПК не найдены. Проверьте:

Скопируйте `GIGACHAT_CREDENTIALS` в `apps/server/.env` folio-mind.

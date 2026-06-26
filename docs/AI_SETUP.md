# Настройка ИИ (GigaChat / YandexGPT)

По умолчанию используется **GigaChat** (`AI_PROVIDER=gigachat`)

## Переменные (`apps/server/.env`)

```env
AI_PROVIDER=gigachat

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

## Переключение провайдера

| Способ                | Описание                                                          |
| --------------------- | ----------------------------------------------------------------- |
| `.env`                | `AI_PROVIDER=gigachat` или `yandex` — для всего API               |
| `GET /ai/providers`   | Список провайдеров и что настроено                                |
| `POST /ai/complete`   | Тело `{ "provider": "yandex", "prompt": "..." }` — разовый запрос |
| `POST .../ai/summary` | Тело `{ "provider": "gigachat" }` — очередь ИИ по документу       |

Без ключей GigaChat/Yandex отвечают **stub-текстом** (для dev).

## Где искать старые ключи

Локальные копии проектов на этом ПК не найдены. Проверьте:

- `apps/server/.env` в **folio-mind** (если уже настраивали)
- `apps/backend/.env` в клоне **Synastry**
- корневой `.env` в **Pagecraft** / Landing-generator

Скопируйте `GIGACHAT_CREDENTIALS` в `apps/server/.env` folio-mind.

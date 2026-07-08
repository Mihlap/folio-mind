# Публичный API (v1)

Базовый URL: `/api/v1`

## Аутентификация

Заголовок `Authorization: Bearer fm_...` или `X-Api-Key: fm_...`.

Ключ создаётся из UI (позже) или запросом:

```http
POST /api/v1/api-keys
Authorization: Bearer <JWT>
Content-Type: application/json

{ "name": "CI", "scopes": ["documents:read"] }
```

Ответ содержит `apiKey` **один раз** — сохраните его.

## Документы

```http
GET /api/v1/documents
GET /api/v1/documents/:documentId
```

## Вебхуки

```http
POST /api/v1/webhooks
Authorization: Bearer <JWT>

{
  "url": "https://example.com/hooks/folio",
  "secret": "your-hmac-secret",
  "events": ["job.completed"]
}
```

Подпись: заголовок `X-Folio-Signature` = HMAC-SHA256 тела запроса с `secret`.

События MVP: `job.completed` (export-form-data и др.).

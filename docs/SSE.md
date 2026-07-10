# SSE — live-обновления документа

Server-Sent Events (SSE) для мгновенной доставки изменений без polling.

## Архитектура

```
Изменение (комментарий / метка страницы / статус согласования)
  → Postgres
  → redis.publish(folio:doc-events:...)
  → все API-инстансы с подписчиками
  → SSE stream
  → клиент invalidate RTK Query → refetch
```

### Каналы Redis

| Канал | События |
|-------|---------|
| `folio:doc-events:{documentId}:{versionId}` | `guest_comment`, `page_review` |
| `folio:doc-events:{documentId}:_meta` | `review_status` |

## Endpoints

### Владелец (JWT)

```
GET /documents/:documentId/versions/:versionId/events
Authorization: Bearer <jwt>
Accept: text/event-stream
```

Подписка на version-канал + meta-канал (`review_status`).

### Гость (share token)

```
GET /public/share/:token/events
X-Folio-Share-Password: <optional>
Accept: text/event-stream
```

Подписка на version-канал (комментарии и метки страниц). Авторизация по токену ссылки, JWT не нужен.

### События

| event | data | Когда |
|-------|------|-------|
| `connected` | `{ documentId, versionId }` | после открытия стрима |
| `guest_comment` | `{ action, commentId, versionId }` | create / update / delete / clear |
| `page_review` | `{ action, page, versionId }` | метка страницы изменена / снята |
| `review_status` | `{ reviewStatus, documentId }` | статус согласования документа (только владелец) |
| `: ping` | — | heartbeat каждые 30 с |

## Клиент

| Экран | Хук |
|-------|-----|
| `DocumentPage` | `useDocumentVersionEvents` — при активной share-ссылке |
| `GuestSharePage` | `useGuestShareEvents` — при открытой гостевой ссылке |

- `@microsoft/fetch-event-source` — кастомные заголовки (Bearer / пароль ссылки).
- Reconnect + refetch при возврате на вкладку.
- Polling комментариев и меток **отключён**; polling превью остаётся только пока генерируются страницы.

## Инфраструктура

- **Redis обязателен** (`REDIS_URL`).
- nginx / ALB: `proxy_buffering off`, `proxy_read_timeout` ≥ 3600s.

См. [ROADMAP.md](./ROADMAP.md), [DEPLOY.md](./DEPLOY.md).

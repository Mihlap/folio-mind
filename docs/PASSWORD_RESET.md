# Восстановление пароля

## Поток

1. Пользователь открывает `/forgot-password` и вводит email.
2. Клиент вызывает `POST /auth/forgot-password`. API **всегда** отвечает `{ ok: true }` (не раскрываем, существует ли email).
3. Если email существует, сервер создаёт запись `PasswordResetToken` (hash + TTL) и печатает ссылку в лог (dev).
4. Пользователь открывает ссылку вида `/reset-password?token=...` и задаёт новый пароль.
5. Клиент вызывает `POST /auth/reset-password`. Сервер меняет пароль и помечает токен использованным.

## Dev-режим

Письма не отправляем — ссылка печатается в лог API как `password reset link`.

## Переменные окружения (apps/server/.env)

- `FRONTEND_URL`: базовый URL фронтенда для ссылки (dev: `http://localhost:5173`)
- `PASSWORD_RESET_TOKEN_TTL_MINUTES`: TTL токена (по умолчанию 30)

## SMTP (реальная отправка)

- `SMTP_HOST` — **хост сервера**, не email. Для Mail.ru: `smtp.mail.ru`
- `SMTP_PORT` / `SMTP_SECURE`: `465` + `true` или `587` + `false`
- `SMTP_USER` / `SMTP_FROM`: ящик отправителя, например `folio_mind@mail.ru`
- `SMTP_PASSWORD`: пароль ящика (в настройках Mail.ru включите доступ по SMTP)

Если SMTP не задан, ссылка печатается в лог API (`SMTP is not configured…`).

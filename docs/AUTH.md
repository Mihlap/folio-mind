# Аутентификация — Folio Mind

## Способы входа/регистрации (соответствие 406-ФЗ)

| Способ | Статус | Требует настройки | Разрешён 406-ФЗ |
|--------|--------|-------------------|-----------------|
| Email + пароль | ✅ Работает | — | ❌ (не входит в список) |
| **Телефон (SMS-код)** | ✅ Реализован | SMS-шлюз в проде | ✅ п. 1 ст. 8 |
| **Яндекс OAuth** | ✅ Реализован | `YANDEX_OAUTH_*` ключи | ✅ п. 4 ст. 8 (российская ИС) |
| **ЕСИА (Госуслуги)** | ✅ Реализован | КЭП + GOST-криптография | ✅ п. 2 ст. 8 |
<!-- Google OAuth — не соответствует 406-ФЗ (иностранная ИС), отключено
| Google OAuth | ✅ Реализован | `GOOGLE_OAUTH_*` ключи | ❌ |
-->
| Magic link | ✅ Работает | SMTP | — |

---

## 1. Вход по телефону (SMS)

### Принцип работы

1. Пользователь вводит номер → `POST /auth/phone/send-code`
2. Сервер генерирует 6-значный код, сохраняет в `SmsCode`, отправляет SMS
3. Пользователь вводит код → `POST /auth/phone/register` или `POST /auth/phone/login`
4. При успехе возвращается JWT (тот же, что при email-логине)

### Настройка

```env
# apps/server/.env

# Режим SMS-провайдера:
#   console — код выводится в консоль сервера (для разработки)
#   dummy   — ничего не отправляет
SMS_PROVIDER=console

# Время жизни кода (минуты)
SMS_CODE_TTL_MINUTES=5
```

**Для продакшена** нужно заменить провайдер в `apps/server/src/lib/auth/sms.ts`:
- Подключить реальный SMS-шлюз (SMS Aero, SMS.RU, VK Экосистема и т.д.)
- Реализовать класс `SmsProvider` с методом `send(phone, message)`

### API

| Метод | Endpoint | Тело |
|-------|----------|------|
| POST | `/auth/phone/send-code` | `{ phone }` |
| POST | `/auth/phone/register` | `{ phone, code, name? }` → `{ token, user }` |
| POST | `/auth/phone/login` | `{ phone, code }` → `{ token, user }` |

### Клиент

Страница `/phone-auth` (единая для регистрации и входа, переключение по кнопке).

---

## 2. Яндекс OAuth

### Принцип работы

Стандартный OAuth 2.0: redirect → callback → code exchange → profile → user.

### Настройка

1. Создайте приложение в https://oauth.yandex.ru/
2. Укажите Redirect URI: `https://api.example.com/auth/oauth/yandex/callback`
3. Получите `ClientID` и `Client secret`
4. Добавьте в `.env`:

```env
YANDEX_OAUTH_CLIENT_ID=ваш-client-id
YANDEX_OAUTH_CLIENT_SECRET=ваш-client-secret
```

### API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/auth/oauth/yandex/start` | Redirect на Яндекс |
| GET | `/auth/oauth/yandex/callback` | Callback → JWT |

### Клиент

Кнопка «Яндекс» на всех страницах входа/регистрации и на странице `/phone-auth`.

---

## 3. ЕСИА (Госуслуги)

### Принцип работы

OAuth 2.0 с PKCS#7 detached signature (GOST R 34.10-2012):
1. Redirect на ЕСИА → пользователь входит через Госуслуги
2. Callback → сервер обменивает код на токен (с подписью запроса)
3. Сервер получает профиль (ФИО, email, телефон) и создаёт/находит пользователя

### Настройка

**Требуется для продакшена:**
- КЭП (квалифицированная электронная подпись) юридического лица или ИП
- Библиотека GOST-криптографии для Node.js (например, `node-gost-crypto`)
- Регистрация информационной системы в техпортале ЕСИА
- Получение `client_id` и `client_secret`

**Переменные окружения:**

```env
ESIA_CLIENT_ID=ваш-client-id
ESIA_CLIENT_SECRET=ваш-client-secret
# Должен совпадать с указанным при регистрации ИС:
ESIA_REDIRECT_URI=https://api.example.com/auth/oauth/esia/callback
```

### GOST-подпись

В `apps/server/src/lib/auth/esia.ts` функция `signEsiaRequest()` — заглушка:

```ts
function signEsiaRequest(env: Env, method: string, url: string, body: string): string {
  throw new Error(
    'ESIA requires PKCS#7 GOST R 34.10-2012 signature. ' +
    'Install a qualified certificate and GOST crypto library.'
  );
}
```

Для продакшена замените на вызов реальной ГОСТ-библиотеки.

### API

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/auth/oauth/esia/start` | Redirect на Госуслуги |
| GET | `/auth/oauth/esia/callback` | Callback → JWT |

### Клиент

Кнопка «Госуслуги» на всех страницах входа/регистрации.

---

## Общая схема авторизации

Все способы возвращают одинаковый JWT (payload: `sub`, `email`, `tenantId`).

```typescript
type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  tenantId: string;
  emailVerified: boolean;
};
```

После получения JWT клиент сохраняет его в Redux (`authSlice`) и `localStorage` как `folio_token`, все API-запросы автоматически добавляют `Authorization: Bearer <token>`.

---

## Эндпоинты (полный список)

| Метод | Route | Auth | Описание |
|-------|-------|------|----------|
| POST | `/auth/register` | — | Email + пароль |
| POST | `/auth/login` | — | Email + пароль |
| POST | `/auth/phone/send-code` | — | Отправить SMS |
| POST | `/auth/phone/register` | — | Регистрация по телефону |
| POST | `/auth/phone/login` | — | Вход по телефону |
| GET | `/auth/oauth/:provider/start` | — | OAuth redirect (google, yandex, esia) |
| GET | `/auth/oauth/:provider/callback` | — | OAuth callback |
| POST | `/auth/verify-email` | — | Подтвердить email |
| GET | `/auth/verify-email` | — | HTML-страница подтверждения |
| POST | `/auth/resend-verification` | — | Повторная отправка письма |
| POST | `/auth/email-verification-status` | — | Статус верификации |
| POST | `/auth/forgot-password` | — | Сброс пароля |
| POST | `/auth/reset-password` | — | Новый пароль |
| POST | `/auth/magic-link` | — | Ссылка для входа |
| POST | `/auth/magic-link/verify` | — | Проверить magic link |
| GET | `/me` | ✅ JWT | Профиль пользователя |

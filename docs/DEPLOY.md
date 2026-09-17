# Deploy — Folio Mind

---

## Содержание

- [Локальная разработка](#локальная-разработка)
- [Продакшен (ориентир)](#продакшен-ориентир)
- [Текущий статус готовности](#текущий-статус-готовности)
- [Пошаговый план деплоя](#пошаговый-план-деплоя)
  - [Шаг 1: Подготовка сервера](#шаг-1-подготовка-сервера)
  - [Шаг 2: Покупка домена и DNS](#шаг-2-покупка-домена-и-dns)
  - [Шаг 3: Клонирование проекта на сервер](#шаг-3-клонирование-проекта-на-сервер)
  - [Шаг 4: Настройка переменных окружения](#шаг-4-настройка-переменных-окружения)
  - [Шаг 5: Сборка Docker-образов](#шаг-5-сборка-docker-образов)
  - [Шаг 6: Первый запуск (без SSL)](#шаг-6-первый-запуск-без-ssl)
  - [Шаг 7: Настройка SSL/TLS](#шаг-7-настройка-ssltls)
  - [Шаг 8: Финальный запуск с SSL](#шаг-8-финальный-запуск-с-ssl)
  - [Шаг 9: Инициализация базы данных](#шаг-9-инициализация-бд)
  - [Шаг 10: Проверка работоспособности](#шаг-10-проверка)
  - [Шаг 11: Мониторинг и бэкапы](#шаг-11-мониторинг-и-бэкапы)
  - [Шаг 12: CI/CD (опционально)](#шаг-12-cicd)
- [Dockerfile и конфиги](#dockerfile-и-конфиги)
- [PWA и Android](#pwa-и-android)
- [Чеклист](#чеклист)
- [Полезные команды](#полезные-команды)

---

## Локальная разработка

### Требования

- Node.js **≥ 20** (Active LTS)
- pnpm **9.x** (`packageManager` в корневом `package.json`)
- Docker Desktop (WSL2 на Windows)
- Git

### Порты (docker compose)

| Сервис        | Порт на хосте | Назначение                                   |
| ------------- | ------------- | -------------------------------------------- |
| PostgreSQL    | **5434**      | БД `folio_mind` (user/pass: `folio`/`folio`) |
| Redis         | **6379**      | BullMQ, кэш                                  |
| MinIO API     | **9000**      | S3-совместимое API                           |
| MinIO Console | **9001**      | Веб-консоль MinIO                            |

### Приложение (pnpm dev)

| Сервис        | URL                          |
| ------------- | ---------------------------- |
| Web (Vite)    | http://localhost:5173        |
| API (Fastify) | http://localhost:3001        |
| Swagger       | http://localhost:3001/docs   |
| Health        | http://localhost:3001/health |

### Переменные окружения

Скопировать примеры:

```bash
cp apps/server/.env.example apps/server/.env
cp apps/client/.env.example apps/client/.env
cp apps/worker/.env.example apps/worker/.env
```

**Server (`apps/server/.env`):**

| Переменная     | Пример (dev)                                                                                                    |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | `postgresql://folio:folio@127.0.0.1:5434/folio_mind` (на Windows предпочтительнее `127.0.0.1`, чем `localhost`) |
| `REDIS_URL`    | `redis://127.0.0.1:6379`                                                                                        |
| `JWT_SECRET`   | мин. 32 символа                                                                                                 |
| `CORS_ORIGIN`  | `http://localhost:5173`                                                                                         |
| `S3_ENDPOINT`  | MinIO: `http://localhost:9000` или облако (Timeweb и т.д.)                                                      |
| `S3_*`         | ключи, bucket, region                                                                                           |
| `AI_PROVIDER`  | `gigachat` \| `yandex`                                                                                          |

**Клиент:** `VITE_API_URL=http://localhost:3001` (см. `apps/client/.env.example`).

### S3: префиксы в приложении

Логический корень: `folioFiles/` (см. `apps/server/src/lib/s3-paths.ts`):

| Префикс                   | Содержимое                   |
| ------------------------- | ---------------------------- |
| `folioFiles/originals/`   | Исходные PDF по версиям      |
| `folioFiles/previews/`    | Миниатюры страниц            |
| `folioFiles/processing/`  | Временные файлы worker (TTL) |
| `folioFiles/exports/`     | Отчёты, выгрузки             |
| `folioFiles/rag-sources/` | Шаблоны/регламенты для RAG   |
| `folioFiles/media/`       | Медиатека проектов (буклеты) |

**Dev:** бакет `folio-mind` создаётся сервисом `minio-init` в `docker-compose.yml`.  
**Prod:** облачный S3 (AWS, Yandex Object Storage, Timeweb Cloud и др.) — один SDK `@aws-sdk/client-s3`.

Инициализация MinIO вручную (Windows):

```powershell
powershell -File .\tools\init-minio.ps1
```

### База данных

```bash
pnpm db:push      # быстро для dev
pnpm db:migrate   # формальные миграции
```

### Запуск

```bash
docker compose up -d
pnpm install
pnpm db:push
pnpm dev
```

На Windows PowerShell при блокировке скриптов: `pnpm.cmd` или `set-executionpolicy -scope process -executionpolicy bypass`.

---

## Продакшен (ориентир)

| Компонент | Рекомендация                                                |
| --------- | ----------------------------------------------------------- |
| API       | 2+ stateless реплики за балансировщиком                     |
| Worker    | Горизонтально, отдельные очереди BullMQ                     |
| Postgres  | Managed + **PgBouncer** (transaction mode)                  |
| Redis     | Отдельные DB/инстансы для очередей и кэша при росте         |
| S3        | SSE, lifecycle на `processing/`, CDN перед `previews/`      |
| ИИ        | `AI_PROVIDER` в env; VPC/on-prem endpoint по договорённости |

### OpenTelemetry

```env
OTEL_ENABLED=true
# OTEL_EXPORTER_OTLP_ENDPOINT=http://...
```

Метрики: p95 API, длина очередей, длительность джоб, токены ИИ.

### SLA по слоям (кратко)

- **API:** auth, ACL, метаданные, presigned URL — без Ghostscript/LLM в HTTP.
- **Worker:** превью, конвертация, сжатие, тяжёлый ИИ.
- **Клиент:** viewer на превью + виртуализация; не сжимать 50+ МБ в браузере.

### SSE (live guest-comments)

- Endpoint: `GET /documents/:id/versions/:vid/events` (см. [SSE.md](./SSE.md)).
- **Redis обязателен** (`REDIS_URL`) — pub/sub между инстансами API.
- За reverse proxy: `proxy_buffering off`, `proxy_read_timeout` ≥ 3600s для SSE-роута.

---

## Текущий статус готовности

| Компонент | Статус | Примечание |
|-----------|--------|------------|
| Docker Compose (инфраструктура) | ✅ Готов | `docker-compose.yml` — Postgres, Redis, MinIO, Gotenberg, pdf2docx |
| Docker Compose (продакшен) | ✅ Готов | `docker-compose.prod.yml` — все сервисы |
| Dockerfile (pdf2docx) | ✅ Готов | `docker/pdf2docx/Dockerfile` |
| Dockerfile (server) | ✅ Готов | `apps/server/Dockerfile` |
| Dockerfile (client) | ✅ Готов | `apps/client/Dockerfile` |
| Dockerfile (worker) | ✅ Готов | `apps/worker/Dockerfile` |
| .dockerignore | ✅ Готов | Корень проекта |
| nginx (reverse proxy) | ✅ Готов | `apps/client/nginx.conf` |
| SSL/TLS | ⚙️ Нужно настроить | Certbot или Caddy на сервере |
| DNS | ⚙️ Нужно настроить | A-записи на IP сервера |
| Переменные окружения | ⚙️ Нужно заполнить | `.env.prod` файлы с секретами |
| CI/CD | ⚙️ Не настроен | GitHub Actions workflows отсутствуют |

---

## Пошаговый план деплоя

> **Порядок важен!** Каждый шаг опирается на предыдущий. Не пропускай.

### Шаг 1: Подготовка сервера

#### 1.1 Выбор сервера

| Параметр | Минимальный | Рекомендованный |
|----------|-------------|-----------------|
| CPU | 2 vCPU | 4+ vCPU |
| RAM | 4 GB | 8+ GB |
| Диск | 40 GB SSD | 80+ GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |

Рекомендуемые провайдеры: Timeweb Cloud, Yandex Cloud, Selectel, AWS, DigitalOcean.

#### 1.2 Установка ПО

Подключись к серверу по SSH и выполни:

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Установка Docker Compose
sudo apt install docker-compose-plugin -y

# Установка certbot (потом пригодится для SSL)
sudo apt install certbot -y

# Проверка версий
docker --version
docker compose version
```

#### 1.3 Настройка防火ика

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

### Шаг 2: Покупка домена и DNS

#### 2.1 Купи домен

Любой регистратор: reg.ru, namecheap, cloudflare и т.д.

#### 2.2 Создай A-записи в DNS

В панели DNS-провайдера домена создай:

```
Type  | Name  | Value         | TTL
A     | @     | <IP-сервера>  | 600
A     | api   | <IP-сервера>  | 600
```

#### 2.3 Проверь прописку

```bash
# На своём компьютере (не на сервере!)
nslookup your-domain.com
nslookup api.your-domain.com

# Или через curl
curl -s https://dns.google/resolve?name=your-domain.com&type=A
```

**Жди пока DNS пропишется** — от 5 минут до 48 часов (обычно ~1 час). Пока не прописался — не продолжай (SSL не получится).

---

### Шаг 3: Клонирование проекта на сервер

```bash
# Подключись к серверу по SSH
ssh user@<IP-сервера>

# Клонируй проект
cd /opt
git clone https://github.com/your-org/folio-mind.git
cd folio-mind
```

---

### Шаг 4: Настройка переменных окружения

#### 4.1 Сгенерируй секреты

```bash
# JWT_SECRET (минимум 32 символа)
openssl rand -hex 32

# Пароль Postgres
openssl rand -hex 16

# Пароль Redis
openssl rand -hex 16
```

#### 4.2 Создай `.env.prod` в корне проекта

```bash
nano .env.prod
```

Вставь и замени значения:

```bash
POSTGRES_USER=folio
POSTGRES_PASSWORD=<вставь-пароль-из-команды-выше>
POSTGRES_DB=folio_mind
REDIS_PASSWORD=<вставь-пароль-из-команды-выше>
```

Сохрани: `Ctrl+O`, `Enter`, `Ctrl+X`.

#### 4.3 Создай `apps/server/.env.prod`

```bash
nano apps/server/.env.prod
```

Вставь:

```bash
# === API ===
NODE_ENV=production
PORT=3001
API_HOST=0.0.0.0
JWT_SECRET=<вставь-jwt-secret-из-команды-выше>
CORS_ORIGIN=https://your-domain.com
FRONTEND_URL=https://your-domain.com
API_PUBLIC_URL=https://api.your-domain.com

# === Database ===
DATABASE_URL=postgresql://folio:<пароль-postgres>@postgres:5432/folio_mind

# === Redis ===
REDIS_URL=redis://:<пароль-redis>@redis:6379

# === S3 ===
S3_ENDPOINT=https://s3.timeweb.cloud
S3_REGION=ru-1
S3_ACCESS_KEY=<твой-ключ>
S3_SECRET_ACCESS_KEY=<твой-секрет>
S3_BUCKET_NAME=folio-mind
S3_PUBLIC_URL=https://s3.timeweb.cloud/folio-mind
S3_FORCE_PATH_STYLE=true

# === AI ===
AI_PROVIDER=gigachat
GIGACHAT_SCOPE=GIGACHAT_API_PERS
GIGACHAT_CREDENTIALS=<твой-токен>
GIGACHAT_MODEL=GigaChat
GIGACHAT_TIMEOUT=180

# === Gotenberg / pdf2docx ===
GOTENBERG_URL=http://gotenberg:3000
PDF_TO_DOCX_URL=http://pdf2docx:8080

# === Очереди ===
QUEUE_WARN_WAITING=50
AI_JOB_TIMEOUT_MS=180000
AI_TENANT_DAILY_REQUESTS=100
```

> **Важно:** замени `your-domain.com` на реальный домен, а угловые скобки `<...>` — на реальные значения.

---

### Шаг 5: Сборка Docker-образов

```bash
cd /opt/folio-mind

# Сборка (займет 5-15 минут第一次)
docker compose -f docker-compose.prod.yml build
```

---

### Шаг 6: Первый запуск (без SSL)

Запусти только nginx и server, чтобы проверить что всё работает:

```bash
# Запусти всё
docker compose -f docker-compose.prod.yml up -d

# Проверь статус
docker compose -f docker-compose.prod.yml ps

# Посмотри логи (должно быть без ошибок)
docker compose -f docker-compose.prod.yml logs server | tail -20
```

#### Проверь доступность

```bash
# На сервере
curl http://localhost:3001/health

# Со своего компьютера (пока без SSL)
curl http://your-domain.com
```

> Если DNS уже прописался — откроется nginx с клиентом. Если нет — проверяй через IP.

---

### Шаг 7: Настройка SSL/TLS

**Только после того как DNS прописался!**

#### 7.1 Останови nginx (освободить порт 80)

```bash
docker compose -f docker-compose.prod.yml stop nginx
```

#### 7.2 Получи сертификат

```bash
sudo certbot certonly --standalone \
  -d your-domain.com \
  -d api.your-domain.com \
  --agree-tos \
  --email your-email@example.com \
  --non-interactive
```

#### 7.3 Создай папку для сертификатов

```bash
mkdir -p /opt/folio-mind/nginx/ssl
```

#### 7.4 Скопируй сертификаты

```bash
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /opt/folio-mind/nginx/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem /opt/folio-mind/nginx/ssl/
sudo chmod 644 /opt/folio-mind/nginx/ssl/*.pem
```

#### 7.5 Настрой автобновление

```bash
# Создай скрипт обновления
sudo nano /opt/folio-mind/tools/renew-ssl.sh
```

Вставь:

```bash
#!/bin/bash
DOMAIN="your-domain.com"
COMPOSE_DIR="/opt/folio-mind"

certbot renew --quiet --deploy-hook " \
  cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $COMPOSE_DIR/nginx/ssl/ && \
  cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $COMPOSE_DIR/nginx/ssl/ && \
  chmod 644 $COMPOSE_DIR/nginx/ssl/*.pem && \
  cd $COMPOSE_DIR && docker compose -f docker-compose.prod.yml restart nginx \
"
```

```bash
sudo chmod +x /opt/folio-mind/tools/renew-ssl.sh

# Добавь в crontab (обновление 2 раза в день)
sudo crontab -e
# Добавь строку:
0 0,12 * * * /opt/folio-mind/tools/renew-ssl.sh
```

---

### Шаг 8: Финальный запуск с SSL

```bash
# Запусти nginx обратно
docker compose -f docker-compose.prod.yml start nginx

# Проверь что всё работает
docker compose -f docker-compose.prod.yml ps
```

#### Проверь HTTPS

```bash
# Со своего компьютера
curl -I https://your-domain.com
curl https://api.your-domain.com/health
```

Открой в браузере: `https://your-domain.com`

---

### Шаг 9: Инициализация БД

```bash
# Примени миграции
docker compose -f docker-compose.prod.yml exec server pnpm prisma migrate deploy
```

---

### Шаг 10: Проверка

```bash
# Health check
curl https://api.your-domain.com/health

# Swagger
curl https://api.your-domain.com/docs

# Логи (должно быть без ошибок)
docker compose -f docker-compose.prod.yml logs server | tail -50
docker compose -f docker-compose.prod.yml logs worker | tail -50
```

Открой в браузере:
- `https://your-domain.com` — клиент
- `https://api.your-domain.com/docs` — Swagger

Зарегистрируй тестового пользователя.

---

### Шаг 11: Мониторинг и бэкапы

#### 11.1 OpenTelemetry (опционально)

В `apps/server/.env.prod` добавь:

```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
```

#### 11.2 Бэкап Postgres

```bash
# Создай скрипт бэкапа
sudo nano /opt/folio-mind/tools/backup.sh
```

Вставь:

```bash
#!/bin/bash
DATE=$(date +%Y-%m-%d)
BACKUP_DIR="/opt/folio-mind/backups"
mkdir -p $BACKUP_DIR

docker compose -f /opt/folio-mind/docker-compose.prod.yml exec -T postgres \
  pg_dump -U folio folio_mind | gzip > $BACKUP_DIR/postgres-$DATE.sql.gz

# Удаление бэкапов старше 30 дней
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
```

```bash
sudo chmod +x /opt/folio-mind/tools/backup.sh

# Ежедневный бэкап в 3:00
sudo crontab -e
# Добавь строку:
0 3 * * * /opt/folio-mind/tools/backup.sh
```

#### 11.3 Мониторинг ресурсов

```bash
# Установи htop
sudo apt install htop -y

# Проверка Docker-контейнеров
docker stats
```

---

### Шаг 12: CI/CD (опционально)

Создай `.github/workflows/deploy.yml` в репозитории:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Deploy via SSH
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /opt/folio-mind
            git pull origin main
            docker compose -f docker-compose.prod.yml build
            docker compose -f docker-compose.prod.yml up -d
            docker compose -f docker-compose.prod.yml exec -T server pnpm prisma migrate deploy
```

Добавь secrets в GitHub: Settings → Secrets → Actions.

---

## Dockerfile и конфиги

Все файлы уже созданы в проекте:

| Файл | Назначение |
|------|------------|
| `apps/server/Dockerfile` | Сборка API (Fastify + Prisma) |
| `apps/client/Dockerfile` | Сборка клиента (Vite → nginx) |
| `apps/worker/Dockerfile` | Сборка воркера (BullMQ + Ghostscript + qpdf) |
| `.dockerignore` | Исключения для Docker build |
| `apps/client/nginx.conf` | SPA fallback + gzip + кэш |
| `docker-compose.prod.yml` | Полный стек для продакшена |

---

## PWA и Android

### PWA

Клиент (`apps/client`) собирается с `vite-plugin-pwa`: manifest «РазУм», иконки в `public/icons/`, service worker кэширует **статику**. Нужен **HTTPS** в проде.

Установка: Chrome/Edge «Установить» / iOS Safari «На экран „Домой"».

### Capacitor APK

См. [`apps/mobile/README.md`](../apps/mobile/README.md).

Проверенный CLI (Windows + Android Studio):

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:VITE_API_URL = "http://10.0.2.2:3001"   # эмулятор → API на хосте
pnpm mobile:sync
pnpm mobile:apk:debug
# APK: apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

- `CORS_ORIGIN` — список через запятую, для WebView: `…,https://localhost`
- `VITE_API_URL` задавайте **на время build** клиента (не `localhost` с точки зрения эмулятора/телефона)

### Smoke RAG

```bash
pnpm smoke:rag
```

Нужны API + worker + S3 + настроенный ИИ. Проверяет длинный PDF (≥100 стр.) → индекс → чат с `chatMode=rag` и sources.

---

## Чеклист

- [ ] Сервер подготовлен (Docker, UFW)
- [ ] Домен куплен
- [ ] DNS A-записи прописались
- [ ] Проект склонирован на сервер
- [ ] `.env.prod` заполнен секретами
- [ ] Docker-образы собраны
- [ ] SSL сертификат получен
- [ ] Автобновление SSL настроено
- [ ] Бэкапы настроены
- [ ] Health check проходит
- [ ] Регистрация/вход работает

---

## Полезные команды

```bash
# Логи
docker compose -f docker-compose.prod.yml logs -f [service]

# Перезапуск сервиса
docker compose -f docker-compose.prod.yml restart server

# Обновление
git pull && docker compose -f docker-compose.prod.yml build && docker compose -f docker-compose.prod.yml up -d

# Остановка всего
docker compose -f docker-compose.prod.yml down

# Очистка
docker system prune -a
```

---

См. [PROJECT_PLAN.md](../PROJECT_PLAN.md) §3.4, §3.7, §4.6.

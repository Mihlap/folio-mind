# Как развернуть folio-mind на хостинге

Это инструкция, по которой я сам разворачивал проект на VPS — пишу её от первого лица, чтобы следующему было проще. Всё ниже работает и у меня на сервере: один раз настроил, дальше только `up -d --build`. Конкретные адреса не привязываю — вместо них ставьте свои (`<IP сервера>`, `<домен фронта>`, `<домен API>`).

## Что понадобится

- Сервер (VPS) с Docker и Docker Compose v2. Я ставил так:
  ```bash
  apt update && apt upgrade -y
  apt install -y docker.io docker-compose-v2
  ```
- Для dev-машины (собирать локально): Node.js ≥ 20, pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.4 --activate`).
- Желательно 20+ GB свободного места на диске: образы server/worker тяжёлые (я старался ужать — не вышло, см. в конце).

## Из чего состоит прод-стек

- Web (`apps/client`) — собранная статика, отдаёт nginx внутри контейнера.
- API (`apps/server`) — Fastify, порт 3001, Prisma.
- Worker (`apps/worker`) — фоновые очереди BullMQ.
- Инфраструктура поднимается сама из compose: **Postgres 16 + pgvector, Redis, MinIO, Gotenberg, pdf2docx**. Отдельно ничего ставить не надо.

## Шаг 1. Код и переменные окружения

```bash
git clone <ваш репозиторий> ~/app && cd ~/app
```

Два файла, которых нет в git (обязательно создать):

`~/app/.env.prod` — для compose (параметры Postgres/Redis):
```bash
cat > .env.prod <<'EOF'
POSTGRES_USER=folio
POSTGRES_PASSWORD=<пароль>
POSTGRES_DB=folio_mind
REDIS_PASSWORD=<пароль>
EOF
```

`~/app/apps/server/.env.prod` — всё для сервера и воркера. Готовый шаблон:
```bash
cat > apps/server/.env.prod <<'EOF'
DATABASE_URL=postgresql://folio:<пароль>@postgres:5432/folio_mind
REDIS_URL=redis://:<пароль>@redis:6379
JWT_SECRET=<случайная длинная строка>
CORS_ORIGIN=https://<домен фронта>
FRONTEND_URL=https://<домен фронта>
API_PUBLIC_URL=https://<домен API>
# Дальше по желанию: S3 (если не MinIO), GigaChat / YandexGPT, SMTP.
# Все переменные описаны в apps/server/.env.example
EOF
```

Обратите внимание: внутри compose-сети базы доступны по именам сервисов — `postgres` и `redis`, не `localhost`.

## Шаг 2. Правка docker-compose.prod.yml

Клиент при сборке получает адрес API как build-arg — он **вшивается в бандл**, и поменять его потом просто перезапуском нельзя:

```yaml
client:
  build:
    args:
      VITE_API_URL: https://<домен API>
```

## Шаг 3. Сборка и запуск

Все команды из `~/app`. Флаг `--env-file .env.prod` обязателен — без него compose берёт пустые `POSTGRES_*` и `REDIS_PASSWORD`, и ничего не поднимется.

```bash
cd ~/app
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

После первого запуска применить миграции Prisma:
```bash
docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy
```

Проверить, что всё живо:
```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost:3001/health        # {"status":"ok"...}
curl http://localhost:3001/docs          # Swagger
```

## Шаг 4. Открыть наружу

У меня облачный firewall пропускает только 22/80/443, а на хосте уже стоял Caddy, поэтому я завернул всё через него и не открывал лишних портов. У вас может быть свой вариант (nginx, трафик напрямую на 80/443) — смысл тот же.

**Caddy + sslip.io** (для домена без своей DNS — `что-угодно.<IP>.sslip.io` резолвится в ваш IP):

В Caddyfile добавьте (не забудьте бэкап, у меня файл в git-репо):
```
<домен фронта> { reverse_proxy your-client-container:80 }    # например pdf-client-1
<домен API>    { reverse_proxy your-server-container:3001 }  # например pdf-server-1
```

Контейнеры приложения должны быть в сети Caddy, иначе reverse_proxy не увидит их по имени:
```bash
docker network connect <сеть-caddy> <ваш-client-контейнер>
docker network connect <сеть-caddy> <ваш-server-контейнер>
docker exec <контейнер-caddy> caddy reload --config /etc/caddy/Caddyfile
```

⚠️ Важно: при любом пересоздании контейнеров (`docker compose up`) ручные `network connect` слетают — их надо выполнять заново.

## Смена кода / обновление / рестарт

```bash
cd ~/app && git pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec server npx prisma migrate deploy

# рестарт одного сервиса
docker compose -f docker-compose.prod.yml restart server

# остановить всё (контейнеры остаются)
docker compose --env-file .env.prod -f docker-compose.prod.yml stop

# остановить и удалить контейнеры (данные в volumes сохраняются)
docker compose --env-file .env.prod -f docker-compose.prod.yml down
```

## На что я потратил время (чтобы вы не наступали на те же грабли)

**Рантайм TS-пакетов.** Общие `packages/*` отдают исходники (`"exports": "./src/index.ts"`). Поэтому:
- server/worker запускаются через `tsx`: `node --no-warnings --import tsx dist/index.js`;
- в Dockerfile-ах в runner копируется **полное дерево node_modules со ссылками pnpm как есть** (и `/app/node_modules`, и `apps/*/node_modules`, и `/app/packages`) — дереференсить `cp -rL` нельзя, иначе у `tsx` пропадает `esbuild` из соседнего `.pnpm`;
- у builder обязательно должен быть **повторный** `pnpm install --frozen-lockfile` после `COPY . .` — только так pnpm создаёт `node_modules` внутри каждого `packages/*` (иначе кросс-импорты `@folio-mind/*` и их зависимости не находятся).

Всё это уже зашито в `apps/server/Dockerfile`, `apps/worker/Dockerfile` и `apps/client/Dockerfile` — просто не «упрощайте» их.

**Ужимание образов.** Пробовал сделать server/worker легче (они ~1.4–1.5 GB из-за полного node_modules + Ghostscript/QPDF): `node --experimental-strip-types` не дружит с `.js`-суффиксами в импортах TS-пакетов, а `pnpm prune --production` в монорепе не чистит dev-дерево. В итоге оставил рабочий вариант. Если хотите освободить диск — `docker builder prune -f`.

**Healthcheck сервера.** Проба должна быть на `127.0.0.1`, а не `localhost`:
```yaml
test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:3001/health']
```
В контейнере busybox-wget резолвит `localhost` в IPv6 `::1`, а Fastify слушает IPv4 — сервер живой, но вечно `unhealthy`.

**Env через веб-консоль.** Если вставляете переменные через панель хостинга, появляются лишние пробелы в начале строк:
```bash
sed -i 's/^[[:space:]]*//' .env.prod apps/server/.env.prod
```

---

Если что-то не поднимается — загляните в логи: `docker compose -f docker-compose.prod.yml logs -f server` (или `worker`). Там обычно сразу видно, чего не хватает (чаще всего — env или миграции).
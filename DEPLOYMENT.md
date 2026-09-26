# Как развернуть folio-mind на хостинге

Это инструкция, по которой я сам разворачивал проект на VPS — пишу её от первого лица, чтобы следующему было проще. Всё ниже работает и у меня на сервере: один раз настроил, дальше только `tools/deploy-prod.sh`. Конкретные адреса не привязываю — вместо них ставьте свои (`<IP сервера>`, `<домен фронта>`, `<домен API>`).

## Что понадобится

- Сервер (VPS) с Docker и Docker Compose v2. Я ставил так:
  ```bash
  apt update && apt upgrade -y
  apt install -y docker.io docker-compose-v2
  ```
- Для dev-машины (собирать локально): Node.js ≥ 20, pnpm 9 (`corepack enable && corepack prepare pnpm@9.15.4 --activate`).
- Желательно 20+ GB свободного места на диске: образы server/worker тяжёлые (я старался ужать — не вышло, см. в конце).

## Из чего состоит прод-стек

- Web (`apps/client`) — собранная статика, отдаётся nginx внутри контейнера.
- API (`apps/server`) — Fastify, порт 3001, Prisma.
- Worker (`apps/worker`) — фоновые очереди BullMQ.
- Инфраструктура поднимается сама из compose: **Postgres 16 + pgvector, Redis, Gotenberg, pdf2docx** (собирается локально из `docker/pdf2docx`). Отдельно ничего ставить не надо.
- **Файлы пользователей в проде лежат не в compose, а во внешнем S3** (MinIO — только для локальной разработки, см. `docker-compose.yml`). Переменные `S3_*` обязательны, иначе загрузка и превью не работают.
- Статику отдаёт nginx **внутри контейнера клиента** (`apps/client/Dockerfile` → `FROM nginx:alpine`). Отдельного сервиса `nginx` в compose нет: он занимал те же 80/443, что и внешний обратный прокси, и монтировал конфиги, которых в репозитории не было.

## Шаг 1. Код и переменные окружения

```bash
git clone <ваш репозиторий> ~/app && cd ~/app
```

Два файла, которых нет в git (обязательно создать):

`~/app/.env.prod` — для compose (параметры Postgres/Redis и сборки клиента):
```bash
cat > .env.prod <<'EOF'
POSTGRES_USER=folio
POSTGRES_PASSWORD=<пароль>
POSTGRES_DB=folio_mind
REDIS_PASSWORD=<пароль>
VITE_API_URL=https://<домен API>
CLIENT_PORT=8080
EOF
```

`VITE_API_URL` **обязателен**: адрес API вшивается в бандл клиента на этапе сборки. Если переменной нет, compose оборвёт деплой с понятной ошибкой — это лучше, чем тихо собрать фронт на `http://localhost:3001` (именно так ведёт себя код, когда переменная пустая). `CLIENT_PORT` — порт на хосте, на котором виден клиент; если его владеет обратный прокси, поставьте не 80 (см. шаг 4).

`~/app/apps/server/.env.prod` — всё для сервера и воркера. Готовый шаблон:
```bash
cat > apps/server/.env.prod <<'EOF'
DATABASE_URL=postgresql://folio:<пароль>@postgres:5432/folio_mind
REDIS_URL=redis://:<пароль>@redis:6379
JWT_SECRET=<случайная длинная строка>
CORS_ORIGIN=https://<домен фронта>
FRONTEND_URL=https://<домен фронта>
API_PUBLIC_URL=https://<домен API>
S3_ENDPOINT=<адрес S3>
S3_BUCKET=folio-mind
S3_ACCESS_KEY_ID=<ключ>
S3_SECRET_ACCESS_KEY=<ключ>
# Дальше по желанию: GigaChat / YandexGPT, SMTP.
# Все переменные описаны в apps/server/.env.example
EOF
```

`AI_PROVIDER` и ключи провайдера нужны для ИИ-функций, включая **распознавание текста в сканах** (см. `USER_GUIDE.md`, раздел 5). Без них всё остальное работает, а чат и OCR — нет.

Обратите внимание: внутри compose-сети базы доступны по именам сервисов — `postgres` и `redis`, не `localhost`.

## Шаг 2. Локальный override для своего хоста

`docker-compose.prod.yml` в репозитории **не содержит ничего, привязанного к конкретному серверу**: ни портов, ни адресов, ни имён сетей. Всё, что уникально для хоста, лежит в `.env.prod` и в untracked-файле `docker-compose.prod.local.yml`.

Это сделано намеренно. Раньше правки хоста вносились прямо в `docker-compose.prod.yml`, и это ломало деплой: файл менялся и в git, и на сервере, поэтому `git pull` отказывался выполняться («local changes would be overwritten»). Сейчас репозиторий можно обновлять на сервере без страха, а специфику хоста видно целиком в одном маленьком файле.

Создайте его из шаблона, только если у вас внешний обратный прокси (Caddy/traefik в другом проекте), которому нужен доступ к контейнерам по имени:

```bash
cd ~/app
cp docker-compose.prod.local.yml.example docker-compose.prod.local.yml
# подставьте имя своей сети в поле name
docker network create <имя-сети>   # если сети ещё нет
```

Файл уже в `.gitignore` — случайно закоммитить его нельзя. Если прокси у вас свой и на отдельном хосте, override не нужен вообще: деплой пойдёт в standalone-режиме.

## Шаг 3. Сборка и запуск

Раньше деплой был набором команд, и в них регулярно терялся `--env-file`. Теперь есть одна точка входа, которая делает всё сама и падает с внятной ошибкой, если чего-то не хватает:

```bash
cd ~/app
tools/deploy-prod.sh
```

Скрипт проверяет наличие обоих env-файлов и непустой `VITE_API_URL`, подставляет `--env-file .env.prod`, добавляет override, если он есть, выполняет `git pull --ff-only`, `up -d --build`, миграции и печатает статус. Код уже доставлен на сервер другим способом — с флагом `--no-pull`.

Если всё-таки хотите команды руками, флаг `--env-file .env.prod` обязателен — без него compose берёт пустые `POSTGRES_*` и `REDIS_PASSWORD` (разбор последствий — в разделе «Грабли» в конце). Второй `-f` добавляйте только если у вас есть `docker-compose.prod.local.yml`:

```bash
cd ~/app
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod up -d --build
```

После первого запуска применить миграции Prisma (скрипт `tools/deploy-prod.sh` делает это сам):
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod exec -T server npx prisma migrate deploy
```

Проверить, что всё живо:
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod ps
curl http://127.0.0.1:3001/health        # {"status":"ok"...}
curl http://127.0.0.1:3001/docs          # Swagger
```

### Проверка после каждого деплоя

`up -d --build` возвращает управление раньше, чем контейнеры прогреются, поэтому проверяю так:

```bash
# 1. Все сервисы подняты, server/postgres/redis — healthy
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod ps

# 2. API отвечает
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/health

# 3. HTTPS отдаёт страницу
curl -sk -o /dev/null -w '%{http_code}\n' https://<домен фронта>/login

# 4. В логах нет ошибок
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod logs --tail=50 server worker | grep -iE 'error|unhandled'

# 5. Данные на месте (ожидаемое число пользователей)
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from \"User\";"'
```

Про `sh -c`: переменные `$POSTGRES_USER` и `$POSTGRES_DB` раскрываются **внутри** контейнера, где они есть в окружении. Без обёртки их раскроет оболочка хоста, где этих переменных нет, и `psql` получит пустые аргументы.

Отдельно после деплоя **клиента** стоит убедиться, что новая сборка действительно попала в nginx: адрес API вшивается в бандл на этапе build, и если в `.env.prod` останется чужой домен, фронт будет ходить не туда:

```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod exec client \
  grep -o 'https://[^"]*' /usr/share/nginx/html/assets/*.js | head
```

## Шаг 4. Открыть наружу

У меня облачный firewall пропускает только 22/80/443, а на хосте 80/443 уже держал Caddy из другого проекта, поэтому TLS я не трогал — сервисы приложения просто подключил к его docker-сети и отдал на реверс-прокси. У вас может быть свой вариант (nginx, трафик напрямую на 80/443) — смысл тот же.

Сервиса `nginx` в `docker-compose.prod.yml` больше нет: он занимал те же 80/443, что и Caddy, и монтировал `./nginx/nginx.conf` и `./nginx/ssl`, которых в репозитории не было — подняться он не мог. Статику по-прежнему отдаёт nginx **внутри образа клиента** (`apps/client/Dockerfile` → `FROM nginx:alpine`), это другое и это работает.

**Caddy + sslip.io** (для домена без своей DNS — `что-угодно.<IP>.sslip.io` резолвится в ваш IP):

В Caddyfile добавьте (не забудьте бэкап, у меня файл в git-репо):
```
<домен фронта> { reverse_proxy your-client-container:80 }    # например pdf-client-1
<домен API>    { reverse_proxy your-server-container:3001 }  # например pdf-server-1
```

Контейнеры приложения должны быть в сети Caddy, иначе reverse_proxy не увидит их по имени. Сеть прописывается **не в репозитории, а в локальном override** (шаг 2) — так обновление `git pull` никогда не конфликтует с настройками хоста:

```yaml
# docker-compose.prod.local.yml
services:
  client:
    networks: [default, proxy]
  server:
    networks: [default, proxy]

networks:
  proxy:
    external: true
    name: <сеть-caddy>
```

Если сети Caddy ещё нет — создайте её один раз: `docker network create <сеть-caddy>`.

Порт `client` на хосте задаётся переменной `CLIENT_PORT` в `.env.prod` (у меня `8080`, чтобы не спорить с Caddy за 80) — сам compose трогать не нужно.

После первого деплоя проверьте, что оба сервиса оказались в обеих сетях:
```bash
# имена сетей для client и server — оба должны быть в pdf_default и в сети Caddy
for svc in client server; do
  id=$(docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod ps -q $svc)
  echo -n "$svc: "; docker inspect "$id" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
done
docker exec <контейнер-caddy> caddy reload --config /etc/caddy/Caddyfile
```

Имена контейнеров зависят от имени каталога (`pdf-client-1` при каталоге `pdf`), поэтому надёжнее спрашивать compose, а не угадывать имя.

⚠️ Важно: если сеть не прописана в override, контейнеры «отваливаются» от прокси при каждом пересоздании — сайт перестаёт отвечать без всякой ошибки в логах приложения. Пустой вывод `docker inspect` — верный признак.

## Смена кода / обновление / рестарт

Обычный деплой — одна команда:

```bash
cd ~/app && tools/deploy-prod.sh
```

Подробно (те же шаги, что делает скрипт):

```bash
cd ~/app
git pull --ff-only
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod exec -T server npx prisma migrate deploy

# рестарт одного сервиса
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod restart server

# остановить всё (контейнеры остаются)
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod stop

# остановить и удалить контейнеры (данные в volumes сохраняются)
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod down
```

`up -d --build` пересобирает только сервисы с `build:` (server, worker, client, pdf2docx) и не трогает postgres/redis — они и не должны пересоздаваться на каждом деплое. Если в выводе вы видите `Recreated` для баз — значит, скорее всего, вы забыли `--env-file` (см. ниже).

Ветку `main` я держу как прод-релизную: сначала `git push origin dev/<ветка>`, потом fast-forward в `main`, и только после этого деплой на сервере. Именно поэтому настройки хоста вынесены в untracked-override: пока я правил `docker-compose.prod.yml` прямо на сервере, любой `git pull` отказывался выполняться («local changes would be overwritten») и обновление зависало.

## На что я потратил время (чтобы вы не наступали на те же грабли)

**⚠️ Самая дорогая грабля — запуск compose без `--env-file`.** Без него переменные `${POSTGRES_PASSWORD}` и `${REDIS_PASSWORD` подставляются пустыми, compose считает конфигурацию изменившейся и **пересоздаёт контейнеры postgres и redis** с пустым паролем. Симптомы:

- `server`/`worker` падают в цикл рестартов: `password authentication failed` / `ECONNREFUSED`;
- `ps` показывает `postgres (unhealthy)`, хотя volume на месте.

Чинится без потери данных: в `.env.prod` возвращаем правильный пароль (в `.env` он должен совпадать с тем, что реально настроен в кластере) и перезапускаем. **С override-файлом обязательно** — без него контейнеры потеряют сеть обратного прокси и сайт ляжет:
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod ps
```
Данные лежат в volume `pdf_postgres_data` и переживают пересоздание контейнера. Убедиться, что всё на месте:
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod exec -T postgres \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select count(*) from \"User\";"'
```

**Рантайм TS-пакетов.** Общие `packages/*` отдают исходники (`"exports": "./src/index.ts"`). Поэтому:
- server/worker запускаются через `tsx`: `node --no-warnings --import tsx dist/index.js`;
- в Dockerfile-ах в runner копируется **полное дерево node_modules со ссылками pnpm как есть** (и `/app/node_modules`, и `apps/*/node_modules`, и `/app/packages`) — дереференсить `cp -rL` нельзя, иначе у `tsx` пропадает `esbuild` из соседнего `.pnpm`;
- у builder обязательно должен быть **повторный** `pnpm install --frozen-lockfile` после `COPY . .` — только так pnpm создаёт `node_modules` внутри каждого `packages/*` (иначе кросс-импорты `@folio-mind/*` и их зависимости не находятся).

В `apps/server/Dockerfile` и `apps/worker/Dockerfile` это уже зашито. В `apps/client/Dockerfile` тот же порядок обязателен: `COPY . .` идёт **до** копирования `node_modules` и повторного `pnpm install`, иначе сборка клиента падает на резолве пакетов. Просто не «упрощайте» эти файлы.

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

**Бэкап.** Всё состояние — в трёх местах: volume `pdf_postgres_data` (документы, версии, пользователи, журнал аудита), бакет S3 (сами файлы) и `.env.prod` / `apps/server/.env.prod`. Дамп базы снимается так:
```bash
docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip > ~/backups/folio-$(date +%F).sql.gz
```

---

## Шпаргалка: деплой одной командой

```bash
cd ~/app && tools/deploy-prod.sh
```

Если что-то не поднимается — загляните в логи: `docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod logs -f server` (или `worker`). Там обычно сразу видно, чего не хватает (чаще всего — env, миграции или сеть Caddy).
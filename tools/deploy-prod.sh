#!/bin/sh
# Прод-деплой folio-mind. Единственная правильная точка входа на сервере:
# сама тянет код, сама подставляет env-файлы и локальный override, сама
# проверяет результат. Ручной `docker compose up` без --env.prod приводит
# к пересозданию Postgres/Redis с пустым паролем, поэтому не делайте так.
#
#   tools/deploy-prod.sh            # обычный деплой
#   tools/deploy-prod.sh --no-pull  # без git pull (когда код уже доставлен)
set -eu

cd "$(dirname "$0")/.."
REPO_DIR=$(pwd)
COMPOSE="docker compose -f docker-compose.prod.yml"
ENV_FILE_ARGS="--env-file .env.prod"

[ -f .env.prod ] || { echo "НЕТ .env.prod в $REPO_DIR - деплой остановлен"; exit 1; }
[ -f apps/server/.env.prod ] || {
  echo "НЕТ apps/server/.env.prod - деплой остановлен"; exit 1;
}

# Пустой VITE_API_URL тихо соберёт клиент на http://localhost:3001,
# поэтому проверяем до сборки, а не после.
if ! grep -qE '^[[:space:]]*VITE_API_URL=https?://[^[:space:]]+' .env.prod; then
  echo "В .env.prod нет корректного VITE_API_URL (нужен https://... ) - деплой остановлен"
  exit 1
fi

if [ -f docker-compose.prod.local.yml ]; then
  COMPOSE="$COMPOSE -f docker-compose.prod.local.yml"
  echo "Использую локальный override: docker-compose.prod.local.yml"
else
  echo "Локального override нет - деплой в standalone-режиме (порты 80/443 должны быть свободны)"
fi

if [ "${1:-}" != "--no-pull" ]; then
  echo ">> git pull"
  git pull --ff-only
fi

echo ">> docker compose up -d --build"
$COMPOSE $ENV_FILE_ARGS up -d --build

echo ">> prisma migrate deploy"
$COMPOSE $ENV_FILE_ARGS exec -T server npx prisma migrate deploy

echo ">> итог"
$COMPOSE $ENV_FILE_ARGS ps --format '{{.Service}} {{.Status}}'

HEALTH=$(docker exec "${COMPOSE_PROJECT_NAME:-pdf}-server-1" wget -qO- http://127.0.0.1:3001/health 2>/dev/null || echo "")
case "$HEALTH" in
  *'"ok"'*) echo "API health: ok" ;;
  *) echo "ВНИМАНИЕ: не дождались ответа /health, проверьте логи: $COMPOSE $ENV_FILE_ARGS logs --tail=50 server" ;;
esac

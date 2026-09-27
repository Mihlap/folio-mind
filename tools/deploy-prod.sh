#!/bin/sh
set -eu

cd "$(dirname "$0")/.."

fail() {
  echo "СТОП: $1" >&2
  exit 1
}

[ -f .env.prod ] || fail "нет .env.prod в $(pwd)"
[ -f apps/server/.env.prod ] || fail "нет apps/server/.env.prod"

grep -qE '^[[:space:]]*VITE_API_URL=https?://[^[:space:]]+' .env.prod ||
  fail "в .env.prod нет корректного VITE_API_URL (нужен http://... или https://...)"

if [ -f docker-compose.prod.local.yml ]; then
  LOCAL_OVERRIDE=yes
else
  LOCAL_OVERRIDE=no
  echo "локального override нет: standalone-режим, порты 80/443 должны быть свободны"
fi

compose() {
  if [ "$LOCAL_OVERRIDE" = yes ]; then
    docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml \
      --env-file .env.prod "$@"
  else
    docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"
  fi
}

if [ "${1:-}" != "--no-pull" ]; then
  echo ">> git pull --ff-only"
  before=$(cksum "$0")
  git pull --ff-only
  if [ "$before" != "$(cksum "$0")" ]; then
    exec sh "$0" --no-pull
  fi
fi

echo ">> docker compose up -d --build"
attempt=1
max_attempts=3
while :; do
  if compose up -d --build; then
    break
  fi
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "СБОЙ: сборка не удалась после $max_attempts попыток. Логи сборки выше." >&2
    exit 1
  fi
  echo "сборка не удалась, повтор $attempt из $max_attempts через 20с" >&2
  attempt=$((attempt + 1))
  sleep 20
done

echo ">> prisma migrate deploy"
compose exec -T server npx prisma migrate deploy

echo ">> итог"
compose ps --format '{{.Service}} {{.Status}}'

echo ">> ждём готовности API (до 60с)"
attempt=0
while [ "$attempt" -lt 30 ]; do
  if compose exec -T server wget -qO- http://127.0.0.1:3001/health 2>/dev/null |
    grep -q '"ok"'; then
    echo "API health: ok"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done

echo "ВНИМАНИЕ: API не ответил за 60с, смотрите логи:" >&2
compose logs --tail=50 server >&2
exit 1

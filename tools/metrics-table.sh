#!/usr/bin/env bash
# Печатает счётчики посещаемости простой таблицей, без JSON.
# Работает на сервере, где нет node и psql: идёт через docker в контейнер API.
#
#   bash tools/metrics-table.sh [дней]   # по умолчанию 30
#
# Токен берётся из apps/server/.env.prod, вручную вводить не нужно.
set -euo pipefail

DAYS="${1:-30}"
cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml -f docker-compose.prod.local.yml --env-file .env.prod)

if [ ! -f apps/server/.env.prod ]; then
  echo "Не найден apps/server/.env.prod. Этот скрипт для сервера." >&2
  exit 1
fi

exec "${COMPOSE[@]}" exec -T server node -e '
const days = process.argv[1] || "30";
const token = process.env.AUTH_METRICS_TOKEN;
if (!token) {
  console.error("В контейнере нет AUTH_METRICS_TOKEN. Добавьте его в apps/server/.env.prod и перезапустите.");
  process.exit(1);
}
const res = await fetch(`http://127.0.0.1:3001/metrics/auth?days=${days}`, {
  headers: { authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`Сервер ответил ${res.status}`);
  process.exit(1);
}
const b = await res.json();
console.log(`Период: ${b.from.slice(0, 10)} ... ${b.to.slice(0, 10)}`);
console.log(`Регистрации: ${b.registrations}`);
console.log(`Входы:       ${b.logins}`);
console.log(`Активные:    ${b.activeUsers}`);
console.log("");
console.log("День         Регистрации   Входы");
const rows = b.byDay.filter((d) => d.registrations || d.logins);
if (rows.length === 0) console.log("(пока нет ни регистраций, ни входов)");
for (const d of rows) {
  console.log(`${d.day}  ${String(d.registrations).padStart(12)}  ${String(d.logins).padStart(5)}`);
}
' "$DAYS"

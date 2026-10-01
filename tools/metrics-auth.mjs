#!/usr/bin/env node
// Печатает счётчики посещаемости (регистрации и входы) по дням.
// Использование:
//   AUTH_METRICS_TOKEN=<токен> node tools/metrics-auth.mjs [дней] [--share]
// По умолчанию — 30 дней. Токен берётся из AUTH_METRICS_TOKEN.
// Флаг --share дополнительно печатает разовую ссылку на статистику
// (срок задаётся переменной SHARE_HOURS, по умолчанию 24 часа).

const days = Number(process.argv[2] ?? 30);
const token = process.env.AUTH_METRICS_TOKEN?.trim();
const API = (process.env.API_URL ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');

if (!token) {
  console.error('Не задан AUTH_METRICS_TOKEN');
  process.exit(1);
}

const res = await fetch(`${API}/metrics/auth?days=${days}`, {
  headers: { authorization: `Bearer ${token}` },
});

if (!res.ok) {
  console.error(`API ответил ${res.status}`);
  console.error(await res.text());
  process.exit(1);
}

const body = await res.json();

console.log(`Период: ${body.from.slice(0, 10)} … ${body.to.slice(0, 10)}`);
console.log(`Регистрации: ${body.registrations}`);
console.log(`Входы:       ${body.logins}`);
console.log(`Активные:    ${body.activeUsers}`);
console.log('');
console.log('День        Регистрации  Входы');
for (const day of body.byDay) {
  if (day.registrations === 0 && day.logins === 0) continue;
  console.log(
    `${day.day}  ${String(day.registrations).padStart(12)}  ${String(day.logins).padStart(5)}`,
  );
}

if (process.argv.includes('--share')) {
  const hours = Number(process.env.SHARE_HOURS ?? 24);
  const res = await fetch(`${API}/metrics/auth/share?days=${days}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ hours }),
  });
  if (!res.ok) {
    console.error(`Не удалось выдать ссылку: API ответил ${res.status}`);
    process.exit(1);
  }
  const share = await res.json();
  console.log('');
  console.log(
    `Разовая ссылка (действует ${share.hours} ч, до ${share.expiresAt.slice(0, 16).replace('T', ' ')}):`,
  );
  console.log(share.url);
}

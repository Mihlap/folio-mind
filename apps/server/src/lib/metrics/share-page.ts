export type SharePageData = {
  from: string;
  to: string;
  registrations: number;
  logins: number;
  activeUsers: number;
  byDay: Array<{ day: string; registrations: number; logins: number }>;
  expiresAt: string;
  days: number;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCDate()}.${pad(date.getUTCMonth() + 1)}.${date.getUTCFullYear()}, ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())} UTC`;
}

function reasonText(reason: 'malformed' | 'bad-signature' | 'expired'): string {
  if (reason === 'expired') {
    return 'Срок действия ссылки истёк. Создайте новую ссылку в консоли администратора.';
  }
  return 'Ссылка недействительна. Создайте новую ссылку в консоли администратора.';
}

/** Страница, которая открывается по разовой ссылке. */
export function renderMetricsSharePage(data: SharePageData): string {
  return renderPage(data, null);
}

export function renderMetricsShareErrorPage(
  reason: 'malformed' | 'bad-signature' | 'expired',
): string {
  return renderPage(null, reason);
}

function renderPage(
  data: SharePageData | null,
  reason: 'malformed' | 'bad-signature' | 'expired' | null,
) {
  const isError = data === null;
  const title = isError ? 'Ссылка не работает' : 'Посещаемость РазУма';
  const subtitle = isError
    ? 'Доступ не предоставлен'
    : `Данные за последние ${data.days} ${plural(data.days, 'день', 'дня', 'дней')}`;

  const body = isError
    ? `<p class="lead">${escapeHtml(reasonText(reason!))}</p>`
    : `
      <div class="stats">
        <div class="stat">
          <div class="stat-value">${data.registrations}</div>
          <div class="stat-label">Регистраций</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.logins}</div>
          <div class="stat-label">Входов</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.activeUsers}</div>
          <div class="stat-label">Активных пользователей</div>
        </div>
      </div>
      <div class="meta">
        Период: ${escapeHtml(formatDate(data.from))} — ${escapeHtml(formatDate(data.to))}
        <br />Ссылка действует до ${escapeHtml(formatDateTime(data.expiresAt))}
      </div>
      <table>
        <thead>
          <tr><th>День</th><th>Регистрации</th><th>Входы</th></tr>
        </thead>
        <tbody>
          ${data.byDay
            .map(
              (row) =>
                `<tr><td>${escapeHtml(row.day)}</td><td class="num">${row.registrations}</td><td class="num">${row.logins}</td></tr>`,
            )
            .join('\n          ')}
        </tbody>
      </table>
      <p class="note">Данные обезличенные: без адресов почты и IP-адресов.</p>
    `;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${escapeHtml(title)} — РазУм</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      padding: 2rem 1rem;
      font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #eef2ff 0%, #fff 50%, #f8fafc 100%);
      color: #0f172a;
    }
    .card {
      width: 100%;
      max-width: 42rem;
      margin: 0 auto;
      padding: 2rem;
      border-radius: 1rem;
      border: 1px solid rgba(226, 232, 240, 0.8);
      background: #fff;
      box-shadow: 0 20px 40px rgba(148, 163, 184, 0.25);
    }
    .brand { font-size: 1.5rem; font-weight: 600; color: #4338ca; }
    h1 { margin: 1.25rem 0 0; font-size: 1.5rem; font-weight: 800; }
    .badge {
      display: inline-block;
      margin-top: 0.5rem;
      padding: 0.25rem 0.75rem;
      border-radius: 0.75rem;
      font-size: 0.875rem;
      font-weight: 500;
      background: ${isError ? '#fef2f2' : '#eef2ff'};
      color: ${isError ? '#991b1b' : '#3730a3'};
    }
    .lead { margin: 1.5rem 0 0; font-size: 0.9375rem; line-height: 1.6; color: #475569; }
    .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 1.5rem; }
    .stat {
      padding: 1rem 0.75rem;
      border-radius: 0.75rem;
      background: #f8fafc;
      text-align: center;
    }
    .stat-value { font-size: 1.5rem; font-weight: 800; color: #0f172a; }
    .stat-label { margin-top: 0.25rem; font-size: 0.75rem; color: #64748b; }
    .meta { margin-top: 1rem; font-size: 0.8125rem; line-height: 1.6; color: #64748b; }
    table { width: 100%; margin-top: 1.5rem; border-collapse: collapse; font-size: 0.875rem; }
    th, td { padding: 0.5rem 0.625rem; border-bottom: 1px solid #e2e8f0; text-align: left; }
    th { background: #f8fafc; color: #475569; font-weight: 600; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .note { margin-top: 1rem; font-size: 0.75rem; color: #94a3b8; }
    @media (max-width: 30rem) { .stats { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">РазУм</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="badge">${escapeHtml(subtitle)}</div>
    ${body}
  </div>
</body>
</html>`;
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const AUTH_CHANNEL = 'folio-auth';

function crossTabNotifyScript(): string {
  return `<script>
(function () {
  try {
    var ch = new BroadcastChannel(${JSON.stringify(AUTH_CHANNEL)});
    ch.postMessage({ type: 'email-verified' });
    ch.close();
  } catch (e) {}
})();
</script>`;
}

export function renderVerifyEmailHtmlPage(
  outcome: 'success' | 'error',
  detail?: string,
): string {
  const isSuccess = outcome === 'success';
  const title = isSuccess ? 'Спасибо!' : 'Не удалось подтвердить';
  const subtitle = isSuccess ? 'Почта подтверждена' : 'Ссылка недействительна';
  const body = isSuccess
    ? 'Можете закрыть эту вкладку и вернуться на страницу регистрации или войти в РазУм.'
    : (detail ?? 'Ссылка устарела или уже была использована. Запросите новое письмо на сайте.');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — РазУм</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: linear-gradient(135deg, #f0f9ff 0%, #fff 50%, #f8fafc 100%);
      color: #0f172a;
    }
    .card {
      width: 100%;
      max-width: 28rem;
      padding: 2rem;
      border-radius: 1rem;
      border: 1px solid rgba(226, 232, 240, 0.8);
      background: #fff;
      box-shadow: 0 20px 40px rgba(148, 163, 184, 0.25);
      text-align: center;
    }
    .brand {
      font-size: 1.75rem;
      font-weight: 600;
      background: linear-gradient(90deg, #0369a1, #0f172a);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    h1 { margin: 1.5rem 0 0; font-size: 1.5rem; font-weight: 800; }
    .badge {
      display: inline-block;
      margin-top: 0.25rem;
      padding: 0.25rem 0.75rem;
      border-radius: 0.75rem;
      font-size: 0.875rem;
      font-weight: 500;
      background: ${isSuccess ? '#f0f9ff' : '#fef2f2'};
      color: ${isSuccess ? '#0c4a6e' : '#991b1b'};
    }
    p { margin: 2rem 0 0; font-size: 0.875rem; line-height: 1.5; color: #475569; }
    .icon { font-size: 2.5rem; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">РазУм</div>
    <div class="icon">${isSuccess ? '✓' : '✕'}</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="badge">${escapeHtml(subtitle)}</div>
    <p>${escapeHtml(body)}</p>
  </div>
  ${isSuccess ? crossTabNotifyScript() : ''}
</body>
</html>`;
}

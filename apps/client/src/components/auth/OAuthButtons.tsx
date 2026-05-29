import { apiBaseUrl } from '@folio-mind/store';

/** Включить, когда будут настроены GOOGLE_OAUTH_* / YANDEX_OAUTH_* на сервере */
const OAUTH_LOGIN_ENABLED = false;

const providers = [
  { id: 'google', label: 'Google' },
  { id: 'yandex', label: 'Яндекс' },
] as const;

export function OAuthButtons() {
  if (!OAUTH_LOGIN_ENABLED) {
    return null;
  }

  return (
    <div className="space-y-2">
      <p className="text-center text-xs text-slate-500">или войти через</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        {providers.map((p) => (
          <a
            key={p.id}
            href={`${apiBaseUrl}/auth/oauth/${p.id}/start`}
            className="flex flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-folio-300 hover:bg-folio-50"
          >
            {p.label}
          </a>
        ))}
      </div>
    </div>
  );
}

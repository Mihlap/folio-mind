import { apiBaseUrl } from '@folio-mind/store';
type Provider = {
  id: string;
  label: string;
};
const providers: Provider[] = [
  { id: 'yandex', label: 'Яндекс' },
  { id: 'esia', label: 'Госуслуги' },
];
export function OAuthButtons() {
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

import { useState } from 'react';
import {
  DEFAULT_SHARE_LINK_TTL_PRESET,
  SHARE_LINK_TTL_PRESETS,
  useCreateShareLinkMutation,
  useListShareLinksQuery,
  useRevokeShareLinkMutation,
  type ShareLinkTtlPresetId,
} from '@folio-mind/store';
import type { DocumentVersionItem } from './DocumentVersionsPanel.js';
import {
  reportActionBtnPrimary,
  reportActionsColumnClass,
} from '../ui/FeatureHelp.js';

type Props = {
  documentId: string;
  activeVersion: DocumentVersionItem | undefined;
  versionReady: boolean;
};

function formatExpires(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMutationError(err: unknown): string {
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && data && 'error' in data) {
      return String((data as { error: string }).error);
    }
  }
  return 'Не удалось выполнить операцию';
}

export function DocumentSharePanel({ documentId, activeVersion, versionReady }: Props) {
  const [ttlPreset, setTtlPreset] = useState<ShareLinkTtlPresetId>(DEFAULT_SHARE_LINK_TTL_PRESET);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const { data, isLoading } = useListShareLinksQuery(documentId);
  const [createLink, { isLoading: creating }] = useCreateShareLinkMutation();
  const [revokeLink, { isLoading: revoking }] = useRevokeShareLinkMutation();

  const handleCreate = async () => {
    if (!activeVersion?.id) return;
    setCopyNotice(null);
    try {
      const result = await createLink({
        documentId,
        body: { versionId: activeVersion.id, ttl: ttlPreset },
      }).unwrap();
      setCreatedUrl(result.url);
      await navigator.clipboard.writeText(result.url);
      setCopyNotice('Ссылка создана и скопирована в буфер обмена');
    } catch (err) {
      setCopyNotice(getMutationError(err));
    }
  };

  const handleCopy = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopyNotice('Скопировано');
  };

  const handleRevoke = async (linkId: string) => {
    setCopyNotice(null);
    try {
      await revokeLink({ documentId, linkId }).unwrap();
      if (createdUrl) setCreatedUrl(null);
    } catch (err) {
      setCopyNotice(getMutationError(err));
    }
  };

  const activeLinks = data?.items.filter((l) => l.active) ?? [];
  const inactiveLinks = data?.items.filter((l) => !l.active) ?? [];

  return (
    <div className="space-y-3 text-sm text-slate-700">
      <p className="text-[11px] leading-snug text-slate-400">
        Заказчик откроет страницы в браузере — без скачивания PDF. Ссылка действует выбранное время.
      </p>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-slate-500">Срок действия</span>
        <select
          value={ttlPreset}
          onChange={(e) => setTtlPreset(e.target.value as ShareLinkTtlPresetId)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"
        >
          {SHARE_LINK_TTL_PRESETS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <div className={reportActionsColumnClass}>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={!versionReady || !activeVersion || creating}
          className={reportActionBtnPrimary}
        >
          {creating ? 'Создание…' : 'Создать ссылку для заказчика'}
        </button>
      </div>

      {createdUrl && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
          <p className="mb-1 text-xs font-medium text-emerald-800">Новая ссылка</p>
          <p className="break-all font-mono text-xs text-emerald-900">{createdUrl}</p>
          <button
            type="button"
            onClick={() => void handleCopy(createdUrl)}
            className="mt-2 cursor-pointer text-xs font-medium text-emerald-700 underline hover:text-emerald-900"
          >
            Скопировать снова
          </button>
        </div>
      )}

      {copyNotice && <p className="text-xs text-slate-600">{copyNotice}</p>}

      {isLoading ? (
        <p className="text-xs text-slate-500">Загрузка ссылок…</p>
      ) : (
        <>
          {activeLinks.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">Активные ссылки</p>
              <ul className="space-y-2">
                {activeLinks.map((link) => (
                  <li
                    key={link.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                  >
                    <p className="text-xs text-slate-600">
                      Версия v{link.version} · до {formatExpires(link.expiresAt)}
                    </p>
                    <button
                      type="button"
                      disabled={revoking}
                      onClick={() => void handleRevoke(link.id)}
                      className="mt-1 text-xs font-medium text-rose-600 underline disabled:opacity-50"
                    >
                      Отозвать
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {inactiveLinks.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-400">Истекшие / отозванные</p>
              <ul className="space-y-1 text-xs text-slate-400">
                {inactiveLinks.slice(0, 5).map((link) => (
                  <li key={link.id}>
                    v{link.version} · {link.revokedAt ? 'отозвана' : 'истекла'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

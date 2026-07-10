import { useState } from 'react';
import {
  DEFAULT_SHARE_LINK_TTL_PRESET,
  LABEL_GUEST_BOOKLET_ZIP,
  LABEL_GUEST_BOOKLET_ZIP_HINT,
  SHARE_LINK_TTL_PRESETS,
  useCreateShareLinkMutation,
  useListShareLinksQuery,
  useRevokeShareLinkMutation,
  type ShareLinkTtlPresetId,
} from '@folio-mind/store';
import type { DocumentVersionItem } from './DocumentVersionsPanel.js';
import type { DocumentReviewStatus } from '@folio-mind/store';
import { DocumentReviewStatusControl } from './DocumentReviewStatusControl.js';
import { DocumentPageReviewBar } from './DocumentPageReviewBar.js';
import { PasswordInput } from '../auth/PasswordInput.js';
import { reportActionBtnPrimary, reportActionsColumnClass } from '../ui/FeatureHelp.styles.js';

type Props = {
  documentId: string;
  activeVersion: DocumentVersionItem | undefined;
  versionReady: boolean;
  reviewStatus: DocumentReviewStatus;
  reviewStatusChangedAt: string | null;
  viewerPage: number;
};

const VERSION_LABEL_TITLE: Record<'draft' | 'in_review' | 'final', string> = {
  draft: 'Черновик',
  in_review: 'На согласовании',
  final: 'Финал',
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
    if (typeof data === 'object' && data) {
      if ('error' in data && typeof (data as { error: unknown }).error === 'string') {
        return (data as { error: string }).error;
      }
      if ('message' in data && typeof (data as { message: unknown }).message === 'string') {
        const message = (data as { message: string }).message;
        if (message.includes('/password') || message.toLowerCase().includes('password')) {
          return 'Пароль ссылки должен быть от 4 до 64 символов';
        }
        if (message !== 'Bad Request') return message;
      }
    }
  }
  return 'Не удалось выполнить операцию';
}

function validateSharePassword(password: string): string | null {
  const trimmed = password.trim();
  if (!trimmed) return null;
  if (trimmed.length < 4) return 'Пароль ссылки должен быть не короче 4 символов';
  if (trimmed.length > 64) return 'Пароль ссылки не длиннее 64 символов';
  return null;
}

export function DocumentSharePanel({
  documentId,
  activeVersion,
  versionReady,
  reviewStatus,
  reviewStatusChangedAt,
  viewerPage,
}: Props) {
  const [ttlPreset, setTtlPreset] = useState<ShareLinkTtlPresetId>(DEFAULT_SHARE_LINK_TTL_PRESET);
  const [sharePassword, setSharePassword] = useState('');
  const [allowBookletZip, setAllowBookletZip] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const { data, isLoading } = useListShareLinksQuery(documentId);
  const [createLink, { isLoading: creating }] = useCreateShareLinkMutation();
  const [revokeLink, { isLoading: revoking }] = useRevokeShareLinkMutation();

  const handleCreate = async () => {
    if (!activeVersion?.id) return;
    setCopyNotice(null);
    const passwordError = validateSharePassword(sharePassword);
    if (passwordError) {
      setCopyNotice(passwordError);
      return;
    }
    try {
      const result = await createLink({
        documentId,
        body: {
          versionId: activeVersion.id,
          ttl: ttlPreset,
          allowBookletZip,
          ...(sharePassword.trim() ? { password: sharePassword.trim() } : {}),
        },
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
      <DocumentReviewStatusControl
        documentId={documentId}
        reviewStatus={reviewStatus}
        reviewStatusChangedAt={reviewStatusChangedAt}
      />

      {activeVersion?.id && (
        <DocumentPageReviewBar
          documentId={documentId}
          versionId={activeVersion.id}
          viewerPage={viewerPage}
          versionReady={versionReady}
        />
      )}

      <p className="text-[11px] leading-snug text-slate-400">
        Заказчик откроет страницы в браузере — без скачивания PDF. Ссылка действует выбранное время.
      </p>

      {activeVersion && (
        <div
          className={`rounded-lg border px-3 py-2 text-xs ${
            versionReady
              ? 'border-folio-200 bg-folio-50/60 text-folio-800'
              : 'border-amber-200 bg-amber-50 text-amber-900'
          }`}
        >
          <p className="font-medium">
            Ссылка будет привязана к версии v{activeVersion.version}
            {activeVersion.versionLabel
              ? ` (${VERSION_LABEL_TITLE[activeVersion.versionLabel]})`
              : ''}
          </p>
          {!versionReady && (
            <p className="mt-1 text-[11px] leading-snug text-amber-800">
              Эта версия еще обрабатывается. Создать ссылку можно после завершения обработки.
            </p>
          )}
        </div>
      )}

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

      <PasswordInput
        label="Пароль (необязательно)"
        value={sharePassword}
        onChange={setSharePassword}
        minLength={4}
        maxLength={64}
        placeholder="От 4 символов — заказчик введёт при открытии"
        autoComplete="new-password"
        hint={
          <span className="mt-1 block text-[11px] text-slate-400">
            Если нужен пароль — минимум 4 символа.
          </span>
        }
      />

      <label className="flex items-start gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={allowBookletZip}
          onChange={(e) => setAllowBookletZip(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="font-medium text-slate-700">{LABEL_GUEST_BOOKLET_ZIP}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">
            {LABEL_GUEST_BOOKLET_ZIP_HINT}
          </span>
        </span>
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
                    {link.url ? (
                      <div className="mt-2 space-y-1">
                        <p className="break-all font-mono text-[11px] text-slate-700">{link.url}</p>
                        <button
                          type="button"
                          onClick={() => void handleCopy(link.url!)}
                          className="cursor-pointer text-xs font-medium text-folio-700 underline hover:text-folio-900"
                        >
                          Скопировать ссылку
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 text-[11px] leading-snug text-slate-400">
                        URL этой ссылки недоступен — отзовите и создайте новую.
                      </p>
                    )}
                    <button
                      type="button"
                      disabled={revoking}
                      onClick={() => void handleRevoke(link.id)}
                      className="mt-2 text-xs font-medium text-rose-600 underline disabled:opacity-50"
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

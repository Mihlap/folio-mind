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
import { DocumentSharePreChecklist } from './DocumentSharePreChecklist.js';
import { buildSharePreChecklist } from '../../lib/documents/version-workflow.js';

type Props = {
  documentId: string;
  activeVersion: DocumentVersionItem | undefined;
  versionReady: boolean;
  reviewStatus: DocumentReviewStatus;
  reviewStatusChangedAt: string | null;
  viewerPage: number;
  needsFixMarksCount?: number;
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
  needsFixMarksCount = 0,
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
      setCopyNotice('Гостевая ссылка создана и скопирована');
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
  const sharePreChecklist = buildSharePreChecklist({
    versionReady,
    needsFixMarksCount,
    reviewStatus,
    allowBookletZip,
  });

  return (
    <div className="space-y-4 text-sm text-slate-700">
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

      <div className="rounded-xl border-2 border-amber-200 bg-amber-50/40 p-3 space-y-3">
        <div>
          <p className="text-xs font-semibold text-amber-950">Ссылка для заказчика</p>
          <p className="mt-1 text-[11px] leading-snug text-amber-900/80">
            Без регистрации. Заказчик откроет страницы в браузере — без скачивания PDF. Срок
            действия ограничен; ссылку можно отозвать.
          </p>
        </div>

        {activeVersion && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              versionReady
                ? 'border-folio-200 bg-white/80 text-folio-800'
                : 'border-amber-300 bg-amber-100/80 text-amber-950'
            }`}
          >
            <p className="font-medium">
              Привязка к версии v{activeVersion.version}
            </p>
            {!versionReady && (
              <p className="mt-1 text-[11px] leading-snug">
                Версия ещё обрабатывается. Создайте ссылку после завершения обработки.
              </p>
            )}
          </div>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">Срок действия</span>
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
          label="Пароль для заказчика (необязательно)"
          value={sharePassword}
          onChange={setSharePassword}
          minLength={4}
          maxLength={64}
          placeholder="От 4 символов — введёт при открытии ссылки"
          autoComplete="new-password"
          hint={
            <span className="mt-1 block text-[11px] text-slate-500">
              Только для гостевой ссылки, не для входа коллег в Folio Mind.
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
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
              {LABEL_GUEST_BOOKLET_ZIP_HINT}
            </span>
          </span>
        </label>

        <DocumentSharePreChecklist items={sharePreChecklist} />

        <div className={reportActionsColumnClass}>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!versionReady || !activeVersion || creating}
            className={reportActionBtnPrimary}
          >
            {creating ? 'Создание…' : 'Создать гостевую ссылку'}
          </button>
        </div>

        {createdUrl && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 p-3">
            <p className="mb-1 text-xs font-medium text-emerald-800">Новая гостевая ссылка</p>
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

        {isLoading ? (
          <p className="text-xs text-slate-500">Загрузка ссылок…</p>
        ) : (
          <>
            {activeLinks.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-600">Активные гостевые ссылки</p>
                <ul className="space-y-2">
                  {activeLinks.map((link) => (
                    <li
                      key={link.id}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2"
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
                          URL недоступен — отзовите и создайте новую.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={revoking}
                        onClick={() => void handleRevoke(link.id)}
                        className="mt-2 cursor-pointer text-xs font-medium text-rose-600 underline disabled:cursor-not-allowed disabled:opacity-50"
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

      {copyNotice && <p className="text-xs text-slate-600">{copyNotice}</p>}
    </div>
  );
}

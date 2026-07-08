import { useState } from 'react';
import {
  HINT_GUEST_RESOLVE_REPLY,
  LABEL_GUEST_AUTHOR_REPLY,
  LABEL_GUEST_COMMENT_OPEN,
  LABEL_GUEST_COMMENT_RESOLVED,
  MSG_GUEST_COMMENT_RESOLVED_AUTHOR,
  PLACEHOLDER_GUEST_RESOLVE_REPLY,
} from '@folio-mind/store';
import type { GuestShareComment } from '@folio-mind/store';
import { ResizableContentWindow } from '../ui/ResizableContentWindow.js';

type Props = {
  comment: GuestShareComment;
  focused: boolean;
  formatWhen: (iso: string) => string;
  itemRef?: (el: HTMLLIElement | null) => void;
  onGoToComment?: (page: number, commentId: string) => void;
  onResolve: (authorReply?: string) => Promise<void>;
  onReopen: () => Promise<void>;
  onDelete?: () => void;
  updating: boolean;
  deleting: boolean;
};

export function GuestCommentCard({
  comment,
  focused,
  formatWhen,
  itemRef,
  onGoToComment,
  onResolve,
  onReopen,
  onDelete,
  updating,
  deleting,
}: Props) {
  const [windowOpen, setWindowOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState('');
  const [resolveNotice, setResolveNotice] = useState<string | null>(null);

  const author = comment.authorName?.trim() || 'Заказчик';
  const windowTitle = `Замечание · стр. ${comment.page}`;
  const isResolved = comment.status === 'resolved';
  const statusLabel = isResolved ? LABEL_GUEST_COMMENT_RESOLVED : LABEL_GUEST_COMMENT_OPEN;

  async function handleConfirmResolve() {
    await onResolve(replyDraft.trim() || undefined);
    setResolveOpen(false);
    setReplyDraft('');
    setResolveNotice(MSG_GUEST_COMMENT_RESOLVED_AUTHOR);
  }

  async function handleReopen() {
    await onReopen();
    setResolveNotice(null);
  }

  return (
    <>
      <li
        ref={itemRef}
        className={[
          'rounded-md border px-2.5 py-2 text-sm',
          isResolved
            ? 'border-emerald-200 bg-emerald-50/60 text-slate-700'
            : 'border-amber-200 bg-white text-slate-800',
          focused ? 'ring-2 ring-sky-300' : '',
        ].join(' ')}
      >
        <p
          className={[
            'text-[11px] font-semibold',
            isResolved ? 'text-emerald-800' : 'text-amber-900',
          ].join(' ')}
        >
          {statusLabel}
        </p>

        <button
          type="button"
          onClick={() => setWindowOpen(true)}
          className="mt-1.5 w-full cursor-pointer rounded-md border border-slate-100 bg-white/80 px-2.5 py-2 text-left shadow-sm transition hover:border-folio-200 hover:bg-folio-50/40"
          title="Открыть замечание в отдельном окне"
        >
          <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
            {comment.content}
          </p>
          <p className="mt-1.5 text-[10px] text-slate-400">Нажмите, чтобы открыть для чтения</p>
        </button>

        {isResolved && comment.authorReply && (
          <div className="mt-2 rounded-md border border-emerald-200 bg-white/90 px-2.5 py-2 text-xs">
            <p className="font-medium text-emerald-800">{LABEL_GUEST_AUTHOR_REPLY}</p>
            <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-700">
              {comment.authorReply}
            </p>
          </div>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>{author}</span>
          <span>·</span>
          <span>{formatWhen(comment.createdAt)}</span>
          {isResolved && comment.resolvedAt && (
            <>
              <span>·</span>
              <span>закрыто {formatWhen(comment.resolvedAt)}</span>
            </>
          )}
          {comment.x != null && comment.y != null && !isResolved && (
            <>
              <span>·</span>
              <span>метка на странице</span>
            </>
          )}
        </div>

        {resolveNotice && isResolved && (
          <p className="mt-2 text-[11px] leading-snug text-emerald-800">{resolveNotice}</p>
        )}

        {resolveOpen && !isResolved && (
          <div className="mt-2 space-y-2 rounded-md border border-folio-200 bg-folio-50/50 p-2.5">
            <label className="block text-xs text-slate-700">
              Ответ заказчику
              <textarea
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={PLACEHOLDER_GUEST_RESOLVE_REPLY}
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
            </label>
            <p className="text-[10px] leading-snug text-slate-500">{HINT_GUEST_RESOLVE_REPLY}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={updating}
                onClick={() => void handleConfirmResolve()}
                className="cursor-pointer rounded-lg bg-folio-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-folio-700 disabled:opacity-50"
              >
                {updating ? 'Сохранение…' : 'Закрыть замечание'}
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={() => {
                  setResolveOpen(false);
                  setReplyDraft('');
                }}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        <div className="mt-2 flex flex-wrap gap-2">
          {!isResolved && onGoToComment && (
            <button
              type="button"
              className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-folio-700 hover:bg-folio-50"
              onClick={() => onGoToComment(comment.page, comment.id)}
            >
              Перейти к замечанию
            </button>
          )}
          {isResolved ? (
            <button
              type="button"
              disabled={updating}
              onClick={() => void handleReopen()}
              className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Вернуть в работу
            </button>
          ) : (
            <button
              type="button"
              disabled={updating || resolveOpen}
              onClick={() => setResolveOpen(true)}
              className="cursor-pointer rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            >
              Отметить решённым
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              disabled={deleting}
              onClick={onDelete}
              className="cursor-pointer rounded border border-rose-200 bg-white px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              Удалить
            </button>
          )}
        </div>
      </li>

      <ResizableContentWindow open={windowOpen} title={windowTitle} onClose={() => setWindowOpen(false)}>
        <div className="space-y-3">
          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-800">{comment.content}</p>
          {comment.authorReply && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-sm">
              <p className="text-xs font-semibold text-emerald-800">{LABEL_GUEST_AUTHOR_REPLY}</p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-slate-800">
                {comment.authorReply}
              </p>
            </div>
          )}
          <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
            <p>
              {author} · {formatWhen(comment.createdAt)} · {statusLabel}
            </p>
            <p className="mt-1">Страница {comment.page}</p>
            {comment.x != null && comment.y != null && !isResolved && (
              <p className="mt-1">Есть привязка к месту на листе</p>
            )}
          </div>
        </div>
      </ResizableContentWindow>
    </>
  );
}

import { useState } from 'react';
import type { GuestShareComment } from '@folio-mind/store';
import { ResizableContentWindow } from '../ui/ResizableContentWindow.js';

type Props = {
  comment: GuestShareComment;
  focused: boolean;
  formatWhen: (iso: string) => string;
  itemRef?: (el: HTMLLIElement | null) => void;
  onGoToComment?: (page: number, commentId: string) => void;
  onToggleStatus: () => void;
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
  onToggleStatus,
  onDelete,
  updating,
  deleting,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [windowOpen, setWindowOpen] = useState(false);

  const author = comment.authorName?.trim() || 'Заказчик';
  const windowTitle = `Замечание · стр. ${comment.page}`;
  const statusLabel = comment.status === 'resolved' ? 'Решено' : 'Открыто';

  return (
    <>
      <li
        ref={itemRef}
        className={[
          'rounded-md border px-2.5 py-2 text-sm',
          comment.status === 'resolved'
            ? 'border-emerald-200 bg-emerald-50/60 text-slate-700'
            : 'border-amber-200 bg-white text-slate-800',
          focused ? 'ring-2 ring-sky-300' : '',
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-medium text-slate-600">{statusLabel}</p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setWindowOpen(true)}
              className="cursor-pointer rounded px-2 py-0.5 text-xs font-medium text-folio-700 hover:bg-folio-50"
              title="Открыть в отдельном окне с изменением размера"
            >
              В окне
            </button>
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="cursor-pointer rounded px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              {expanded ? 'Свернуть' : 'Развернуть'}
            </button>
          </div>
        </div>

        {expanded && (
          <button
            type="button"
            onClick={() => setWindowOpen(true)}
            className="mt-1 w-full cursor-pointer rounded text-left transition hover:bg-black/[0.03]"
            title="Нажмите, чтобы открыть в отдельном окне"
          >
            <p className="whitespace-pre-wrap">{comment.content}</p>
          </button>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <span>{author}</span>
          <span>·</span>
          <span>{formatWhen(comment.createdAt)}</span>
          {comment.x != null && comment.y != null && (
            <>
              <span>·</span>
              <span>метка на странице</span>
            </>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {onGoToComment && (
            <button
              type="button"
              className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-folio-700 hover:bg-folio-50"
              onClick={() => onGoToComment(comment.page, comment.id)}
            >
              Перейти к замечанию
            </button>
          )}
          <button
            type="button"
            disabled={updating}
            onClick={onToggleStatus}
            className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {comment.status === 'resolved' ? 'Вернуть в работу' : 'Отметить решённым'}
          </button>
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
          <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
            <p>
              {author} · {formatWhen(comment.createdAt)} · {statusLabel}
            </p>
            <p className="mt-1">Страница {comment.page}</p>
          </div>
        </div>
      </ResizableContentWindow>
    </>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import {
  useClearGuestCommentsMutation,
  useDeleteGuestCommentMutation,
  useListGuestCommentsQuery,
  useListShareLinksQuery,
  useUpdateGuestCommentStatusMutation,
  type GuestShareComment,
} from '@folio-mind/store';

type Props = {
  documentId: string;
  versionId: string;
  versionReady: boolean;
  focusedCommentId?: string | null;
  onGoToComment?: (page: number, commentId: string) => void;
};

const GUEST_COMMENTS_POLL_MS = 4000;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DocumentGuestCommentsPanel({
  documentId,
  versionId,
  versionReady,
  focusedCommentId = null,
  onGoToComment,
}: Props) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const { data, isLoading } = useListGuestCommentsQuery(
    { documentId, versionId },
    {
      skip: !versionReady || !versionId,
      pollingInterval: GUEST_COMMENTS_POLL_MS,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const { data: shareLinksData } = useListShareLinksQuery(documentId, {
    skip: !versionReady || !versionId,
    pollingInterval: GUEST_COMMENTS_POLL_MS,
  });
  const [updateStatus, { isLoading: updating }] = useUpdateGuestCommentStatusMutation();
  const [deleteComment, { isLoading: deletingOne }] = useDeleteGuestCommentMutation();
  const [clearComments, { isLoading: clearing }] = useClearGuestCommentsMutation();

  const canDelete = useMemo(() => {
    const links = shareLinksData?.items ?? [];
    if (links.length === 0) return true;
    return !links.some((link) => link.active && link.versionId === versionId);
  }, [shareLinksData?.items, versionId]);

  const grouped = useMemo(() => {
    const items = data?.items ?? [];
    const byPage = new Map<number, GuestShareComment[]>();
    for (const item of items) {
      const list = byPage.get(item.page) ?? [];
      list.push(item);
      byPage.set(item.page, list);
    }
    return [...byPage.entries()].sort((a, b) => a[0] - b[0]);
  }, [data?.items]);

  const openCount = (data?.items ?? []).filter((item) => item.status === 'open').length;

  useEffect(() => {
    if (!focusedCommentId) return;
    const el = itemRefs.current.get(focusedCommentId);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedCommentId]);

  if (!versionReady) {
    return <p className="text-xs text-slate-500">Выберите готовую версию документа.</p>;
  }

  if (isLoading && grouped.length === 0) {
    return <p className="text-sm text-slate-500">Загрузка замечаний…</p>;
  }

  if (grouped.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Замечаний от заказчика пока нет. Они появятся здесь после отправки комментария по
        гостевой ссылке.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">
          Всего: {data?.items.length ?? 0}
          {openCount > 0 ? ` · открытых: ${openCount}` : ' · все обработаны'}
        </p>
        {canDelete && (
          <button
            type="button"
            disabled={clearing}
            onClick={() => void clearComments({ documentId, versionId })}
            className="cursor-pointer text-xs font-medium text-rose-600 underline hover:text-rose-800 disabled:opacity-50"
          >
            {clearing ? 'Удаление…' : 'Удалить все'}
          </button>
        )}
      </div>
      {!canDelete && (
        <p className="text-[11px] text-slate-500">
          Удаление доступно после отзыва или истечения всех гостевых ссылок для этой версии.
        </p>
      )}
      <ul className="space-y-3">
        {grouped.map(([page, comments]) => (
          <li key={page} className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
            <p className="mb-2 text-xs font-medium text-slate-800">Стр. {page}</p>
            <ul className="space-y-2">
              {comments.map((comment) => {
                const focused = focusedCommentId === comment.id;
                return (
                  <li
                    key={comment.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(comment.id, el);
                      else itemRefs.current.delete(comment.id);
                    }}
                    className={[
                      'rounded-md border px-2.5 py-2 text-sm',
                      comment.status === 'resolved'
                        ? 'border-emerald-200 bg-emerald-50/60 text-slate-700'
                        : 'border-amber-200 bg-white text-slate-800',
                      focused ? 'ring-2 ring-sky-300' : '',
                    ].join(' ')}
                  >
                    <p className="whitespace-pre-wrap">{comment.content}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{comment.authorName?.trim() || 'Заказчик'}</span>
                      <span>·</span>
                      <span>{formatWhen(comment.createdAt)}</span>
                      {comment.x != null && comment.y != null && (
                        <>
                          <span>·</span>
                          <span>метка на странице</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{comment.status === 'resolved' ? 'Решено' : 'Открыто'}</span>
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
                        onClick={() =>
                          void updateStatus({
                            documentId,
                            versionId,
                            commentId: comment.id,
                            status: comment.status === 'resolved' ? 'open' : 'resolved',
                          })
                        }
                        className="cursor-pointer rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {comment.status === 'resolved' ? 'Вернуть в работу' : 'Отметить решённым'}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          disabled={deletingOne}
                          onClick={() =>
                            void deleteComment({
                              documentId,
                              versionId,
                              commentId: comment.id,
                            })
                          }
                          className="cursor-pointer rounded border border-rose-200 bg-white px-2 py-0.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                        >
                          Удалить
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

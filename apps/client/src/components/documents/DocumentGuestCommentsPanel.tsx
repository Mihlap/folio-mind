import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  useClearGuestCommentsMutation,
  useDeleteGuestCommentMutation,
  useListGuestCommentsQuery,
  useListShareLinksQuery,
  useUpdateGuestCommentStatusMutation,
  type GuestShareComment,
} from '@folio-mind/store';

import { GuestCommentCard } from './GuestCommentCard.js';

type Props = {
  documentId: string;
  versionId: string;
  versionReady: boolean;
  focusedCommentId?: string | null;
  onGoToComment?: (page: number, commentId: string) => void;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function groupByPage(items: GuestShareComment[]) {
  const byPage = new Map<number, typeof items>();
  for (const item of items) {
    const list = byPage.get(item.page) ?? [];
    list.push(item);
    byPage.set(item.page, list);
  }
  return [...byPage.entries()].sort((a, b) => a[0] - b[0]);
}

function CommentGroupList({
  grouped,
  focusedCommentId,
  itemRefs,
  formatWhen,
  onGoToComment,
  onResolve,
  onReopen,
  onDelete,
  canDelete,
  updating,
  deletingOne,
}: {
  grouped: ReturnType<typeof groupByPage>;
  focusedCommentId: string | null;
  itemRefs: MutableRefObject<Map<string, HTMLLIElement>>;
  formatWhen: (iso: string) => string;
  onGoToComment?: (page: number, commentId: string) => void;
  onResolve: (commentId: string, authorReply?: string) => Promise<void>;
  onReopen: (commentId: string) => Promise<void>;
  onDelete?: (commentId: string) => void;
  canDelete: boolean;
  updating: boolean;
  deletingOne: boolean;
}) {
  return (
    <ul className="space-y-3">
      {grouped.map(([page, comments]) => (
        <li key={page} className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
          <p className="mb-2 text-xs font-medium text-slate-800">Стр. {page}</p>
          <ul className="space-y-2">
            {comments.map((comment) => (
              <GuestCommentCard
                key={comment.id}
                comment={comment}
                focused={focusedCommentId === comment.id}
                formatWhen={formatWhen}
                itemRef={(el) => {
                  if (el) itemRefs.current.set(comment.id, el);
                  else itemRefs.current.delete(comment.id);
                }}
                onGoToComment={onGoToComment}
                onResolve={(authorReply) => onResolve(comment.id, authorReply)}
                onReopen={() => onReopen(comment.id)}
                onDelete={
                  canDelete ? () => onDelete?.(comment.id) : undefined
                }
                updating={updating}
                deleting={deletingOne}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function DocumentGuestCommentsPanel({
  documentId,
  versionId,
  versionReady,
  focusedCommentId = null,
  onGoToComment,
}: Props) {
  const itemRefs = useRef(new Map<string, HTMLLIElement>());
  const [resolvedExpanded, setResolvedExpanded] = useState(false);
  const { data, isLoading } = useListGuestCommentsQuery(
    { documentId, versionId },
    {
      skip: !versionReady || !versionId,
      refetchOnFocus: true,
      refetchOnReconnect: true,
    },
  );
  const { data: shareLinksData } = useListShareLinksQuery(documentId, {
    skip: !versionReady || !versionId,
  });
  const [updateStatus, { isLoading: updating }] = useUpdateGuestCommentStatusMutation();
  const [deleteComment, { isLoading: deletingOne }] = useDeleteGuestCommentMutation();
  const [clearComments, { isLoading: clearing }] = useClearGuestCommentsMutation();

  const canDelete = useMemo(() => {
    const links = shareLinksData?.items ?? [];
    if (links.length === 0) return true;
    return !links.some((link) => link.active && link.versionId === versionId);
  }, [shareLinksData?.items, versionId]);

  const openItems = useMemo(
    () => (data?.items ?? []).filter((item) => item.status === 'open'),
    [data?.items],
  );
  const resolvedItems = useMemo(
    () => (data?.items ?? []).filter((item) => item.status === 'resolved'),
    [data?.items],
  );
  const openGrouped = useMemo(() => groupByPage(openItems), [openItems]);
  const resolvedGrouped = useMemo(() => groupByPage(resolvedItems), [resolvedItems]);

  useEffect(() => {
    if (!focusedCommentId) return;
    const el = itemRefs.current.get(focusedCommentId);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusedCommentId]);

  async function handleResolve(commentId: string, authorReply?: string) {
    await updateStatus({
      documentId,
      versionId,
      commentId,
      status: 'resolved',
      authorReply: authorReply ?? null,
    }).unwrap();
  }

  async function handleReopen(commentId: string) {
    await updateStatus({
      documentId,
      versionId,
      commentId,
      status: 'open',
    }).unwrap();
  }

  function handleDelete(commentId: string) {
    void deleteComment({ documentId, versionId, commentId });
  }

  if (!versionReady) {
    return <p className="text-xs text-slate-500">Выберите готовую версию документа.</p>;
  }

  if (isLoading && openGrouped.length === 0 && resolvedGrouped.length === 0) {
    return <p className="text-sm text-slate-500">Загрузка замечаний…</p>;
  }

  if (openGrouped.length === 0 && resolvedGrouped.length === 0) {
    return (
      <p className="text-[11px] leading-snug text-slate-400">
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
          {openItems.length > 0 ? ` · открытых: ${openItems.length}` : ' · все обработаны'}
        </p>
        {canDelete && (data?.items.length ?? 0) > 0 && (
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

      {openGrouped.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-amber-900">Открытые</h4>
          <CommentGroupList
            grouped={openGrouped}
            focusedCommentId={focusedCommentId}
            itemRefs={itemRefs}
            formatWhen={formatWhen}
            onGoToComment={onGoToComment}
            onResolve={handleResolve}
            onReopen={handleReopen}
            onDelete={handleDelete}
            canDelete={canDelete}
            updating={updating}
            deletingOne={deletingOne}
          />
        </section>
      )}

      {resolvedGrouped.length > 0 && (
        <section className="space-y-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setResolvedExpanded((v) => !v)}
            className="flex w-full cursor-pointer items-center justify-between text-left text-xs font-semibold text-emerald-800"
          >
            <span>Решённые ({resolvedItems.length})</span>
            <span className="text-slate-400">{resolvedExpanded ? '▼' : '▶'}</span>
          </button>
          {resolvedExpanded && (
            <CommentGroupList
              grouped={resolvedGrouped}
              focusedCommentId={focusedCommentId}
              itemRefs={itemRefs}
              formatWhen={formatWhen}
              onResolve={handleResolve}
              onReopen={handleReopen}
              onDelete={handleDelete}
              canDelete={canDelete}
              updating={updating}
              deletingOne={deletingOne}
            />
          )}
        </section>
      )}
    </div>
  );
}

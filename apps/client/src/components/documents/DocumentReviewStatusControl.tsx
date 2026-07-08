import { useState } from 'react';
import {
  DOCUMENT_REVIEW_STATUSES,
  type DocumentReviewStatus,
  useUpdateDocumentReviewStatusMutation,
} from '@folio-mind/store';

const STATUS_LABEL: Record<DocumentReviewStatus, string> = {
  draft: 'Черновик',
  in_review: 'На согласовании',
  approved: 'Утверждено',
};

const STATUS_BADGE_CLASS: Record<DocumentReviewStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-200',
  in_review: 'bg-amber-50 text-amber-900 ring-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
};

type BadgeProps = {
  status: DocumentReviewStatus;
  className?: string;
};

export function DocumentReviewStatusBadge({ status, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${STATUS_BADGE_CLASS[status]} ${className}`}
      title={STATUS_LABEL[status]}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

type ControlProps = {
  documentId: string;
  reviewStatus: DocumentReviewStatus;
  reviewStatusChangedAt: string | null;
};

export function DocumentReviewStatusControl({
  documentId,
  reviewStatus,
  reviewStatusChangedAt,
}: ControlProps) {
  const [updateStatus, { isLoading }] = useUpdateDocumentReviewStatusMutation();
  const [error, setError] = useState<string | null>(null);

  async function handleChange(nextStatus: DocumentReviewStatus) {
    if (nextStatus === reviewStatus) return;
    setError(null);
    try {
      await updateStatus({ documentId, reviewStatus: nextStatus }).unwrap();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить статус');
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-800">Статус согласования</p>
        <DocumentReviewStatusBadge status={reviewStatus} />
      </div>
      <label className="block text-[11px] text-slate-600">
        Этап цикла с заказчиком
        <select
          value={reviewStatus}
          disabled={isLoading}
          onChange={(e) => void handleChange(e.target.value as DocumentReviewStatus)}
          className="mt-1 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
        >
          {DOCUMENT_REVIEW_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </select>
      </label>
      {reviewStatusChangedAt && (
        <p className="text-[10px] text-slate-500">
          Обновлено:{' '}
          {new Date(reviewStatusChangedAt).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function getDocumentReviewStatusLabel(status: DocumentReviewStatus): string {
  return STATUS_LABEL[status];
}

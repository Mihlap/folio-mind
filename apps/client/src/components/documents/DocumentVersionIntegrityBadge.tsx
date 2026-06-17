import { useState } from 'react';
import { useCompareVersionIntegrityQuery } from '@folio-mind/store';

export type VersionIntegrityStatus =
  | 'pending'
  | 'intact'
  | 'modified'
  | 'cannot_verify'
  | 'failed'
  | null
  | undefined;

export type IntegrityDetails = {
  revisionCount: number;
  hasPrevTrailer: boolean;
  creator: string | null;
  producer: string | null;
  creationDate: string | null;
  modDate: string | null;
  hasDigitalSignature: boolean;
  signals: Array<{ id: string; weight: string; message: string }>;
  analyzedWith: 'qpdf' | 'builtin';
};

const BADGE: Record<
  Exclude<VersionIntegrityStatus, null | undefined | 'pending'>,
  { label: string; className: string }
> = {
  intact: {
    label: 'структура OK',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
  },
  modified: {
    label: 'есть правки',
    className: 'bg-amber-50 text-amber-900 ring-amber-200/80',
  },
  cannot_verify: {
    label: 'не проверить',
    className: 'bg-slate-100 text-slate-600 ring-slate-200/80',
  },
  failed: {
    label: 'ошибка',
    className: 'bg-red-50 text-red-700 ring-red-200/80',
  },
};

const WEIGHT_COLOR: Record<string, string> = {
  high: 'text-red-700 bg-red-50',
  medium: 'text-amber-700 bg-amber-50',
  low: 'text-slate-600 bg-slate-50',
};

type Props = {
  status: VersionIntegrityStatus;
  summary?: string | null;
  score?: number | null;
  details?: IntegrityDetails | null;
  compact?: boolean;
  onShowDetail?: () => void;
};

export function DocumentVersionIntegrityBadge({
  status,
  summary,
  score,
  details,
  compact = false,
  onShowDetail,
}: Props) {
  const [showModal, setShowModal] = useState(false);

  if (!status || status === 'pending') {
    if (compact) return null;
    return (
      <span className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-400 ring-1 ring-slate-200/80">
        проверка…
      </span>
    );
  }

  const badge = BADGE[status];
  if (!badge) return null;

  const handleClick = () => {
    if (onShowDetail) {
      onShowDetail();
    } else if (details) {
      setShowModal(true);
    }
  };

  return (
    <>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={handleClick}
          className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 transition hover:opacity-80 ${badge.className}`}
          title="Подробнее о целостности"
        >
          {badge.label}
          {score != null && (
            <span className="ml-0.5 text-[9px] opacity-70">({score})</span>
          )}
        </button>
      </span>

      {showModal && details && (
        <IntegrityDetailModal
          status={status}
          summary={summary}
          score={score}
          details={details}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

type IntegrityCompareProps = {
  documentId: string;
  versionId: string;
  otherVersionId: string;
  skip?: boolean;
};

export function IntegrityCompareBadge({
  documentId,
  versionId,
  otherVersionId,
  skip = false,
}: IntegrityCompareProps) {
  const { data } = useCompareVersionIntegrityQuery(
    { documentId, versionId, otherVersionId },
    { skip: !versionId || !otherVersionId || skip || versionId === otherVersionId },
  );

  if (!data || !data.changed) return null;

  const aStatus = data.versionA.status;
  const bStatus = data.versionB.status;
  if (!aStatus || !bStatus || aStatus === bStatus) return null;

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2">
      <p className="text-xs font-medium text-amber-900">
        Статус целостности изменился
      </p>
      <p className="mt-0.5 text-[11px] text-amber-800">
        {aStatus} → {bStatus}
        {data.scoreDelta != null && ` (оценка: ${data.versionA.score} → ${data.versionB.score})`}
      </p>
    </div>
  );
}

function IntegrityDetailModal({
  status,
  summary,
  score,
  details,
  onClose,
}: {
  status: string;
  summary?: string | null;
  score?: number | null;
  details: IntegrityDetails;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">Проверка целостности PDF</h3>
          <button type="button" onClick={onClose} className="cursor-pointer text-lg text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-700">Статус:</span>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ${BADGE[status as keyof typeof BADGE]?.className ?? 'bg-slate-100 text-slate-600'}`}
            >
              {BADGE[status as keyof typeof BADGE]?.label ?? status}
            </span>
            {score != null && (
              <span className="text-xs text-slate-500">Оценка: {score}/100</span>
            )}
          </div>

          {summary && <p className="text-slate-600">{summary}</p>}

          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-xs">
            <div><span className="text-slate-500">Creator:</span> <span className="text-slate-700">{details.creator ?? '—'}</span></div>
            <div><span className="text-slate-500">Producer:</span> <span className="text-slate-700">{details.producer ?? '—'}</span></div>
            <div><span className="text-slate-500">Создан:</span> <span className="text-slate-700">{details.creationDate ?? '—'}</span></div>
            <div><span className="text-slate-500">Изменён:</span> <span className="text-slate-700">{details.modDate ?? '—'}</span></div>
            <div><span className="text-slate-500">Ревизий:</span> <span className="text-slate-700">{details.revisionCount}</span></div>
            <div><span className="text-slate-500">/Prev trailer:</span> <span className="text-slate-700">{details.hasPrevTrailer ? '✓' : '—'}</span></div>
            <div><span className="text-slate-500">Цифр. подпись:</span> <span className="text-slate-700">{details.hasDigitalSignature ? '✓' : '—'}</span></div>
            <div><span className="text-slate-500">Анализ:</span> <span className="text-slate-700">{details.analyzedWith}</span></div>
          </div>

          {details.signals.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-700">Сигналы:</p>
              <ul className="space-y-1">
                {details.signals.map((s) => (
                  <li
                    key={s.id}
                    className={`rounded px-2 py-1 text-xs ${WEIGHT_COLOR[s.weight] ?? 'text-slate-600 bg-slate-50'}`}
                  >
                    <span className="mr-1 font-medium">{s.weight}:</span> {s.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

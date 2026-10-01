import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FeatureHelpButton } from '../../components/ui/FeatureHelp.js';
import {
  useDeletePresentationMutation,
  useExportPresentationMutation,
  useListStandalonePresentationsQuery,
  type PresentationItem,
} from '@folio-mind/store';

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

export function PresentationsPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useListStandalonePresentationsQuery();
  const [remove] = useDeletePresentationMutation();
  const [exportPresentation] = useExportPresentationMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = data?.items ?? [];

  const handleExport = async (item: PresentationItem) => {
    setBusyId(item.id);
    setError(null);
    try {
      const result = await exportPresentation({ presentationId: item.id }).unwrap();
      setError(`PDF создаётся в отдельном документе: ${result.documentId}`);
    } catch {
      setError('Не удалось запустить экспорт в PDF');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (item: PresentationItem) => {
    if (!window.confirm(`Удалить презентацию «${item.title}»?`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      await remove({ presentationId: item.id }).unwrap();
    } catch {
      setError('Не удалось удалить презентацию');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Презентации</h1>
          <FeatureHelpButton title="Раздел «Презентации»">
            <p>
              Здесь живут презентации, созданные с чистого листа — без привязки к документу:
              титульные листы, раздатки и слайды из файлов медиатеки.
            </p>
            <p>
              Презентации, собранные из страниц документа, редактируются на странице этого документа
              — «Инструменты» → «Презентация».
            </p>
          </FeatureHelpButton>
        </div>
        <Link
          to="/app"
          className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← К документам
        </Link>
      </div>

      <div className="mb-4">
        <button
          type="button"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
          onClick={() => navigate('/app/presentations/new')}
        >
          Создать презентацию с чистого листа
        </button>
      </div>

      {error ? <p className="mb-4 text-xs text-slate-600">{error}</p> : null}

      {isLoading ? (
        <p className="text-sm text-slate-500">Загружаем презентации…</p>
      ) : items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Пока нет ни одной презентации. Создайте первую — начните с пустого слайда или файла из
          медиатеки.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-md border border-slate-200 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                <p className="text-xs text-slate-500">
                  {item.slides?.length ?? 0} сл.{item.slides?.length === 1 ? '' : 'а'} · обновлено{' '}
                  {formatDate(item.updatedAt)}
                </p>
              </div>
              <button
                type="button"
                className="rounded border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-40"
                onClick={() => navigate(`/app/presentations/${item.id}`)}
                disabled={busyId === item.id}
              >
                Открыть
              </button>
              <button
                type="button"
                className="rounded border border-slate-300 px-2.5 py-1 text-xs disabled:opacity-40"
                onClick={() => void handleExport(item)}
                disabled={busyId === item.id || (item.slides?.length ?? 0) === 0}
              >
                {busyId === item.id ? '…' : 'Черновик PDF'}
              </button>
              <button
                type="button"
                className="rounded border border-red-200 px-2.5 py-1 text-xs text-red-600 disabled:opacity-40"
                onClick={() => void handleDelete(item)}
                disabled={busyId === item.id}
              >
                Удалить
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

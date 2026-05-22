import { useMeQuery } from '@folio-mind/store';

export function DashboardPage() {
  const { data: me, isLoading } = useMeQuery();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-slate-900">Документы</h1>
      <p className="mt-1 text-slate-500">
        Фаза 1: загрузка PDF, просмотр и ИИ-проверка — следующий шаг разработки.
      </p>

      <div className="mt-10 rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-folio-100 text-2xl">
          📄
        </div>
        <h2 className="mt-4 text-lg font-medium text-slate-800">Пока нет документов</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
          Перетащите PDF сюда или нажмите «Загрузить» — появится в фазе 1 вместе с presigned
          загрузкой в S3 и просмотром.
        </p>
        <button
          type="button"
          disabled
          className="mt-6 cursor-not-allowed rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-400"
        >
          Загрузить PDF (скоро)
        </button>
      </div>

      {!isLoading && me && (
        <p className="mt-6 text-xs text-slate-400">
          Workspace · tenant {me.tenantId.slice(0, 8)}…
        </p>
      )}
    </div>
  );
}

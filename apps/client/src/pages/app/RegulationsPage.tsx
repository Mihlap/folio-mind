import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FeatureHelpButton } from '../../components/ui/FeatureHelp.js';
import {
  useCreateRagSourceMutation,
  useDeleteRagSourceMutation,
  useListRagSourcesQuery,
  useUploadRagSourceFileMutation,
} from '@folio-mind/store';
const STATUS_LABEL: Record<string, string> = {
  pending_upload: 'ожидает файл',
  processing: 'обрабатывается',
  ready: 'готов к проверке',
  failed: 'ошибка обработки',
};
export function RegulationsPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data, refetch } = useListRagSourcesQuery(undefined, { pollingInterval: 5000 });
  const [createSource] = useCreateRagSourceMutation();
  const [uploadFile] = useUploadRagSourceFileMutation();
  const [deleteSource] = useDeleteRagSourceMutation();
  async function handleFile(file: File) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.pdf') && !lower.endsWith('.txt')) {
      setError('Поддерживаются PDF и TXT');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const title = file.name.replace(/\.(pdf|txt)$/i, '');
      const created = await createSource({
        title,
        fileName: file.name,
        mimeType: file.type || (lower.endsWith('.pdf') ? 'application/pdf' : 'text/plain'),
        size: file.size,
      }).unwrap();
      await uploadFile({ sourceId: created.sourceId, file }).unwrap();
      await refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить регламент');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Регламенты</h1>
          <FeatureHelpButton title="Раздел «Регламенты»">
            <p>
              Сюда загружают внутренние правила, типовые договоры и шаблоны формулировок вашей
              компании.
            </p>
            <p>
              После загрузки система читает файл и сохраняет его по частям. Эти части используются
              на странице документа в блоке «Сверка с регламентом»: там договор сравнивается с
              вашими стандартами, и вы видите, где текст расходится с принятыми у вас правилами.
            </p>
            <p>Файлы видят только пользователи вашей организации.</p>
          </FeatureHelpButton>
        </div>
        <Link to="/app" className="text-sm text-folio-600 hover:underline">
          ← Документы
        </Link>
      </div>

      <p className="mb-4 max-w-2xl text-sm text-slate-600">
        Загрузите PDF или TXT с вашими правилами и шаблонами. Когда статус файла станет «готов», его
        можно использовать при проверке договоров на странице документа.
      </p>

      <div className="max-w-xl rounded-2xl border border-dashed border-slate-300 bg-white p-5">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="cursor-pointer rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:opacity-50"
        >
          {uploading ? 'Загрузка…' : 'Загрузить PDF или TXT'}
        </button>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <ul className="mt-8 max-w-2xl space-y-2">
        {data?.items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-900">{item.title}</p>
              <p className="text-xs text-slate-500">
                {STATUS_LABEL[item.status] ?? item.status}
                {item.chunkCount > 0 ? ` · ${item.chunkCount} фрагм.` : ''}
              </p>
            </div>
            <button
              type="button"
              disabled={uploading}
              onClick={async () => {
                if (!window.confirm(`Удалить «${item.title}»?`)) return;
                await deleteSource(item.id).unwrap();
                await refetch();
              }}
              className="cursor-pointer shrink-0 text-xs text-red-600 hover:underline disabled:opacity-50"
            >
              Удалить
            </button>
          </li>
        ))}
        {data?.items.length === 0 && !uploading && (
          <li className="text-sm text-slate-400">
            Пока нет файлов. Загрузите первый регламент или шаблон — без этого сверка договора не
            сработает.
          </li>
        )}
      </ul>
    </div>
  );
}

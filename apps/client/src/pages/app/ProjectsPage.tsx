import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCreateProjectMutation,
  useDeleteProjectMutation,
  useListProjectsQuery,
} from '@folio-mind/store';
import { ProjectRenameControl } from '../../components/projects/ProjectRenameControl.js';

export function ProjectsPage() {
  const { data, refetch } = useListProjectsQuery();
  const [createProject, { isLoading: creating }] = useCreateProjectMutation();
  const [deleteProject] = useDeleteProjectMutation();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setError(null);
    try {
      await createProject({ name: trimmed }).unwrap();
      setName('');
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать проект');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Проекты</h1>
        <Link
          to="/app"
          className="text-sm text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline"
        >
          ← К документам
        </Link>
      </div>

      <p className="mb-6 max-w-2xl text-sm leading-relaxed text-slate-500">
        Папки для группировки документов одного объекта или заказа. Привязку можно менять на
        странице документа или при загрузке внутри проекта.
      </p>

      <form
        onSubmit={handleCreate}
        className="mb-8 flex max-w-md flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-4"
      >
        <label className="min-w-0 flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-600">Новый проект</span>
          <input
            type="text"
            value={name}
            maxLength={120}
            placeholder="ЖК «Северный», офис на Ленина…"
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700 disabled:opacity-50"
        >
          Создать
        </button>
      </form>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <ul className="space-y-3">
        {data?.items.map((project) => (
          <li
            key={project.id}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 sm:pr-2 sm:pl-0 sm:py-0"
          >
            <Link
              to={`/app/projects/${project.id}`}
              className="min-w-0 flex-1 px-2 py-2 sm:px-4 sm:py-3"
            >
              <span className="font-medium text-slate-900">{project.name}</span>
              <span className="mt-0.5 block text-xs text-slate-400">
                {project.documentCount}{' '}
                {project.documentCount === 1
                  ? 'документ'
                  : project.documentCount >= 2 && project.documentCount <= 4
                    ? 'документа'
                    : 'документов'}
              </span>
            </Link>
            <ProjectRenameControl projectId={project.id} name={project.name} />
            <button
              type="button"
              title="Удалить проект"
              className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50"
              onClick={async () => {
                if (
                  !window.confirm(
                    `Удалить проект «${project.name}»?\n\nДокументы останутся, привязка к проекту снимется.`,
                  )
                ) {
                  return;
                }
                try {
                  await deleteProject(project.id).unwrap();
                  await refetch();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Ошибка удаления');
                }
              }}
            >
              Удалить
            </button>
          </li>
        ))}
        {data?.items.length === 0 && (
          <li className="text-sm text-slate-400">Пока нет проектов — создайте первый выше</li>
        )}
      </ul>
    </div>
  );
}

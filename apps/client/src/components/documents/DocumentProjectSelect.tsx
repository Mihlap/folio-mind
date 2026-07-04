import {
  useListProjectsQuery,
  useUpdateDocumentProjectMutation,
} from '@folio-mind/store';

type DocumentProjectSelectProps = {
  documentId: string;
  projectId: string | null;
  projectName: string | null;
  compact?: boolean;
};

export function DocumentProjectSelect({
  documentId,
  projectId,
  projectName,
  compact = false,
}: DocumentProjectSelectProps) {
  const { data: projects } = useListProjectsQuery();
  const [updateProject, { isLoading }] = useUpdateDocumentProjectMutation();

  return (
    <label
      className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'} text-slate-600`}
    >
      <span className={compact ? 'sr-only' : 'shrink-0'}>Проект:</span>
      <select
        value={projectId ?? ''}
        disabled={isLoading}
        onChange={async (e) => {
          const next = e.target.value || null;
          if (next === (projectId ?? '')) return;
          try {
            await updateProject({ documentId, projectId: next }).unwrap();
          } catch {
            /* RTK handles error state */
          }
        }}
        className={`min-w-0 cursor-pointer rounded-lg border border-slate-200 bg-white text-slate-800 disabled:opacity-50 ${
          compact ? 'max-w-[9rem] px-1.5 py-0.5 text-xs' : 'max-w-[12rem] px-2 py-1 text-sm'
        }`}
        title={projectName ? `Проект: ${projectName}` : 'Без проекта'}
      >
        <option value="">Без проекта</option>
        {projects?.items.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

import { useState } from 'react';
import { useUpdateProjectMutation } from '@folio-mind/store';

type ProjectRenameControlProps = {
  projectId: string;
  name: string;
  variant?: 'list' | 'header';
  onRenamed?: (name: string) => void;
};

export function ProjectRenameControl({
  projectId,
  name,
  variant = 'list',
  onRenamed,
}: ProjectRenameControlProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [updateProject, { isLoading }] = useUpdateProjectMutation();

  const startEdit = () => {
    setValue(name);
    setError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setValue(name);
    setError(null);
    setEditing(false);
  };

  const save = async () => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Название не может быть пустым');
      return;
    }
    if (trimmed === name) {
      setEditing(false);
      return;
    }
    setError(null);
    try {
      await updateProject({ projectId, name: trimmed }).unwrap();
      onRenamed?.(trimmed);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось переименовать');
    }
  };

  if (editing) {
    return (
      <div className={variant === 'header' ? 'flex min-w-0 flex-1 flex-wrap items-center gap-2' : 'flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center'}>
        <input
          type="text"
          value={value}
          maxLength={120}
          autoFocus
          disabled={isLoading}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void save();
            if (e.key === 'Escape') cancelEdit();
          }}
          className={`min-w-0 rounded-lg border border-slate-200 px-2 py-1 text-sm ${
            variant === 'header' ? 'max-w-md flex-1 font-semibold' : 'flex-1'
          }`}
        />
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void save()}
            className="cursor-pointer rounded-lg bg-folio-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-folio-700 disabled:opacity-50"
          >
            Сохранить
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={cancelEdit}
            className="cursor-pointer rounded-lg px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-100"
          >
            Отмена
          </button>
        </div>
        {error && <p className="w-full text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (variant === 'header') {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{name}</h1>
        <button
          type="button"
          onClick={startEdit}
          className="cursor-pointer rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        >
          Переименовать
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      title="Переименовать проект"
      onClick={startEdit}
      className="shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
    >
      Переименовать
    </button>
  );
}

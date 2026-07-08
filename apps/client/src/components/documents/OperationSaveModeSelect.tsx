export type OperationSaveMode = 'new_version' | 'replace_current';

type Props = {
  value: OperationSaveMode;
  onChange: (value: OperationSaveMode) => void;
  versionNumber?: number;
  canReplaceCurrent: boolean;
  disabled?: boolean;
};

export function OperationSaveModeSelect({
  value,
  onChange,
  versionNumber,
  canReplaceCurrent,
  disabled = false,
}: Props) {
  return (
    <fieldset className="space-y-1" disabled={disabled}>
      <legend className="text-[10px] font-medium text-slate-600">Куда сохранить</legend>
      <div className="flex flex-col gap-1 text-[11px] text-slate-700">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="operation-save-mode"
            checked={value === 'new_version'}
            onChange={() => onChange('new_version')}
          />
          Новая версия
        </label>
        <label
          className={[
            'flex items-center gap-2',
            canReplaceCurrent ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
          ].join(' ')}
        >
          <input
            type="radio"
            name="operation-save-mode"
            disabled={!canReplaceCurrent}
            checked={value === 'replace_current'}
            onChange={() => onChange('replace_current')}
          />
          Текущая версия{versionNumber != null ? ` (v${versionNumber})` : ''}
        </label>
      </div>
      {!canReplaceCurrent && (
        <p className="text-[10px] text-slate-500">
          Заменить можно только последнюю версию в списке слева.
        </p>
      )}
    </fieldset>
  );
}

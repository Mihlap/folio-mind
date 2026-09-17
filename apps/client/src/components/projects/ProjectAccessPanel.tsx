import { useMemo, useState } from 'react';
import {
  DOCUMENT_MEMBER_ROLES,
  DOCUMENT_ROLE_LABELS,
  type DocumentMemberRole,
  useAddProjectMemberMutation,
  useListProjectMembersQuery,
  useListTenantUsersQuery,
  useRemoveProjectMemberMutation,
  useUpdateProjectMemberMutation,
} from '@folio-mind/store';

const ROLE_HINTS: Record<DocumentMemberRole, string> = {
  editor: 'Версии, макет, операции PDF и правки',
  commenter: 'Текущая версия и комментарии команды',
  viewer: 'Только просмотр текущей версии',
};

function getMutationError(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err && 'data' in err) {
    const data = (err as { data?: unknown }).data;
    if (typeof data === 'string') return data;
    if (typeof data === 'object' && data) {
      if ('error' in data && typeof (data as { error: unknown }).error === 'string') {
        return (data as { error: string }).error;
      }
      if ('message' in data && typeof (data as { message: unknown }).message === 'string') {
        return (data as { message: string }).message;
      }
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function ProjectAccessPanel({ projectId }: { projectId: string }) {
  const { data, isLoading, isError } = useListProjectMembersQuery(projectId, {
    skip: !projectId,
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<DocumentMemberRole>('editor');
  const [userQuery, setUserQuery] = useState('');
  const { data: tenantUsers } = useListTenantUsersQuery(
    userQuery.trim() ? { q: userQuery.trim() } : undefined,
    { skip: !userQuery.trim() },
  );
  const [addMember, { isLoading: adding }] = useAddProjectMemberMutation();
  const [updateMember] = useUpdateProjectMemberMutation();
  const [removeMember] = useRemoveProjectMemberMutation();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const memberEmails = useMemo(
    () => new Set((data?.members ?? []).map((member) => member.email.toLowerCase())),
    [data?.members],
  );

  if (isLoading) {
    return <p className="text-xs text-slate-500">Загрузка доступа команды…</p>;
  }

  if (isError || !data) {
    return (
      <p className="text-[11px] leading-snug text-slate-500">
        Управление доступом команды проекта доступно владельцу проекта или владельцу любого
        документа в проекте.
      </p>
    );
  }

  const canManage = data.canManage;

  async function handleAdd() {
    if (!email.trim()) return;
    setError(null);
    setNotice(null);
    try {
      await addMember({ projectId, email: email.trim(), role }).unwrap();
      setEmail('');
      setUserQuery('');
      setNotice('Участник добавлен — он получит доступ ко всем документам проекта');
    } catch (err) {
      setError(getMutationError(err, 'Не удалось добавить участника'));
    }
  }

  return (
    <div className="space-y-4 text-sm text-slate-700">
      <p className="text-[11px] leading-snug text-slate-500">
        Участники проекта получают доступ ко <strong>всем документам</strong> внутри проекта с
        выбранной ролью.
      </p>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-700">Участники проекта</p>
        <ul className="space-y-2">
          {data.owner && (
            <li className="flex flex-wrap items-center gap-2 rounded-lg border border-folio-200 bg-folio-50/50 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-800">
                  {data.owner.name ?? data.owner.email}
                </p>
                <p className="truncate text-[11px] text-slate-500">{data.owner.email}</p>
              </div>
              <span className="text-xs font-medium text-folio-800">
                {DOCUMENT_ROLE_LABELS.owner}
              </span>
            </li>
          )}
          {data.members.map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-800">
                  {member.name ?? member.email}
                </p>
                <p className="truncate text-[11px] text-slate-500">{member.email}</p>
              </div>
              {canManage ? (
                <>
                  <select
                    value={member.role}
                    onChange={(e) =>
                      void updateMember({
                        projectId,
                        userId: member.userId,
                        role: e.target.value as DocumentMemberRole,
                      })
                    }
                    className="rounded border border-slate-200 px-2 py-1 text-xs"
                  >
                    {DOCUMENT_MEMBER_ROLES.map((item) => (
                      <option key={item} value={item}>
                        {DOCUMENT_ROLE_LABELS[item]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      void removeMember({ projectId, userId: member.userId })
                    }
                    className="cursor-pointer rounded px-2 py-1 text-xs text-rose-700 hover:bg-white"
                  >
                    Убрать
                  </button>
                </>
              ) : (
                <span className="text-xs text-slate-600">{DOCUMENT_ROLE_LABELS[member.role]}</span>
              )}
            </li>
          ))}
          {data.members.length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-2 py-2 text-xs text-slate-500">
              Пока нет участников — добавьте коллег из рабочего пространства.
            </li>
          )}
        </ul>
      </div>

      {canManage && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium text-slate-700">Добавить коллегу</p>
          <p className="text-[11px] leading-snug text-slate-500">
            Коллега должен быть в вашем рабочем пространстве. Он сразу получит доступ ко всем
            документам проекта.
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setUserQuery(e.target.value);
            }}
            placeholder="email@бюро.ru"
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
          />
          {tenantUsers && tenantUsers.items.length > 0 && (
            <ul className="max-h-24 overflow-y-auto rounded border border-slate-100 bg-slate-50 text-xs">
              {tenantUsers.items
                .filter((user) => !memberEmails.has(user.email.toLowerCase()))
                .filter((user) => user.id !== data.owner?.userId)
                .map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      className="w-full cursor-pointer px-2 py-1 text-left hover:bg-white"
                      onClick={() => setEmail(user.email)}
                    >
                      {user.name ? `${user.name} · ` : ''}
                      {user.email}
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <label className="block text-xs text-slate-600">
            Роль в проекте
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as DocumentMemberRole)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
            >
              {DOCUMENT_MEMBER_ROLES.map((item) => (
                <option key={item} value={item}>
                  {DOCUMENT_ROLE_LABELS[item]} — {ROLE_HINTS[item]}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={adding || !email.trim()}
            onClick={() => void handleAdd()}
            className="cursor-pointer rounded-lg bg-folio-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-folio-700 disabled:opacity-50"
          >
            {adding ? 'Добавление…' : 'Добавить участника'}
          </button>
        </div>
      )}

      {notice && <p className="text-xs text-emerald-700">{notice}</p>}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}
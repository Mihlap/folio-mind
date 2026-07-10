import { useMemo, useState } from 'react';
import {
  DOCUMENT_MEMBER_ROLES,
  DOCUMENT_ROLE_LABELS,
  roleHasCapability,
  type DocumentAccessRole,
  type DocumentMemberRole,
  useAddDocumentMemberMutation,
  useCreateMemberInviteLinkMutation,
  useListDocumentMembersQuery,
  useListPendingMemberInvitesQuery,
  useListTenantUsersQuery,
  useRemoveDocumentMemberMutation,
  useRevokePendingMemberInviteMutation,
  useUpdateDocumentMemberMutation,
  useUpdatePendingMemberInviteMutation,
} from '@folio-mind/store';

const ROLE_HINTS: Record<DocumentMemberRole, string> = {
  editor: 'Макет, операции PDF, ссылки, статусы',
  commenter: 'Просмотр и заметки команды',
  viewer: 'Только просмотр в браузере',
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

function formatExpires(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type Props = {
  documentId: string;
};

export function DocumentAccessPanel({ documentId }: Props) {
  const { data, isLoading } = useListDocumentMembersQuery(documentId);
  const { data: pendingData, isLoading: pendingLoading } = useListPendingMemberInvitesQuery(
    documentId,
    { skip: !data || !roleHasCapability((data.myRole ?? 'viewer') as DocumentAccessRole, 'manage_members') },
  );
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<DocumentMemberRole>('editor');
  const [userQuery, setUserQuery] = useState('');
  const { data: tenantUsers } = useListTenantUsersQuery(
    userQuery.trim() ? { q: userQuery.trim() } : undefined,
    { skip: !userQuery.trim() },
  );
  const [addMember, { isLoading: adding }] = useAddDocumentMemberMutation();
  const [createInviteLink, { isLoading: creatingInvite }] = useCreateMemberInviteLinkMutation();
  const [updateMember] = useUpdateDocumentMemberMutation();
  const [removeMember] = useRemoveDocumentMemberMutation();
  const [updatePendingInvite] = useUpdatePendingMemberInviteMutation();
  const [revokePendingInvite] = useRevokePendingMemberInviteMutation();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const myRole = (data?.myRole ?? 'viewer') as DocumentAccessRole;
  const canManage = roleHasCapability(myRole, 'manage_members');

  const memberEmails = useMemo(
    () => new Set((data?.members ?? []).map((member) => member.email.toLowerCase())),
    [data?.members],
  );

  const activePendingInvites = pendingData?.items.filter((item) => item.active) ?? [];
  const inactivePendingInvites = pendingData?.items.filter((item) => !item.active) ?? [];

  if (isLoading) {
    return <p className="text-xs text-slate-500">Загрузка доступа…</p>;
  }

  async function handleAdd() {
    if (!email.trim()) return;
    setError(null);
    setNotice(null);
    try {
      await addMember({ documentId, email: email.trim(), role }).unwrap();
      setEmail('');
      setUserQuery('');
      setNotice('Участник добавлен');
    } catch (err) {
      setError(getMutationError(err, 'Не удалось добавить участника'));
    }
  }

  async function handleCreateInviteLink() {
    if (!email.trim()) return;
    setError(null);
    setNotice(null);
    try {
      const res = await createInviteLink({
        documentId,
        email: email.trim(),
        role,
      }).unwrap();
      if (await copyText(res.inviteUrl)) {
        setNotice('Ссылка для присоединения создана и скопирована');
      } else {
        setNotice('Ссылка создана — скопируйте её в списке ожидающих ниже');
      }
      setEmail('');
      setUserQuery('');
    } catch (err) {
      setError(getMutationError(err, 'Не удалось создать ссылку приглашения'));
    }
  }

  async function handleCopyInvite(url: string) {
    setNotice((await copyText(url)) ? 'Ссылка скопирована' : 'Не удалось скопировать');
  }

  return (
    <div className="space-y-4 text-sm text-slate-700">
      <p className="text-[11px] leading-snug text-slate-500">
        Для <strong>коллег с аккаунтом Folio Mind</strong> в вашем рабочем пространстве. Это не
        гостевая ссылка для заказчика.
      </p>
      <p className="text-[11px] text-slate-600">
        Ваша роль: <strong>{DOCUMENT_ROLE_LABELS[myRole]}</strong>
      </p>

      <div className="space-y-2">
        <p className="text-xs font-medium text-slate-700">Участники документа</p>
        <ul className="space-y-2">
          {data?.owner && (
            <li className="flex flex-wrap items-center gap-2 rounded-lg border border-folio-200 bg-folio-50/50 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-800">
                  {data.owner.name ?? data.owner.email}
                </p>
                <p className="truncate text-[11px] text-slate-500">{data.owner.email}</p>
              </div>
              <span className="text-xs font-medium text-folio-800">{DOCUMENT_ROLE_LABELS.owner}</span>
            </li>
          )}
          {(data?.members ?? []).map((member) => (
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
                        documentId,
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
                    onClick={() => void removeMember({ documentId, userId: member.userId })}
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
        </ul>
      </div>

      {canManage && (
        <>
          {!pendingLoading && activePendingInvites.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">Ожидают присоединения</p>
              <ul className="space-y-2">
                {activePendingInvites.map((invite) => (
                  <li
                    key={invite.id}
                    className="rounded-lg border border-amber-200 bg-amber-50/60 px-2 py-2"
                  >
                    <p className="truncate text-xs font-medium text-slate-800">
                      {invite.email ?? 'Любой email по ссылке'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Действует до {formatExpires(invite.expiresAt)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <select
                        value={invite.role}
                        onChange={(e) =>
                          void updatePendingInvite({
                            documentId,
                            inviteId: invite.id,
                            role: e.target.value as DocumentMemberRole,
                          })
                        }
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                      >
                        {DOCUMENT_MEMBER_ROLES.map((item) => (
                          <option key={item} value={item}>
                            {DOCUMENT_ROLE_LABELS[item]}
                          </option>
                        ))}
                      </select>
                      {invite.inviteUrl ? (
                        <button
                          type="button"
                          onClick={() => void handleCopyInvite(invite.inviteUrl!)}
                          className="cursor-pointer text-xs font-medium text-folio-700 hover:underline"
                        >
                          Скопировать ссылку
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500">
                          Ссылка недоступна — создайте новую
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void revokePendingInvite({ documentId, inviteId: invite.id })}
                        className="cursor-pointer text-xs text-rose-700 hover:underline"
                      >
                        Отозвать
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!pendingLoading && inactivePendingInvites.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-slate-400">Истёкшие приглашения</p>
              <ul className="space-y-1 text-[11px] text-slate-400">
                {inactivePendingInvites.slice(0, 5).map((invite) => (
                  <li key={invite.id}>
                    {invite.email ?? 'без email'} · истекло {formatExpires(invite.expiresAt)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
            <p className="text-xs font-medium text-slate-700">Добавить коллегу</p>
            <p className="text-[11px] leading-snug text-slate-500">
              <strong>Пригласить</strong> — коллега уже в вашем рабочем пространстве.{' '}
              <strong>Ссылка для присоединения</strong> — нужна регистрация или вход; ссылку можно
              скопировать снова в списке выше.
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
            {tenantUsers?.items && tenantUsers.items.length > 0 && (
              <ul className="max-h-24 overflow-y-auto rounded border border-slate-100 bg-slate-50 text-xs">
                {tenantUsers.items
                  .filter((user) => !memberEmails.has(user.email.toLowerCase()))
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
              Роль в команде
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
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={adding || !email.trim()}
                onClick={() => void handleAdd()}
                className="cursor-pointer rounded-lg bg-folio-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-folio-700 disabled:opacity-50"
              >
                {adding ? 'Добавление…' : 'Пригласить'}
              </button>
              <button
                type="button"
                disabled={creatingInvite || !email.trim()}
                onClick={() => void handleCreateInviteLink()}
                className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {creatingInvite ? 'Создание…' : 'Ссылка для присоединения'}
              </button>
            </div>
          </div>
        </>
      )}

      {notice && <p className="text-xs text-emerald-700">{notice}</p>}
      {error && <p className="text-xs text-rose-700">{error}</p>}
    </div>
  );
}

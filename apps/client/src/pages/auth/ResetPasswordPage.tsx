import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useResetPasswordMutation } from '@folio-mind/store';
import { Button } from '../../components/ui/Button.js';
import { PasswordInput } from '../../components/auth/PasswordInput.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token') ?? '', [params]);
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);
  const [resetPassword, { isLoading, error }] = useResetPasswordMutation();
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setDone(false);
    try {
      await resetPassword({ token, newPassword }).unwrap();
      setDone(true);
    } catch {}
  }
  return (
    <AuthLayout title="Сброс пароля" subtitle="Задайте новый пароль">
      {!token && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          Нет токена сброса. Откройте ссылку из письма ещё раз.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <PasswordInput
          label="Новый пароль (мин. 8)"
          value={newPassword}
          onChange={setNewPassword}
          required
          minLength={8}
          disabled={!token}
          autoComplete="new-password"
        />

        {done && (
          <p className="text-sm text-emerald-700">
            Пароль обновлён. Теперь можно войти с новым паролем.
          </p>
        )}

        {error && (
          <p className="text-sm text-red-600">
            Не удалось сбросить пароль. Возможно, ссылка устарела. Запросите новую.
          </p>
        )}

        <Button type="submit" className="w-full" disabled={isLoading || !token}>
          {isLoading ? 'Сохраняем…' : 'Сохранить пароль'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link to="/forgot-password" className="font-medium text-folio-600 hover:underline">
          Запросить новую ссылку
        </Link>
      </p>
    </AuthLayout>
  );
}

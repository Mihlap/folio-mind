import { FormEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useResetPasswordMutation } from '@folio-mind/store';
import { Button } from '../components/Button';
import { AuthLayout } from './LoginPage';

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
    } catch {
  
    }
  }

  return (
    <AuthLayout title="Сброс пароля" subtitle="Задайте новый пароль">
      {!token && (
        <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
          Нет токена сброса. Откройте ссылку из письма ещё раз.
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Новый пароль (мин. 8)</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            disabled={!token}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 outline-none ring-folio-500 focus:border-folio-500 focus:ring-2 disabled:opacity-50"
          />
        </label>

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


import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useVerifyEmailMutation } from '@folio-mind/store';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { getAuthErrorMessage } from '../../lib/auth/authErrors.js';
import { notifyEmailVerified } from '../../lib/auth/authCrossTab.js';
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [verifyEmail, { isLoading, error }] = useVerifyEmailMutation();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!token) return;
    void verifyEmail({ token })
      .unwrap()
      .then(() => {
        notifyEmailVerified();
        setDone(true);
      })
      .catch(() => {});
  }, [token, verifyEmail]);
  if (!token) {
    return (
      <AuthLayout title="Подтверждение email" subtitle="Ссылка недействительна">
        <p className="text-sm text-red-600">В ссылке нет токена. Запросите письмо повторно.</p>
        <Link to="/login" className="mt-4 block text-center text-sm font-medium text-folio-600">
          На страницу входа
        </Link>
      </AuthLayout>
    );
  }
  if (done) {
    return (
      <AuthLayout title="Спасибо!" subtitle="Почта подтверждена">
        <p className="text-sm text-slate-600">
          Можете закрыть эту вкладку и вернуться на страницу регистрации или войти в аккаунт.
        </p>
        <Link
          to="/login"
          className="mt-6 flex w-full items-center justify-center rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white shadow-md shadow-folio-600/25 hover:bg-folio-700"
        >
          Войти
        </Link>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Подтверждение email" subtitle="Проверяем ссылку…">
      {isLoading && <p className="text-sm text-slate-500">Подтверждаем…</p>}
      {error && (
        <p className="text-sm text-red-600">
          {getAuthErrorMessage(error, 'Не удалось подтвердить email')}
        </p>
      )}
      {!isLoading && error && (
        <Link
          to="/login"
          className="mt-4 flex w-full items-center justify-center rounded-lg bg-folio-600 px-4 py-2 text-sm font-medium text-white hover:bg-folio-700"
        >
          На страницу входа
        </Link>
      )}
    </AuthLayout>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { setCredentials, useVerifyEmailMutation } from '@folio-mind/store';
import { useAppDispatch } from '../../hooks/index.js';
import { Button } from '../../components/ui/Button.js';
import { AuthLayout } from '../../components/layout/AuthLayout.js';
import { getAuthErrorMessage } from '../../lib/auth/authErrors.js';
import { notifyEmailVerified } from '../../lib/auth/authCrossTab.js';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [verifyEmail, { isLoading, error }] = useVerifyEmailMutation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) return;
    void verifyEmail({ token })
      .unwrap()
      .then((res) => {
        dispatch(setCredentials({ token: res.token, user: res.user }));
        notifyEmailVerified();
        setDone(true);
        navigate('/app', { replace: true });
      })
      .catch(() => {});
  }, [token, verifyEmail, dispatch, navigate]);

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
      <AuthLayout title="Готово" subtitle="Email подтверждён">
        <p className="text-sm text-slate-600">Перенаправляем в приложение…</p>
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
        <Button type="button" className="mt-4 w-full" onClick={() => navigate('/login')}>
          На страницу входа
        </Button>
      )}
    </AuthLayout>
  );
}
